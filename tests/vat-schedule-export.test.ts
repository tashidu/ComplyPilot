import { describe, expect, it } from "vitest";
import { parseVatScheduleCsv } from "../lib/evidence/schedule-parser";
import { buildOfficialScheduleCsv, buildReturnSummaryCsv, buildScheduleCsv, officialScheduleFileName, OFFICIAL_SCHEDULE_HEADERS, scheduleFileName, SCHEDULE_DEFINITIONS, toIrdDate, transactionsForSchedule, validateOfficialSchedule, vatPeriodCode } from "../lib/vat-schedule-export";
import type { BusinessProfile, VatPeriodRecord, VatTransaction } from "../lib/workspace/workspace";

function transaction(patch: Partial<VatTransaction>): VatTransaction {
  return {
    id: "TX-1", profileId: "BIZ-1", periodId: "P-1", kind: "OUTPUT", treatment: "STANDARD_18", supplyType: "GOODS",
    invoiceNumber: "26SEP_BR01_1", invoiceDate: "2026-09-15", counterpartyName: "Ceylon Traders", counterpartyTin: "100123456",
    description: "Taxable goods", netAmountLkr: 1000, vatRate: 18, vatAmountLkr: 180, grossAmountLkr: 1180,
    disallowedInputVatLkr: 0, scheduleCode: "01", source: "MANUAL", createdAt: "2026-09-15T00:00:00.000Z", ...patch,
  };
}

const profile = {
  id: "BIZ-1", displayName: "Demo Exports", legalName: "Demo Exports (Pvt) Ltd", tin: "100123456",
  vatRegistrationEffectiveDate: "2026-01-01", vatRegistrationCertificateRef: "VAT/2026/001",
} as unknown as BusinessProfile;

const period = {
  id: "P-1", label: "October 2026", startDate: "2026-10-01", endDate: "2026-10-31",
  returnDueDate: "2026-11-30", paymentDueDate: "2026-11-20",
} as unknown as VatPeriodRecord;

function rows(csv: string) {
  return csv.split("\r\n");
}

describe("VAT schedule export", () => {
  it("emits a header even when no record maps to the schedule", () => {
    const csv = buildScheduleCsv([], "02");
    expect(rows(csv)).toHaveLength(1);
    expect(csv).toContain("Supplier TIN");
  });

  it("names the counterparty column for the direction of the schedule", () => {
    expect(buildScheduleCsv([], "01")).toContain("Purchaser TIN");
    expect(buildScheduleCsv([], "02")).toContain("Supplier TIN");
  });

  it("carries claimable input VAT only on input schedules", () => {
    const input = buildScheduleCsv(
      [transaction({ kind: "INPUT_LOCAL", scheduleCode: "02", vatAmountLkr: 180, disallowedInputVatLkr: 20 })],
      "02",
    );
    expect(rows(input)[0]).toContain("Claimable Input VAT");
    expect(rows(input)[1].endsWith("20.00,160.00")).toBe(true);
    expect(buildScheduleCsv([], "01")).not.toContain("Claimable Input VAT");
  });

  it("includes only the records mapped to the requested schedule", () => {
    const transactions = [
      transaction({ id: "A", scheduleCode: "01" }),
      transaction({ id: "B", kind: "INPUT_LOCAL", scheduleCode: "02" }),
      transaction({ id: "C", kind: "INPUT_IMPORT", scheduleCode: "03" }),
    ];
    expect(transactionsForSchedule(transactions, "02").map((item) => item.id)).toEqual(["B"]);
    expect(rows(buildScheduleCsv(transactions, "02"))).toHaveLength(2);
  });

  it("orders rows by invoice date, then by invoice number", () => {
    const transactions = [
      transaction({ id: "A", invoiceDate: "2026-10-09", invoiceNumber: "INV-9" }),
      transaction({ id: "B", invoiceDate: "2026-10-02", invoiceNumber: "INV-2" }),
      transaction({ id: "C", invoiceDate: "2026-10-02", invoiceNumber: "INV-1" }),
    ];
    expect(transactionsForSchedule(transactions, "01").map((item) => item.id)).toEqual(["C", "B", "A"]);
  });

  it("quotes a counterparty name containing a comma so the row keeps its shape", () => {
    const csv = buildScheduleCsv([transaction({ counterpartyName: 'Silva, Perera & Co "Lanka"' })], "01");
    expect(rows(csv)[1]).toContain('"Silva, Perera & Co ""Lanka"""');
    expect(rows(csv)).toHaveLength(2);
  });

  it("neutralises a value a spreadsheet would execute as a formula", () => {
    const csv = buildScheduleCsv([transaction({ counterpartyName: "=HYPERLINK(\"http://x\")" })], "01");
    // The text survives for a reader; only the leading = is defused.
    expect(rows(csv)[1]).toContain("'=HYPERLINK");
  });

  it("states every amount to two decimals", () => {
    const csv = buildScheduleCsv([transaction({ netAmountLkr: 1000, vatAmountLkr: 180, grossAmountLkr: 1180 })], "01");
    expect(rows(csv)[1]).toContain("1000.00,18,180.00,1180.00");
  });

  it("round-trips an exported input schedule back through the evidence parser", () => {
    const transactions = [
      transaction({ id: "A", kind: "INPUT_LOCAL", scheduleCode: "02", invoiceNumber: "SUP-100", counterpartyTin: "200987654", counterpartyName: "Lanka Supplies", netAmountLkr: 50_000, vatAmountLkr: 9_000, grossAmountLkr: 59_000 }),
      transaction({ id: "B", kind: "INPUT_LOCAL", scheduleCode: "02", invoiceNumber: "SUP-101", counterpartyTin: "200987654", counterpartyName: "Lanka Supplies", netAmountLkr: 10_000, vatAmountLkr: 1_800, grossAmountLkr: 11_800 }),
    ];
    const parsed = parseVatScheduleCsv(buildScheduleCsv(transactions, "02"), "schedule-02.csv");
    expect(parsed.warnings).toEqual([]);
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0]).toMatchObject({
      invoiceNumber: "SUP-100", supplierTin: "200987654", supplierName: "Lanka Supplies",
      invoiceDate: "2026-09-15", netAmount: 50_000, vatAmount: 9_000, grossAmount: 59_000,
    });
  });

  it("survives the round trip with a BOM in front, as a browser download writes it", () => {
    const csv = `﻿${buildScheduleCsv([transaction({ kind: "INPUT_LOCAL", scheduleCode: "02" })], "02")}`;
    expect(parseVatScheduleCsv(csv, "schedule-02.csv").rows[0].invoiceNumber).toBe("26SEP_BR01_1");
  });
});

describe("VAT return summary export", () => {
  const transactions = [
    transaction({ id: "A", kind: "OUTPUT", scheduleCode: "01", vatAmountLkr: 450 }),
    transaction({ id: "B", kind: "INPUT_LOCAL", scheduleCode: "02", vatAmountLkr: 180, disallowedInputVatLkr: 20 }),
  ];

  it("states the position the filer keys into the return", () => {
    const csv = buildReturnSummaryCsv(profile, period, transactions);
    expect(csv).toContain("Output VAT,450.00");
    expect(csv).toContain("Allowable input VAT,160.00");
    expect(csv).toContain("VAT payable,290.00");
    expect(csv).toContain("Excess input credit,0.00");
  });

  it("identifies the taxpayer and the period being filed", () => {
    const csv = buildReturnSummaryCsv(profile, period, transactions);
    expect(csv).toContain("TIN,100123456");
    expect(csv).toContain("Period,October 2026");
    expect(csv).toContain("Return due date,2026-11-30");
  });

  it("counts every schedule, including the empty ones", () => {
    const csv = buildReturnSummaryCsv(profile, period, transactions);
    for (const definition of SCHEDULE_DEFINITIONS) {
      expect(csv).toContain(`Schedule ${definition.code} — ${definition.name} (rows / VAT)`);
    }
    expect(csv).toContain("1 / 450.00");
    expect(csv).toContain("0 / 0.00");
  });

  it("surfaces records that no schedule claims", () => {
    const csv = buildReturnSummaryCsv(profile, period, [...transactions, transaction({ id: "C", scheduleCode: "NONE" })]);
    expect(csv).toContain("Records not mapped to a schedule,1");
  });

  it("falls back to a readable label when registration details are absent", () => {
    const bare = { ...profile, vatRegistrationEffectiveDate: "", vatRegistrationCertificateRef: "" } as BusinessProfile;
    expect(buildReturnSummaryCsv(bare, period, transactions)).toContain("Certificate / acknowledgement reference,Not recorded");
  });
});

describe("schedule file names", () => {
  it("identifies the taxpayer, the period and the artefact", () => {
    expect(scheduleFileName(profile, period, "schedule-02")).toBe("100123456-october-2026-schedule-02.csv");
  });

  it("falls back to the display name when no TIN is recorded", () => {
    const bare = { ...profile, tin: "" } as BusinessProfile;
    expect(scheduleFileName(bare, period, "return-summary")).toBe("demo-exports-october-2026-return-summary.csv");
  });
});

describe("official IRD Schedule 01 and 02 builder", () => {
  it("uses the exact v1.8 column order and converts dates", () => {
    const csv01 = buildOfficialScheduleCsv([transaction({ invoiceDate: "2026-10-15" })], "01");
    expect(rows(csv01)[0]).toBe(OFFICIAL_SCHEDULE_HEADERS["01"].join(","));
    expect(rows(csv01)[1]).toContain("1,10/15/2026,26SEP_BR01_1");

    const csv02 = buildOfficialScheduleCsv([transaction({ kind: "INPUT_LOCAL", scheduleCode: "02", disallowedInputVatLkr: 20 })], "02");
    expect(rows(csv02)[0]).toBe(OFFICIAL_SCHEDULE_HEADERS["02"].join(","));
    expect(rows(csv02)[1].endsWith("1000.00,180.00,20.00")).toBe(true);
    expect(toIrdDate("2026-10-03")).toBe("10/03/2026");
  });

  it("derives monthly and quarterly IRD period codes", () => {
    expect(vatPeriodCode(period)).toBe("2641");
    expect(vatPeriodCode({ ...period, frequency: "QUARTERLY" })).toBe("2640");
  });

  it("creates the official upload filename convention", () => {
    expect(officialScheduleFileName(profile, period, "02", "2026-11-24", "ORIGINAL", 1))
      .toBe("100123456_VAT_SCHEDULE02_2641_20261124_ORIGINAL_V1.csv");
  });

  it("blocks malformed TINs, out-of-period dates and duplicate invoice keys", () => {
    const duplicate = transaction({ id: "B", invoiceDate: "2026-11-01", counterpartyTin: "123", invoiceNumber: "INV-1" });
    const issues = validateOfficialSchedule([
      duplicate,
      transaction({ id: "C", invoiceDate: "2026-11-01", counterpartyTin: "123", invoiceNumber: "INV-1" }),
    ], period, "01");
    expect(issues.some((issue) => issue.field === "Purchaser's TIN" && issue.severity === "ERROR")).toBe(true);
    expect(issues.some((issue) => issue.field === "Invoice Date" && issue.severity === "ERROR")).toBe(true);
    expect(issues.some((issue) => issue.message.startsWith("Possible duplicate"))).toBe(true);
  });

  it("warns when standard-rated VAT differs from 18 percent", () => {
    const issues = validateOfficialSchedule([transaction({ invoiceDate: "2026-10-15", vatAmountLkr: 170 })], period, "01");
    expect(issues).toContainEqual(expect.objectContaining({ severity: "WARNING", field: "VAT Amount" }));
  });
});

describe("the standard rate the validator warns against", () => {
  it("comes from the shared VAT calculation, not a second copy of the rate", () => {
    // A row whose VAT is right at the standard rate must not be warned about.
    // If this file ever grows its own rate literal again, this fails the day
    // the rate moves rather than quietly warning against the old one.
    const correct = transaction({ netAmountLkr: 100_000, vatAmountLkr: 18_000, treatment: "STANDARD_18", invoiceDate: "2026-10-05" });
    const octoberPeriod = { ...period, frequency: "MONTHLY" } as unknown as VatPeriodRecord;
    expect(validateOfficialSchedule([correct], octoberPeriod, "01")).toEqual([]);

    const wrong = transaction({ netAmountLkr: 100_000, vatAmountLkr: 15_000, treatment: "STANDARD_18", invoiceDate: "2026-10-05" });
    const issues = validateOfficialSchedule([wrong], octoberPeriod, "01");
    expect(issues.some((i) => i.severity === "WARNING" && i.message.includes("18000.00"))).toBe(true);
  });
});
