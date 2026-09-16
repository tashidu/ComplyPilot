import { describe, expect, it } from "vitest";
import type { InvoiceExtraction } from "../lib/ai/extraction-schema";
import { FIXTURE_INVOICE } from "../lib/fixtures/demo-case";
import { inferTreatment, parseExtractedDate, proposeLedgerEntry, REVIEW_CONFIDENCE_THRESHOLD } from "../lib/vat-ledger-import";
import type { BusinessProfile } from "../lib/workspace/workspace";

const ENTITY_TIN = "134857291";
const profile = { id: "BIZ-1", tin: ENTITY_TIN } as unknown as BusinessProfile;

const field = (value: string | number | null, confidence = 96, source: string | null = "line on the document") => ({ value, confidence, source });

function extraction(patch: Partial<InvoiceExtraction> = {}): InvoiceExtraction {
  return {
    ...FIXTURE_INVOICE,
    sellerVatNumber: field("987654321"),
    buyerTin: field(ENTITY_TIN),
    invoiceNumber: field("SUP-4410"),
    invoiceDate: field("10/25/2026"),
    netTotal: field(100_000),
    vatTotal: field(18_000),
    grossTotal: field(118_000),
    currency: field("LKR"),
    ...patch,
  };
}

describe("reading the invoice date", () => {
  it("reads the prescribed MM/DD/YYYY form", () => {
    expect(parseExtractedDate("10/25/2026")).toEqual({ iso: "2026-10-25", ambiguous: false });
  });

  it("passes an ISO date through untouched", () => {
    expect(parseExtractedDate("2026-10-25")).toEqual({ iso: "2026-10-25", ambiguous: false });
  });

  it("flags a date that could be read either way round", () => {
    // 10/12/2026 is October 12th under the rule pack, but December 10th to
    // whoever typed it if they used DD/MM. The wrong one moves the VAT period.
    expect(parseExtractedDate("10/12/2026")).toEqual({ iso: "2026-10-12", ambiguous: true });
  });

  it("does not call a date ambiguous when both parts are the same", () => {
    expect(parseExtractedDate("11/11/2026")).toEqual({ iso: "2026-11-11", ambiguous: false });
  });

  it("reads a day-first date whose first part cannot be a month", () => {
    // 18 is not a month, so "18-10-2026" has exactly one reading. Refusing it
    // stalled the pipeline on invoices printed the way most suppliers print
    // them, even though the date was in no doubt.
    expect(parseExtractedDate("18-10-2026")).toEqual({ iso: "2026-10-18", ambiguous: false });
    expect(parseExtractedDate("18/10/2026")).toEqual({ iso: "2026-10-18", ambiguous: false });
    expect(parseExtractedDate("31-12-2026")).toEqual({ iso: "2026-12-31", ambiguous: false });
  });

  it("reads the prescribed form with a dash separator too", () => {
    expect(parseExtractedDate("10-25-2026")).toEqual({ iso: "2026-10-25", ambiguous: false });
  });

  it("rejects an impossible or unreadable date rather than guessing", () => {
    expect(parseExtractedDate("13/25/2026").iso).toBeNull();
    expect(parseExtractedDate("02/30/2026").iso).toBeNull();
    expect(parseExtractedDate("last Tuesday").iso).toBeNull();
    expect(parseExtractedDate("").iso).toBeNull();
  });
});

describe("inferring the VAT treatment", () => {
  it("concludes the standard rate when the arithmetic supports it", () => {
    expect(inferTreatment(100_000, 18_000)).toMatchObject({ treatment: "STANDARD_18", confident: true });
  });

  it("refuses to conclude a zero-rated supply from a zero VAT figure", () => {
    const result = inferTreatment(100_000, 0);
    expect(result.treatment).toBe("ZERO_RATED");
    expect(result.confident).toBe(false);
    expect(result.reason).toMatch(/exempt/);
  });

  it("flags a rate that is neither zero nor standard", () => {
    const result = inferTreatment(100_000, 15_000);
    expect(result.confident).toBe(false);
    expect(result.reason).toMatch(/15\.0%/);
  });

  it("is not confident when an amount could not be read", () => {
    expect(inferTreatment(null, 18_000).confident).toBe(false);
    expect(inferTreatment(100_000, null).confident).toBe(false);
  });
});

describe("proposing a ledger entry", () => {
  it("records a purchase as input VAT, claiming what the supplier charged", () => {
    const proposal = proposeLedgerEntry(extraction(), profile);
    expect(proposal.direction.direction).toBe("PURCHASE");
    expect(proposal.draft).toMatchObject({
      kind: "INPUT_LOCAL",
      treatment: "STANDARD_18",
      invoiceNumber: "SUP-4410",
      invoiceDate: "2026-10-25",
      counterpartyTin: "987654321",
      netAmountLkr: 100_000,
      statedVatAmountLkr: 18_000,
    });
  });

  it("records a sale as output VAT, with no stated supplier figure", () => {
    const proposal = proposeLedgerEntry(
      extraction({ sellerVatNumber: field(ENTITY_TIN), buyerTin: field("987654321"), buyerName: field("Lanka Foods") }),
      profile,
    );
    expect(proposal.direction.direction).toBe("SALES");
    expect(proposal.draft?.kind).toBe("OUTPUT");
    expect(proposal.draft?.statedVatAmountLkr).toBeNull();
    expect(proposal.draft?.counterpartyName).toBe("Lanka Foods");
  });

  it("names the counterparty from the other side of the document", () => {
    const purchase = proposeLedgerEntry(extraction({ sellerName: field("Ceylon Industrial") }), profile);
    expect(purchase.draft?.counterpartyName).toBe("Ceylon Industrial");
    expect(purchase.fields.find((item) => item.key === "counterpartyName")?.label).toBe("Supplier name");
  });

  it("strips a branch suffix from the counterparty TIN", () => {
    const proposal = proposeLedgerEntry(extraction({ sellerVatNumber: field("987654321-7000") }), profile);
    expect(proposal.draft?.counterpartyTin).toBe("987654321");
  });

  it("proposes nothing for an invoice belonging to another business", () => {
    const proposal = proposeLedgerEntry(
      extraction({ sellerVatNumber: field("111111111"), buyerTin: field("222222222") }),
      profile,
    );
    expect(proposal.direction.direction).toBe("UNRELATED");
    expect(proposal.draft).toBeNull();
    expect(proposal.blockers.join(" ")).toMatch(/does not belong/);
  });

  it("proposes nothing when the side cannot be determined", () => {
    // The bundled demo invoice has no purchaser TIN, which is exactly the case
    // a person has to settle rather than the model.
    const proposal = proposeLedgerEntry(FIXTURE_INVOICE, profile);
    expect(proposal.direction.direction).toBe("UNKNOWN");
    expect(proposal.draft).toBeNull();
    expect(proposal.blockers.length).toBeGreaterThan(0);
  });

  it("blocks on a missing amount, date or invoice number", () => {
    expect(proposeLedgerEntry(extraction({ netTotal: field(null) }), profile).blockers.join(" ")).toMatch(/net amount/i);
    expect(proposeLedgerEntry(extraction({ invoiceDate: field("nonsense") }), profile).blockers.join(" ")).toMatch(/invoice date/i);
    expect(proposeLedgerEntry(extraction({ invoiceNumber: field(null) }), profile).blockers.join(" ")).toMatch(/invoice number/i);
  });

  it("sends a field the model was unsure about to a human", () => {
    const proposal = proposeLedgerEntry(extraction({ netTotal: field(100_000, 41) }), profile);
    const net = proposal.fields.find((item) => item.key === "netTotal");
    expect(net?.needsReview).toBe(true);
    expect(net?.reason).toMatch(/41% confidence/);
    expect(proposal.reviewRequired).toContain("Net amount");
  });

  it("still proposes the entry when a field only needs confirming", () => {
    // Low confidence is a reason to look, not a reason to refuse: the draft is
    // offered with the doubt attached.
    const proposal = proposeLedgerEntry(extraction({ netTotal: field(100_000, 41) }), profile);
    expect(proposal.draft).not.toBeNull();
    expect(proposal.blockers).toEqual([]);
  });

  it("flags an ambiguous date on the field without blocking the entry", () => {
    const proposal = proposeLedgerEntry(extraction({ invoiceDate: field("10/12/2026") }), profile);
    expect(proposal.draft?.invoiceDate).toBe("2026-10-12");
    expect(proposal.fields.find((item) => item.key === "invoiceDate")?.reason).toMatch(/confirm the month/i);
  });

  it("warns when the document is not in rupees", () => {
    const proposal = proposeLedgerEntry(extraction({ currency: field("USD") }), profile);
    expect(proposal.fields.find((item) => item.key === "currency")?.reason).toMatch(/convert/i);
  });

  it("carries the model's own source text through for the reviewer", () => {
    const proposal = proposeLedgerEntry(extraction({ netTotal: field(100_000, 96, "Total excluding VAT 100,000.00") }), profile);
    expect(proposal.fields.find((item) => item.key === "netTotal")?.source).toBe("Total excluding VAT 100,000.00");
  });

  it("averages confidence only over the fields it actually read", () => {
    const proposal = proposeLedgerEntry(extraction(), profile);
    expect(proposal.overallConfidence).toBeGreaterThanOrEqual(REVIEW_CONFIDENCE_THRESHOLD);
    expect(proposal.overallConfidence).toBeLessThanOrEqual(100);
  });

  it("falls back to a readable description when no line item was read", () => {
    const proposal = proposeLedgerEntry(extraction({ lineItems: [] }), profile);
    expect(proposal.draft?.description).toMatch(/read from the uploaded tax invoice/);
  });
});

describe("a person confirming the side the model could not read", () => {
  it("unblocks an invoice whose purchaser TIN was never printed", () => {
    // The bundled demo invoice is exactly this case.
    const blocked = proposeLedgerEntry(FIXTURE_INVOICE, profile);
    expect(blocked.draft).toBeNull();

    const confirmed = proposeLedgerEntry(FIXTURE_INVOICE, profile, { confirmedDirection: "PURCHASE" });
    expect(confirmed.direction.direction).toBe("PURCHASE");
    expect(confirmed.draft).toMatchObject({ kind: "INPUT_LOCAL", statedVatAmountLkr: 800_000 });
  });

  it("records a sale when that is the side confirmed", () => {
    const confirmed = proposeLedgerEntry(FIXTURE_INVOICE, profile, { confirmedDirection: "SALES" });
    expect(confirmed.draft?.kind).toBe("OUTPUT");
    expect(confirmed.draft?.statedVatAmountLkr).toBeNull();
  });

  it("says in the reason that a person decided it, not the model", () => {
    const confirmed = proposeLedgerEntry(FIXTURE_INVOICE, profile, { confirmedDirection: "PURCHASE" });
    expect(confirmed.direction.reason).toMatch(/authorised user confirmed/i);
    expect(confirmed.direction.needsHuman).toBe(false);
  });

  it("refuses to let an invoice belonging to someone else be confirmed away", () => {
    // Both TINs were read and neither is this business. Accepting a click here
    // is how input VAT gets claimed on another company's purchase.
    const other = extraction({ sellerVatNumber: field("111111111"), buyerTin: field("222222222") });
    const confirmed = proposeLedgerEntry(other, profile, { confirmedDirection: "PURCHASE" });
    expect(confirmed.direction.direction).toBe("UNRELATED");
    expect(confirmed.draft).toBeNull();
  });

  it("leaves a side the model already resolved alone", () => {
    const sale = extraction({ sellerVatNumber: field(ENTITY_TIN), buyerTin: field("987654321") });
    expect(proposeLedgerEntry(sale, profile, { confirmedDirection: "PURCHASE" }).draft?.kind).toBe("OUTPUT");
  });

  it("takes the counterparty from the supplier side once a purchase is confirmed", () => {
    // The TIN the demo invoice is missing is the buyer's - this entity's own.
    // The supplier's was read, and on a purchase that is the counterparty.
    const confirmed = proposeLedgerEntry(FIXTURE_INVOICE, profile, { confirmedDirection: "PURCHASE" });
    expect(confirmed.draft?.counterpartyTin).toBe("123456789");
    expect(confirmed.draft?.counterpartyName).toBe("Ceylon Industrial Supplies (Pvt) Ltd");
  });

  it("keeps flagging what is still doubtful after the side is settled", () => {
    // The demo invoice date reads 10/12/2026 - ambiguous either way round.
    const confirmed = proposeLedgerEntry(FIXTURE_INVOICE, profile, { confirmedDirection: "PURCHASE" });
    expect(confirmed.reviewRequired).toContain("Invoice date");
  });
});
