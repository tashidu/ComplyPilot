import type { Finding, Score, ScoreBreakdown } from "../types";

/**
 * The single source of truth for the readiness score.
 *
 * A language model never produces this number. Every point is awarded by the
 * rules below so a reviewer can reproduce the total by hand.
 *
 * Demo fixture: 68/100 with three open blockers, 89/100 once all three are
 * resolved. It deliberately does not reach 100 - the remaining 11 points need
 * evidence the synthetic case does not contain, and a compliance tool that
 * hands out perfect scores is not credible.
 */

export type ScoreKey = keyof ScoreBreakdown;

export const SCORE_CONFIG: Record<ScoreKey, { label: string; base: number; max: number }> = {
  document: { label: "Document completeness", base: 24, max: 30 },
  schedule: { label: "Schedule reconciliation", base: 18, max: 25 },
  supplier: { label: "Supplier evidence", base: 8, max: 20 },
  customs: { label: "Customs reconciliation", base: 10, max: 15 },
  package: { label: "Submission package", base: 8, max: 10 },
};

/** Points awarded when a blocker is cleared. Sum of all awards is 21 (68 -> 89). */
const AWARDS = {
  /** The invoice passes the active rule pack, or that pack does not apply. */
  invoiceSatisfied: { document: 4 },
  customsResolved: { schedule: 2, customs: 5 },
  supplierResolved: { supplier: 10 },
} as const;

export function calculateReadiness(findings: Finding[]): Score {
  const components = Object.fromEntries(
    (Object.keys(SCORE_CONFIG) as ScoreKey[]).map((key) => [key, SCORE_CONFIG[key].base]),
  ) as ScoreBreakdown;

  const statusOf = (id: string) => findings.find((f) => f.id === id)?.status;
  const isResolved = (id: string) => statusOf(id) === "resolved";
  const isOpen = (id: string) => statusOf(id) === "open";

  // An invoice finding that is resolved, or inactive because the historical
  // rule profile is selected, both satisfy document completeness.
  if (!isOpen("invoice")) components.document += AWARDS.invoiceSatisfied.document;

  if (isResolved("customs")) {
    components.schedule += AWARDS.customsResolved.schedule;
    components.customs += AWARDS.customsResolved.customs;
  }

  if (isResolved("supplier")) components.supplier += AWARDS.supplierResolved.supplier;

  const total = (Object.values(components) as number[]).reduce((sum, value) => sum + value, 0);
  return { total, components };
}

/** Input VAT value, in LKR millions, connected to evidence that is still open. */
export function calculateClaimValue(findings: Finding[]): number {
  return findings
    .filter((finding) => finding.status === "open")
    .reduce((sum, finding) => sum + finding.amountLkrM, 0);
}
