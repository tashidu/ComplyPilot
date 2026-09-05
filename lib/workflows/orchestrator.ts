import { extractInvoiceData } from "../ai/qwen-client";
import { analyzeDocument } from "../agents/document-agent";
import { analyzeReconciliation } from "../agents/reconciliation-agent";
import { calculateReadiness, calculateClaimValue } from "../agents/readiness-agent";
import { AnalyzeResult, Finding } from "../types";

export type UploadedImage = {
  base64: string;
  mimeType: string;
};

export async function runOrchestrator(
  image: UploadedImage | null,
  isFutureRules: boolean,
  resolvedBlockers: string[] = [],
): Promise<AnalyzeResult> {
  let mode: AnalyzeResult["mode"] = "LIVE_QWEN";
  let fallbackReason: string | null = null;
  let extraction = null;

  if (image) {
    try {
      extraction = await extractInvoiceData(image.base64, image.mimeType);
    } catch (error) {
      // The demo must stay usable when Model Studio is unavailable, but it must
      // never present fixture data as a live model response.
      mode = "DEMO_FALLBACK";
      fallbackReason = error instanceof Error ? error.message : "Extraction failed.";
      console.warn("[orchestrator] Qwen extraction failed, using demo fixtures:", fallbackReason);
    }
  } else {
    mode = "DEMO_FALLBACK";
    fallbackReason = "No document was uploaded, so the synthetic demo case is shown.";
  }

  // 1. Document Agent
  const docFinding = analyzeDocument(extraction, isFutureRules);

  // 2. Reconciliation Agent
  const reconFindings = analyzeReconciliation();

  // Combine findings
  let allFindings: Finding[] = [];
  if (docFinding) allFindings.push(docFinding);
  allFindings.push(...reconFindings);

  // Apply resolved status based on human actions
  allFindings = allFindings.map((finding) => {
    if (resolvedBlockers.includes(finding.id)) {
      return { ...finding, status: "resolved" as const };
    }
    return finding;
  });

  // 3. Readiness Agent
  const score = calculateReadiness(allFindings, isFutureRules);
  const claimValueUnderReviewLkr = calculateClaimValue(allFindings);

  return {
    runId: `RUN-${Math.random().toString(36).substring(2, 9).toUpperCase()}`,
    mode,
    fallbackReason,
    invoice: extraction,
    findings: allFindings,
    score,
    claimValueUnderReviewLkr,
    auditEvents: [],
  };
}
