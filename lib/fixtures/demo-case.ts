import type { InvoiceExtraction } from "../ai/extraction-schema";
import type { Finding } from "../types";

const field = (
  value: string | number | null,
  confidence = value === null ? 0 : 98,
  source = "Synthetic Team Odin demo invoice",
) => ({ value, confidence, source });

/**
 * One internally consistent synthetic invoice for the golden demo path.
 * It deliberately contains two post-October issues: a missing TAX INVOICE
 * heading and a missing purchaser TIN. The VAT amount connects the document
 * finding to LKR 0.8M of the synthetic LKR 4.2M case exposure.
 */
export const FIXTURE_INVOICE: InvoiceExtraction = {
  invoiceTitle: field(null),
  sellerName: field("Ceylon Industrial Supplies (Pvt) Ltd"),
  sellerVatNumber: field("123456789"),
  sellerAddress: field("88 Export Avenue, Colombo 02"),
  sellerTelephone: field("0112456789"),
  buyerName: field("Serendib Export Works (Pvt) Ltd"),
  buyerTin: field(null),
  buyerAddress: field("14 Harbour Road, Colombo 01"),
  buyerTelephone: field(null),
  invoiceNumber: field("26OCT_BR03_1030"),
  invoiceDate: field("10/12/2026"),
  supplyDate: field("10/10/2026"),
  placeOfSupply: field("Colombo"),
  currency: field("LKR"),
  netTotal: field(4_444_444.44),
  vatTotal: field(800_000),
  grossTotal: field(5_244_444.44),
  totalInWords: field(null),
  paymentMode: field("Bank Transfer"),
  lineItems: [
    {
      description: field("Export packaging and production materials"),
      quantity: field(1),
      unitPrice: field(4_444_444.44),
      amount: field(4_444_444.44),
      vatRate: field(18),
    },
  ],
};

export const FIXTURE_FINDINGS: Finding[] = [
  {
    id: "supplier",
    badge: "S",
    title: "Supplier VAT status needs confirmation",
    description: "The latest published supplier snapshot is not current enough to support an automatic conclusion.",
    tag: "Source outdated",
    severity: "high",
    meta: ["Source: IRD inactive VAT list", "Effective: 18 Nov 2025", "Claim value: LKR 1.8M"],
    scoreGain: 10,
    amountLkrM: 1.8,
    confidence: 78,
    ruleId: "SUP-004",
    graphTitle: "Supplier evidence chain",
    graph: [
      { title: "Invoice INV-1024", detail: "Supplier SUP-008" },
      { title: "Supplier record", detail: "TIN captured with 96% confidence" },
      { title: "Published snapshot", detail: "Effective 18 Nov 2025" },
      { title: "Freshness rule", detail: "Point-in-time source is outdated", status: "warning" },
      { title: "Human action", detail: "Request current supplier evidence", status: "action" },
    ],
    status: "open",
  },
  {
    id: "customs",
    badge: "C",
    title: "Export value differs from CUSDEC by 12.4%",
    description: "The schedule structure passes, but the export total needs a documented cross-system reconciliation.",
    tag: "Reconciliation",
    severity: "high",
    meta: ["Schedule total: LKR 18.3M", "CUSDEC total: LKR 16.0M", "Claim value: LKR 1.6M"],
    scoreGain: 7,
    amountLkrM: 1.6,
    confidence: 94,
    ruleId: "RECON-001",
    graphTitle: "Customs reconciliation chain",
    graph: [
      { title: "VAT Schedule 06", detail: "Export value LKR 18.3M" },
      { title: "CUSDEC batch", detail: "Export value LKR 16.0M" },
      { title: "Variance engine", detail: "Difference 12.4%", status: "warning" },
      { title: "Guidance rule", detail: "Reconciliation document required" },
      { title: "Human action", detail: "Review drafted explanation", status: "action" },
    ],
    status: "open",
  },
  {
    id: "invoice",
    badge: "I",
    title: "Two invoices fail the October 2026 rule pack",
    description: "The records pass the earlier profile but require revised serial and purchaser details under the selected profile.",
    tag: "Future rule active",
    severity: "medium",
    meta: ["Rule pack: v2026.10", "2 mandatory fields", "Claim value: LKR 0.8M"],
    scoreGain: 4,
    amountLkrM: 0.8,
    confidence: 92,
    ruleId: "DOC-021",
    graphTitle: "Invoice compliance chain",
    graph: [
      { title: "Invoice INV-1030", detail: "Photographed document" },
      { title: "Qwen-VL extraction", detail: "Purchaser fields + serial" },
      { title: "Rule pack v2026.10", detail: "Effective 1 Oct 2026" },
      { title: "Validation", detail: "2 mandatory fields missing", status: "warning" },
      { title: "Human action", detail: "Correct and approve fields", status: "action" },
    ],
    status: "open",
  },
];
