import type { InvoiceExtraction } from "../ai/extraction-schema";
import { vatInvoiceRulePack, type InvoiceFieldRule } from "../government-data";
import type { Finding } from "../types";

export type InvoiceRuleIssue = {
  key: string;
  label: string;
  extractionPath: string;
  message: string;
  value: string | number | boolean | null;
  confidence: number;
  validation: string;
};

function hasValue(value: unknown): boolean {
  return value !== null && value !== undefined && (typeof value !== "string" || value.trim() !== "");
}

function extractedField(
  extraction: InvoiceExtraction,
  path: string,
): { value: string | number | boolean | null; confidence: number } {
  if (path.startsWith("lineItems[].")) {
    const field = path.split(".")[1] as "description" | "quantity";
    const candidate = extraction.lineItems.find((item) => hasValue(item[field]?.value))?.[field];
    return {
      value: (candidate?.value as string | number | null | undefined) ?? null,
      confidence: candidate?.confidence ?? 0,
    };
  }

  const field = path.split(".")[0] as keyof InvoiceExtraction;
  const extracted = extraction[field];
  if (!extracted || Array.isArray(extracted)) return { value: null, confidence: 0 };
  return {
    value: extracted.value as string | number | boolean | null,
    confidence: extracted.confidence,
  };
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

export function validateInvoiceRules(extraction: InvoiceExtraction): InvoiceRuleIssue[] {
  return vatInvoiceRulePack.fields.flatMap((rule) => {
    const extracted = extractedField(extraction, rule.extractionPath);
    const message = validationError(rule, extracted.value);
    if (!message) return [];
    return [
      {
        key: rule.key,
        label: rule.label,
        extractionPath: rule.extractionPath,
        message,
        value: extracted.value,
        confidence: extracted.confidence,
        validation: rule.validation,
      },
    ];
  });
}

function numberValue(value: string | number | null): number | null {
  if (value === null) return null;
  const parsed = typeof value === "number" ? value : Number(value.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

export function analyzeDocument(
  extraction: InvoiceExtraction | null,
  isFutureRules: boolean,
): Finding | null {
  // A user-provided file that could not be extracted must not inherit an
  // unrelated fixture finding. The route already reports the extraction error.
  if (!extraction || !isFutureRules) return null;

  const issues = validateInvoiceRules(extraction);
  if (issues.length === 0) return null;

  const preview = issues.slice(0, 4);
  const remaining = issues.length - preview.length;
  const vatAmount = numberValue(extraction.vatTotal.value);

  return {
    id: "invoice",
    badge: "I",
    title: `${issues.length} invoice check${issues.length === 1 ? "" : "s"} fail the October 2026 rule pack`,
    description: `${preview.map((issue) => issue.message).join("; ")}${remaining > 0 ? `; plus ${remaining} more` : ""}.`,
    tag: "AI fix review",
    severity: "medium",
    meta: [
      `Rule pack: ${vatInvoiceRulePack.version}`,
      `${issues.length} failed checks`,
      "Sources: Gazette 2481/22 + 2500/106",
    ],
    scoreGain: 4,
    amountLkrM: Number(((vatAmount ?? 0) / 1_000_000).toFixed(4)),
    confidence: Math.round(
      issues.reduce((total, issue) => total + issue.confidence, 0) / Math.max(issues.length, 1),
    ),
    ruleId: "DOC-021",
    graphTitle: "Invoice compliance chain",
    graph: [
      { title: "Invoice", detail: "Schema-validated extracted document" },
      { title: "Qwen extraction", detail: `${issues.length} field or format checks need attention` },
      { title: `Rule pack ${vatInvoiceRulePack.version}`, detail: "Gazette-backed · effective 1 Oct 2026" },
      { title: "Validation", detail: preview.map((issue) => issue.message).join("; "), status: "warning" },
      { title: "Human action", detail: "Review the correction draft or request missing evidence", status: "action" },
    ],
    status: "open",
  };
}
