import { describe, expect, it } from "vitest";
import { filterInvoices, issueBlocker, sequenceGaps, summariseInvoices, voidBlocker } from "../lib/vat-invoice-register";
import type { GeneratedVatInvoice, VatPeriodRecord } from "../lib/workspace/workspace";

function invoice(patch: Partial<GeneratedVatInvoice> = {}): GeneratedVatInvoice {
  return {
    id: "VATINV-1", profileId: "BIZ-1", periodId: "P-1", invoiceNumber: "26SEP_BR01_1",
    invoiceDate: "2026-09-15", supplyDate: "2026-09-15", classificationCode: "BR01",
    treatment: "STANDARD_18", supplyType: "GOODS", purchaserName: "Ceylon Traders",
    purchaserTin: "100123456", purchaserAddress: "Colombo 03", placeOfSupply: "Colombo",
    paymentMode: "Bank Transfer", lines: [], netTotalLkr: 1000, vatTotalLkr: 180, grossTotalLkr: 1180,
    status: "DRAFT", issuedAt: null, voidedAt: null, voidReason: "", createdAt: "2026-09-15T00:00:00.000Z",
    ...patch,
  };
}

const openPeriod = { id: "P-1", status: "OPEN" } as unknown as VatPeriodRecord;
const closedPeriod = { id: "P-1", status: "SUBMITTED" } as unknown as VatPeriodRecord;

describe("issuing a tax invoice", () => {
  it("allows a draft in an open period", () => {
    expect(issueBlocker(invoice(), openPeriod)).toBeNull();
  });

  it("refuses to issue the same invoice twice", () => {
    expect(issueBlocker(invoice({ status: "ISSUED" }), openPeriod)).toMatch(/already been issued/);
  });

  it("refuses to bring a voided invoice back", () => {
    expect(issueBlocker(invoice({ status: "VOID" }), openPeriod)).toMatch(/replacement/);
  });

  it("refuses once the period has been filed", () => {
    expect(issueBlocker(invoice(), closedPeriod)).toMatch(/closed/);
  });
});

describe("voiding a tax invoice", () => {
  it("allows a draft to be withdrawn", () => {
    expect(voidBlocker(invoice(), openPeriod)).toBeNull();
  });

  it("allows an issued invoice to be withdrawn — that is what voiding is for", () => {
    expect(voidBlocker(invoice({ status: "ISSUED" }), openPeriod)).toBeNull();
  });

  it("refuses to void twice", () => {
    expect(voidBlocker(invoice({ status: "VOID" }), openPeriod)).toMatch(/already void/);
  });

  it("refuses to change a period that has already been filed", () => {
    expect(voidBlocker(invoice({ status: "ISSUED" }), closedPeriod)).toMatch(/amendment/);
  });

  it("treats a missing period as unlocked rather than crashing", () => {
    expect(voidBlocker(invoice(), undefined)).toBeNull();
  });
});

describe("register totals", () => {
  const invoices = [
    invoice({ id: "A", status: "ISSUED", netTotalLkr: 1000, vatTotalLkr: 180, grossTotalLkr: 1180 }),
    invoice({ id: "B", status: "DRAFT", netTotalLkr: 500, vatTotalLkr: 90, grossTotalLkr: 590 }),
    invoice({ id: "C", status: "VOID", netTotalLkr: 9000, vatTotalLkr: 1620, grossTotalLkr: 10_620 }),
  ];

  it("counts every status", () => {
    const summary = summariseInvoices(invoices);
    expect(summary).toMatchObject({ total: 3, draftCount: 1, issuedCount: 1, voidCount: 1 });
  });

  it("excludes voided invoices from every money figure", () => {
    const summary = summariseInvoices(invoices);
    expect(summary.netTotalLkr).toBe(1500);
    expect(summary.vatTotalLkr).toBe(270);
    expect(summary.grossTotalLkr).toBe(1770);
  });

  it("reports issued output VAT separately from drafts", () => {
    expect(summariseInvoices(invoices).issuedVatTotalLkr).toBe(180);
  });

  it("returns zeroes for an empty register", () => {
    expect(summariseInvoices([])).toMatchObject({ total: 0, netTotalLkr: 0, vatTotalLkr: 0, grossTotalLkr: 0 });
  });
});

describe("filtering the register", () => {
  const invoices = [
    invoice({ id: "A", invoiceNumber: "26SEP_BR01_1", purchaserName: "Ceylon Traders", invoiceDate: "2026-09-01" }),
    invoice({ id: "B", invoiceNumber: "26SEP_BR01_2", purchaserName: "Lanka Foods", purchaserTin: "200987654", status: "ISSUED", invoiceDate: "2026-09-20" }),
    invoice({ id: "C", invoiceNumber: "26SEP_EX02_1", purchaserName: "Overseas Ltd", classificationCode: "EX02", status: "VOID", invoiceDate: "2026-09-10" }),
  ];

  it("returns everything by default, newest invoice date first", () => {
    expect(filterInvoices(invoices).map((item) => item.id)).toEqual(["B", "C", "A"]);
  });

  it("filters by status", () => {
    expect(filterInvoices(invoices, { status: "VOID" }).map((item) => item.id)).toEqual(["C"]);
  });

  it("searches number, purchaser, TIN and classification code", () => {
    expect(filterInvoices(invoices, { query: "lanka" }).map((item) => item.id)).toEqual(["B"]);
    expect(filterInvoices(invoices, { query: "200987654" }).map((item) => item.id)).toEqual(["B"]);
    expect(filterInvoices(invoices, { query: "EX02" }).map((item) => item.id)).toEqual(["C"]);
    expect(filterInvoices(invoices, { query: "_1" }).map((item) => item.id)).toEqual(["C", "A"]);
  });

  it("ignores case and surrounding space in the query", () => {
    expect(filterInvoices(invoices, { query: "  CEYLON  " }).map((item) => item.id)).toEqual(["A"]);
  });

  it("combines a search with a status filter", () => {
    expect(filterInvoices(invoices, { query: "26SEP", status: "ISSUED" }).map((item) => item.id)).toEqual(["B"]);
  });
});

describe("invoice sequence gaps", () => {
  it("reports a number missing from the middle of a run", () => {
    const invoices = [
      invoice({ id: "A", invoiceNumber: "26SEP_BR01_1" }),
      invoice({ id: "B", invoiceNumber: "26SEP_BR01_3" }),
    ];
    expect(sequenceGaps(invoices)).toEqual(["26SEP_BR01_2"]);
  });

  it("keeps each classification code and month in its own run", () => {
    const invoices = [
      invoice({ id: "A", invoiceNumber: "26SEP_BR01_1" }),
      invoice({ id: "B", invoiceNumber: "26OCT_BR01_1" }),
    ];
    expect(sequenceGaps(invoices)).toEqual([]);
  });

  it("counts a voided number as used, because the void record accounts for it", () => {
    const invoices = [
      invoice({ id: "A", invoiceNumber: "26SEP_BR01_1" }),
      invoice({ id: "B", invoiceNumber: "26SEP_BR01_2", status: "VOID" }),
      invoice({ id: "C", invoiceNumber: "26SEP_BR01_3" }),
    ];
    expect(sequenceGaps(invoices)).toEqual([]);
  });

  it("finds nothing in an unbroken run or an empty register", () => {
    expect(sequenceGaps([invoice({ invoiceNumber: "26SEP_BR01_1" })])).toEqual([]);
    expect(sequenceGaps([])).toEqual([]);
  });
});
