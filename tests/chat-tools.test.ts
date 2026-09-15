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
      "get_case_position",
      "get_period_position",
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
