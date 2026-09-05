import { Finding } from "../types";
import { FIXTURE_FINDINGS } from "../fixtures/demo-case";

export function analyzeReconciliation(): Finding[] {
  // In a real app, this would compare the invoice and schedules.
  // For the hackathon MVP, we return the fixture blockers for supplier and customs.
  
  const supplierFinding = FIXTURE_FINDINGS.find((f) => f.id === "supplier");
  const customsFinding = FIXTURE_FINDINGS.find((f) => f.id === "customs");
  
  const findings: Finding[] = [];
  if (supplierFinding) findings.push(supplierFinding);
  if (customsFinding) findings.push(customsFinding);

  return findings;
}
