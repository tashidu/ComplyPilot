import { Finding, Score, ScoreBreakdown } from "../types";

const SCORE_CONFIG = {
  document: { base: 24, max: 30 },
  schedule: { base: 18, max: 25 },
  supplier: { base: 8, max: 20 },
  customs: { base: 10, max: 15 },
  package: { base: 8, max: 10 },
};

export function calculateReadiness(findings: Finding[], isFutureRules: boolean): Score {
  const values: ScoreBreakdown = {
    document: SCORE_CONFIG.document.base,
    schedule: SCORE_CONFIG.schedule.base,
    supplier: SCORE_CONFIG.supplier.base,
    customs: SCORE_CONFIG.customs.base,
    package: SCORE_CONFIG.package.base,
  };

  const isResolved = (id: string) => findings.find(f => f.id === id)?.status === "resolved";
  const isInactive = (id: string) => findings.find(f => f.id === id)?.status === "inactive";
  const isOpen = (id: string) => findings.find(f => f.id === id)?.status === "open";

  // Document score
  if (!isOpen("invoice")) {
    values.document += 6; // Max 30
  }

  // Customs/Schedule score
  if (isResolved("customs")) {
    values.schedule += 7; // Max 25
    values.customs += 5; // Max 15
  }

  // Supplier score
  if (isResolved("supplier")) {
    values.supplier += 12; // Max 20
  }

  // Package score
  if (!isOpen("invoice") && isResolved("customs") && isResolved("supplier")) {
    values.package += 2; // Max 10
  }

  const total = values.document + values.schedule + values.supplier + values.customs + values.package;

  return {
    total,
    components: values,
  };
}

export function calculateClaimValue(findings: Finding[]): number {
  return findings
    .filter(f => f.status === "open")
    .reduce((sum, f) => sum + f.amountLkrM, 0);
}
