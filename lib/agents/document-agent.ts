import { InvoiceExtraction } from "../ai/extraction-schema";
import { Finding } from "../types";
import { FIXTURE_FINDINGS } from "../fixtures/demo-case";
import { vatInvoiceRulePack, type InvoiceFieldRule } from "../government-data";

function hasValue(value: unknown): boolean {
  return value !== null && value !== undefined && (typeof value !== "string" || value.trim() !== "");
}

function extractedValue(extraction: InvoiceExtraction, path: string): unknown {
  if (path.startsWith("lineItems[].")) {
    const field = path.split(".")[1] as "description" | "quantity";
    return extraction.lineItems.some((item) => hasValue(item[field]?.value));
  }

  const field = path.split(".")[0] as keyof InvoiceExtraction;
  const extracted = extraction[field];
  if (!extracted || Array.isArray(extracted)) return null;
  return extracted.value;
}

function validationError(rule: InvoiceFieldRule, value: unknown): string | null {
  if (!hasValue(value)) return rule.required ? `${rule.label} is missing` : null;
  if (value === true) return null;

  const text = String(value).trim();
  const patterns = vatInvoiceRulePack.patterns;
  if (rule.validation === "tin" && !new RegExp(patterns.tin).test(text)) {
    return `${rule.label} must contain nine digits`;
  }
  if (
    rule.validation === "invoice-serial" &&
    (!new RegExp(patterns.invoiceSerial).test(text) || text.length > patterns.invoiceSerialMaxLength)
  ) {
    return `${rule.label} must follow YYMMM_QQQQ_XXXXX with no spaces`;
  }
  if (rule.validation === "date" && !new RegExp(patterns.date).test(text)) {
    return `${rule.label} must use MM/DD/YYYY`;
  }
  if (rule.validation === "lkr" && !["LKR", "RS", "RS.", "රු"].includes(text.toUpperCase())) {
    return `${rule.label} must be in Sri Lankan Rupees (LKR)`;
  }
  if (rule.validation === "tax-invoice-title" && text.toUpperCase() !== "TAX INVOICE") {
    return `${rule.label} is not shown exactly`;
  }
  return null;
}

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

  if (!isFutureRules) return null;

  const issues = vatInvoiceRulePack.fields
    .map((rule) => validationError(rule, extractedValue(extraction, rule.extractionPath)))
    .filter((issue): issue is string => Boolean(issue));

  if (issues.length > 0) {
    const preview = issues.slice(0, 4);
    const remaining = issues.length - preview.length;
    return {
      id: "invoice",
      badge: "I",
      title: `${issues.length} invoice check${issues.length === 1 ? "" : "s"} fail the October 2026 rule pack`,
      description: `${preview.join("; ")}${remaining > 0 ? `; plus ${remaining} more` : ""}.`,
      tag: "Future rule active",
      severity: "medium",
      meta: [
        `Rule pack: ${vatInvoiceRulePack.version}`,
        `${issues.length} failed checks`,
        "Sources: Gazette 2481/22 + 2500/106",
      ],
      scoreGain: 4,
      amountLkrM: 0.8,
      confidence: 90,
      ruleId: "DOC-021",
      graphTitle: "Invoice compliance chain",
      graph: [
        { title: "Invoice", detail: "Uploaded document" },
        { title: "Qwen-VL extraction", detail: `${issues.length} field or format checks need attention` },
        { title: `Rule pack ${vatInvoiceRulePack.version}`, detail: "Gazette-backed · effective 1 Oct 2026" },
        { title: "Validation", detail: preview.join("; "), status: "warning" },
        { title: "Human action", detail: "Correct the source invoice and approve the evidence", status: "action" },
      ],
      status: "open",
    };
  }

  return null;
}
