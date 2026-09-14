import { governmentSources, vatInvoiceRulePack } from "../government-data";

/**
 * Chooses the invoice rule pack from the document's own date.
 *
 * Gazette 2481/22 specified the revised tax-invoice format. Gazette 2500/106
 * left the specification unchanged but moved its effective date from
 * 1 July 2026 to 1 October 2026. A document dated before that date is not
 * judged against the later format, and the UI must not imply it was mandatory.
 *
 * The Time Machine may override the outcome so a reviewer can ask "what would
 * this invoice look like under the other profile" - but an override is always
 * recorded as such, never presented as the date-derived answer.
 */

export type RuleProfileId = "historical" | "v2026.10";

export type RuleProfileSelection = {
  profile: RuleProfileId;
  /** True when the later invoice specification governs this document. */
  futureRules: boolean;
  effectiveFrom: string;
  /** Why this profile was chosen, in words a reviewer can check. */
  reason: string;
  /** Set when a human overrode the date-derived answer. */
  overriddenFrom: RuleProfileId | null;
  sourceIds: string[];
  invoiceDate: string | null;
};

/** Accepts ISO (YYYY-MM-DD) and the MM/DD/YYYY form the rule pack validates. */
export function parseInvoiceDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const raw = value.trim();

  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (iso) return asUtc(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const slash = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(raw);
  if (slash) return asUtc(Number(slash[3]), Number(slash[1]), Number(slash[2]));

  return null;
}

function asUtc(year: number, month: number, day: number): Date | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  // Reject a rolled-over date such as 02/31.
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date;
}

/** The gazette that set the format, plus any later one that amended its date. */
export function invoiceRuleSourceIds(): string[] {
  const declared = vatInvoiceRulePack.sourceIds ?? [];
  const known = new Set(governmentSources.map((source) => source.id));
  return declared.filter((id) => known.has(id));
}

export function selectInvoiceRuleProfile(
  invoiceDate: string | null | undefined,
  override?: RuleProfileId | null,
): RuleProfileSelection {
  const effectiveFrom = vatInvoiceRulePack.effectiveFrom;
  const boundary = parseInvoiceDate(effectiveFrom);
  const parsed = parseInvoiceDate(invoiceDate);
  const sourceIds = invoiceRuleSourceIds();

  let profile: RuleProfileId;
  let reason: string;

  if (!parsed || !boundary) {
    // No usable date: do not assert that the later specification applied.
    profile = "historical";
    reason = invoiceDate
      ? `Invoice date "${invoiceDate}" could not be read, so the later specification is not asserted. A human must confirm the date.`
      : "No invoice date is available, so the later specification is not asserted.";
  } else if (parsed.getTime() >= boundary.getTime()) {
    profile = "v2026.10";
    reason = `Invoice dated ${iso(parsed)} falls on or after ${effectiveFrom}, so the revised tax-invoice format applies.`;
  } else {
    profile = "historical";
    reason = `Invoice dated ${iso(parsed)} precedes ${effectiveFrom}, so the revised tax-invoice format was not yet mandatory.`;
  }

  const derived = profile;
  if (override && override !== derived) {
    profile = override;
    reason =
      `${reason} A reviewer selected the ${override === "v2026.10" ? "October 2026" : "historical"} profile ` +
      `to compare, so this result is a what-if, not the rule in force on the invoice date.`;
  }

  return {
    profile,
    futureRules: profile === "v2026.10",
    effectiveFrom,
    reason,
    overriddenFrom: override && override !== derived ? derived : null,
    sourceIds,
    invoiceDate: parsed ? iso(parsed) : null,
  };
}

function iso(date: Date): string {
  return date.toISOString().slice(0, 10);
}
