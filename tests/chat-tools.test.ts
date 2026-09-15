import { describe, expect, it } from "vitest";
import { TOOL_DEFINITIONS, runTool } from "../lib/chat/tools";

/**
 * The copilot's tools. The line that matters most is the one between reading
 * and recording: no tool may create anything on its own.
 */

const ctx = {
  analysis: {
    score: { total: 68 },
    workflow: { gate: "NEEDS_HUMAN" },
    claimValueUnderReviewLkr: 4.2,
    dataMode: "SYNTHETIC_DEMO",
    mode: "DEMO_FALLBACK",
    findings: [
      { id: "supplier", title: "Supplier VAT status", description: "Stale", ruleId: "R1", amountLkrM: 1.9, status: "open" },
    ],
  },
  workspace: {
    activeProfileId: "P1",
    profiles: [{ id: "P1", tin: "134857291" }],
    vatTransactions: [],
  },
} as never;

const parse = (raw: string) => JSON.parse(raw);

describe("the tool surface", () => {
  it("exposes only the intended tools", () => {
    expect(TOOL_DEFINITIONS.map((t) => t.function.name).sort()).toEqual([
      "calculate_vat",
      "check_invoice_direction",
      "draft_ledger_entry",
      "draft_tax_invoice",
      "find_invoices",
      "get_case_position",
      "get_period_position",
      "get_schedule_status",
      "lookup_rule",
    ]);
  });

  it("names every write-shaped tool a draft, so the model cannot read it as issuing", () => {
    for (const tool of TOOL_DEFINITIONS) {
      if (tool.function.name.startsWith("draft_")) {
        expect(tool.function.description).toMatch(/review and save|issues nothing|records nothing/i);
      }
    }
  });

  it("refuses an unknown tool instead of guessing", () => {
    expect(parse(runTool("delete_everything", {}, ctx).content).error).toMatch(/unknown tool/i);
  });
});

describe("reading and calculating", () => {
  it("reports the case position from the run, not from the model", () => {
    const r = parse(runTool("get_case_position", {}, ctx).content);
    expect(r.readinessScore).toBe(68);
    expect(r.gate).toBe("NEEDS_HUMAN");
    expect(r.openBlockers).toHaveLength(1);
  });

  it("computes VAT deterministically", () => {
    const r = parse(runTool("calculate_vat", { netAmountLkr: 450_000, treatment: "STANDARD_18" }, ctx).content);
    expect(r.vatAmountLkr).toBe(81_000);
    expect(r.grossAmountLkr).toBe(531_000);
  });

  it("returns the rule pack with its effective date and sources", () => {
    const r = parse(runTool("lookup_rule", { topic: "invoice_format" }, ctx).content);
    expect(r.effectiveFrom).toBe("2026-10-01");
    expect(r.sourceIds).toContain("GZ-2500-106");
  });

  it("tells a purchase from a sale using the business's own TIN", () => {
    const sale = parse(runTool("check_invoice_direction", { sellerTin: "134857291", buyerTin: "987654321" }, ctx).content);
    expect(sale.direction).toBe("SALES");
    expect(sale.canDraftCorrection).toBe(true);

    const purchase = parse(runTool("check_invoice_direction", { sellerTin: "987654321", buyerTin: "134857291" }, ctx).content);
    expect(purchase.direction).toBe("PURCHASE");
    expect(purchase.canDraftCorrection).toBe(false);
  });
});

describe("drafting", () => {
  const invoice = runTool(
    "draft_tax_invoice",
    {
      purchaserName: "Lanka Foods",
      invoiceDate: "2026-10-12",
      treatment: "STANDARD_18",
      lines: [{ description: "Consultancy", quantity: 1, unitPriceLkr: 250_000 }],
    },
    ctx,
  );

  it("returns a proposal rather than an issued invoice", () => {
    expect(invoice.proposal?.kind).toBe("invoice_draft");
    expect(parse(invoice.content).note).toMatch(/nothing has been issued/i);
  });

  it("computes the totals with the rule engine", () => {
    expect(invoice.proposal?.fields.vatTotalLkr).toBe(45_000);
    expect(invoice.proposal?.fields.grossTotalLkr).toBe(295_000);
  });

  it("leaves a missing TIN empty and says it is needed", () => {
    expect(invoice.proposal?.fields.purchaserTin).toBe("");
    expect(invoice.proposal?.reviewNotes.join(" ")).toMatch(/purchaser TIN is missing/i);
  });

  it("does not assign a serial, since that comes from the business's sequence", () => {
    expect(invoice.proposal?.fields).not.toHaveProperty("invoiceNumber");
    expect(invoice.proposal?.reviewNotes.join(" ")).toMatch(/serial is assigned when you save/i);
  });

  it("states which rule pack the invoice date selects", () => {
    expect(invoice.proposal?.reviewNotes.join(" ")).toMatch(/2026-10-01/);
  });

  it("rejects a line with no price or description instead of inventing one", () => {
    const bad = runTool("draft_tax_invoice", { purchaserName: "X", invoiceDate: "2026-10-12", treatment: "STANDARD_18", lines: [{}] }, ctx);
    expect(parse(bad.content).error).toMatch(/description, a quantity and a unit price/i);
    expect(bad.proposal).toBeUndefined();
  });
});

describe("drafting a purchase", () => {
  it("claims the VAT the supplier charged and flags the difference", () => {
    const r = runTool(
      "draft_ledger_entry",
      {
        kind: "INPUT_LOCAL", treatment: "STANDARD_18", counterpartyName: "Ceylon Supplies",
        invoiceDate: "2026-10-05", netAmountLkr: 100_000, statedVatAmountLkr: 15_000,
      },
      ctx,
    );
    expect(r.proposal?.fields.statedVatAmountLkr).toBe(15_000);
    expect(r.proposal?.reviewNotes.join(" ")).toMatch(/only what was charged is claimable/i);
    expect(parse(r.content).note).toMatch(/nothing has been recorded/i);
  });

  it("asks for the invoice figure when none was given", () => {
    const r = runTool(
      "draft_ledger_entry",
      { kind: "INPUT_LOCAL", treatment: "STANDARD_18", counterpartyName: "X", invoiceDate: "2026-10-05", netAmountLkr: 100_000 },
      ctx,
    );
    expect(r.proposal?.reviewNotes.join(" ")).toMatch(/Enter the figure printed on the invoice/i);
  });

  it("maps a purchase to the input schedule", () => {
    const r = runTool(
      "draft_ledger_entry",
      { kind: "INPUT_LOCAL", treatment: "STANDARD_18", supplyType: "GOODS", counterpartyName: "X", invoiceDate: "2026-10-05", netAmountLkr: 1000 },
      ctx,
    );
    expect(r.proposal?.fields.scheduleCode).toBe("02");
  });
});

/**
 * A copilot grounded in the wrong rows is worse than one with no data: the
 * numbers look authoritative and are quietly about the wrong period.
 */
const REGISTER_CTX = {
  analysis: { score: { total: 0 }, workflow: { gate: "NEEDS_HUMAN" }, claimValueUnderReviewLkr: 0, findings: [] },
  workspace: {
    activeProfileId: "P1",
    profiles: [{ id: "P1", tin: "134857291", activePeriodId: "PER-OCT" }],
    periods: [
      { id: "PER-OCT", profileId: "P1", label: "October 2026", status: "COLLECTING", startDate: "2026-10-01", endDate: "2026-10-31", frequency: "MONTHLY" },
      { id: "PER-SEP", profileId: "P1", label: "September 2026", status: "SUBMITTED", startDate: "2026-09-01", endDate: "2026-09-30", frequency: "MONTHLY" },
    ],
    vatTransactions: [
      { id: "T1", profileId: "P1", periodId: "PER-OCT", kind: "OUTPUT", treatment: "STANDARD_18", supplyType: "GOODS", invoiceNumber: "26OCT_BR01_1", invoiceDate: "2026-10-05", counterpartyName: "Lanka Foods", counterpartyTin: "200987654", description: "Goods", netAmountLkr: 100_000, vatRate: 18, vatAmountLkr: 18_000, grossAmountLkr: 118_000, disallowedInputVatLkr: 0, scheduleCode: "01", source: "MANUAL", createdAt: "" },
      // A different period. Must never reach an answer about October.
      { id: "T2", profileId: "P1", periodId: "PER-SEP", kind: "OUTPUT", treatment: "STANDARD_18", supplyType: "GOODS", invoiceNumber: "26SEP_BR01_1", invoiceDate: "2026-09-05", counterpartyName: "Old Buyer", counterpartyTin: "200987654", description: "Goods", netAmountLkr: 900_000, vatRate: 18, vatAmountLkr: 162_000, grossAmountLkr: 1_062_000, disallowedInputVatLkr: 0, scheduleCode: "01", source: "MANUAL", createdAt: "" },
    ],
    generatedInvoices: [
      { id: "I1", profileId: "P1", periodId: "PER-OCT", invoiceNumber: "26OCT_BR01_1", invoiceDate: "2026-10-05", classificationCode: "BR01", treatment: "STANDARD_18", supplyType: "GOODS", purchaserName: "Lanka Foods", purchaserTin: "200987654", purchaserAddress: "Colombo", placeOfSupply: "", paymentMode: "", lines: [], netTotalLkr: 100_000, vatTotalLkr: 18_000, grossTotalLkr: 118_000, status: "ISSUED", issuedAt: "2026-10-06", voidedAt: null, voidReason: "", createdAt: "" },
      { id: "I2", profileId: "P1", periodId: "PER-OCT", invoiceNumber: "26OCT_BR01_2", invoiceDate: "2026-10-09", classificationCode: "BR01", treatment: "STANDARD_18", supplyType: "GOODS", purchaserName: "Ceylon Retail", purchaserTin: "300112233", purchaserAddress: "Kandy", placeOfSupply: "", paymentMode: "", lines: [], netTotalLkr: 50_000, vatTotalLkr: 9_000, grossTotalLkr: 59_000, status: "VOID", issuedAt: null, voidedAt: "2026-10-10", voidReason: "Wrong purchaser TIN", createdAt: "" },
    ],
    vatScheduleBatches: [],
  },
} as never;

describe("the period a figure describes", () => {
  it("answers about the active period, not every period on record", () => {
    const r = parse(runTool("get_period_position", {}, REGISTER_CTX).content);
    expect(r.period).toBe("October 2026");
    // 18,000 from October alone. September's 162,000 is a different return.
    expect(r.outputVatLkr).toBe(18_000);
  });
});

describe("find_invoices", () => {
  it("returns the register totals with void invoices excluded from the money", () => {
    const r = parse(runTool("find_invoices", {}, REGISTER_CTX).content);
    expect(r.register).toMatchObject({ total: 2, issuedCount: 1, voidCount: 1 });
    expect(r.register.vatTotalLkr).toBe(18_000);
  });

  it("still lists a voided invoice, with the reason it was withdrawn", () => {
    const r = parse(runTool("find_invoices", { status: "VOID" }, REGISTER_CTX).content);
    expect(r.matchCount).toBe(1);
    expect(r.invoices[0]).toMatchObject({ invoiceNumber: "26OCT_BR01_2", voidReason: "Wrong purchaser TIN" });
  });

  it("searches by purchaser as well as by number", () => {
    expect(parse(runTool("find_invoices", { query: "ceylon" }, REGISTER_CTX).content).matchCount).toBe(1);
    expect(parse(runTool("find_invoices", { query: "26OCT_BR01_1" }, REGISTER_CTX).content).matchCount).toBe(1);
    expect(parse(runTool("find_invoices", { query: "nothing here" }, REGISTER_CTX).content).matchCount).toBe(0);
  });
});

describe("get_schedule_status", () => {
  it("reports the schedules this period actually has rows in", () => {
    // Listing all seven when six are empty would bury the one that matters.
    const r = parse(runTool("get_schedule_status", {}, REGISTER_CTX).content);
    expect(r.period).toBe("October 2026");
    expect(r.schedules.map((s: any) => s.code)).toEqual(["01"]);
    expect(r.schedules[0]).toMatchObject({ rowCount: 1, batchStatus: "NOT_BUILT", errors: [], detailsNeeded: [] });
  });

  it("asks for the customs facts an import row needs, with the hint to relay", () => {
    const withImport = JSON.parse(JSON.stringify(REGISTER_CTX));
    withImport.workspace.vatTransactions.push({
      id: "T3", profileId: "P1", periodId: "PER-OCT", kind: "INPUT_IMPORT", treatment: "STANDARD_18",
      supplyType: "GOODS", invoiceNumber: "IMP-77", invoiceDate: "2026-10-11", counterpartyName: "Overseas Mill",
      counterpartyTin: "400111222", description: "Raw material", netAmountLkr: 200_000, vatRate: 18,
      vatAmountLkr: 36_000, grossAmountLkr: 236_000, disallowedInputVatLkr: 0, scheduleCode: "03",
      source: "MANUAL", createdAt: "",
    });
    const r = parse(runTool("get_schedule_status", {}, withImport as never).content);
    expect(r.awaitingUserDetail).toContain("03");
    const schedule03 = r.schedules.find((s: any) => s.code === "03");
    expect(schedule03.detailsNeeded[0]).toMatchObject({ invoiceNumber: "IMP-77" });
    expect(schedule03.detailsNeeded[0].missing.map((m: any) => m.field)).toContain("Cusdec No");
    expect(schedule03.detailsNeeded[0].missing[0].hint.length).toBeGreaterThan(10);
  });

  it("stops asking once the facts have been supplied", () => {
    const withImport = JSON.parse(JSON.stringify(REGISTER_CTX));
    withImport.workspace.vatTransactions.push({
      id: "T3", profileId: "P1", periodId: "PER-OCT", kind: "INPUT_IMPORT", treatment: "STANDARD_18",
      supplyType: "GOODS", invoiceNumber: "IMP-77", invoiceDate: "2026-10-11", counterpartyName: "Overseas Mill",
      counterpartyTin: "400111222", description: "Raw material", netAmountLkr: 200_000, vatRate: 18,
      vatAmountLkr: 36_000, grossAmountLkr: 236_000, disallowedInputVatLkr: 0, scheduleCode: "03",
      source: "MANUAL", createdAt: "",
    });
    withImport.workspace.vatScheduleDetails = [{
      transactionId: "T3", code: "03", updatedAt: "",
      values: {
        cusdecDate: "2026-10-10", cusdecNo: "CUS-900", vatDeferred: "0", vatUpfront: "36000",
        cusdecSerialId: "S-1", cusdecOfficeId: "OF-1", cusdecRegDate: "2026-10-10",
      },
    }];
    const r = parse(runTool("get_schedule_status", {}, withImport as never).content);
    expect(r.awaitingUserDetail).not.toContain("03");
  });

  it("names what is blocking a schedule rather than only that it is blocked", () => {
    const broken = JSON.parse(JSON.stringify(REGISTER_CTX));
    broken.workspace.vatTransactions[0].counterpartyTin = "123";
    const r = parse(runTool("get_schedule_status", {}, broken as never).content);
    expect(r.blocking).toContain("01");
    expect(r.schedules[0].errors[0].message).toMatch(/nine digits/);
  });
});
