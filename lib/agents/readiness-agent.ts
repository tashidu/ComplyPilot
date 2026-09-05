import type { Finding, Score } from "../types";
import { calculateClaimValue, calculateReadiness as score } from "../rules/scoring";

/**
 * Refund Readiness Agent.
 *
 * It combines validated findings from the specialist agents and calls the
 * deterministic scoring rules. The scoring itself lives in lib/rules/scoring.ts
 * so there is exactly one place where points are awarded.
 */
export function calculateReadiness(findings: Finding[]): Score {
  return score(findings);
}

export { calculateClaimValue };
