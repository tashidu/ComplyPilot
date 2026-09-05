import { InvoiceExtraction } from "../ai/extraction-schema";
import { Finding } from "../types";
import { FIXTURE_FINDINGS } from "../fixtures/demo-case";

export function analyzeDocument(extraction: InvoiceExtraction | null, isFutureRules: boolean): Finding | null {
  if (!extraction) {
    // Demo fallback or failed extraction
    const invoiceFinding = FIXTURE_FINDINGS.find((f) => f.id === "invoice");
    if (!invoiceFinding) return null;

    if (!isFutureRules) {
      return { ...invoiceFinding, status: "inactive" };
    }
    return { ...invoiceFinding, status: "open" };
  }

  // Live Qwen mode logic would go here if we dynamically generated findings based on the extraction
  // For the sake of the hackathon MVP, if we have a live extraction, we'll still use the mock finding
  // if future rules are enabled to show the UI blocker, or dynamically check fields.
  const missingFields = [];
  if (!extraction.invoiceNumber?.value) missingFields.push("Invoice Number");
  if (!extraction.sellerVatNumber?.value) missingFields.push("Seller VAT");

  if (missingFields.length > 0 && isFutureRules) {
    return {
      id: "invoice",
      badge: "I",
      title: `${missingFields.length} invoices fail the October 2026 rule pack`,
      description: `Missing fields: ${missingFields.join(", ")}`,
      tag: "Future rule active",
      severity: "medium",
      meta: ["Rule pack: v2026.10", `${missingFields.length} mandatory fields`, "Claim value: LKR 0.8M"],
      scoreGain: 4,
      amountLkrM: 0.8,
      confidence: 90,
      ruleId: "DOC-021",
      graphTitle: "Invoice compliance chain",
      graph: [
        { title: "Invoice", detail: "Uploaded document" },
        { title: "Qwen-VL extraction", detail: `Missing ${missingFields.join(", ")}` },
        { title: "Rule pack v2026.10", detail: "Effective 1 Oct 2026" },
        { title: "Validation", detail: `${missingFields.length} mandatory fields missing`, status: "warning" },
        { title: "Human action", detail: "Correct and approve fields", status: "action" },
      ],
      status: "open",
    };
  }

  return null;
}
