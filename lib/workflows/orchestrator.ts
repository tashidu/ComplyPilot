import { extractInvoiceData } from "../ai/qwen-client";
import { analyzeDocument } from "../agents/document-agent";
import { analyzeReconciliation } from "../agents/reconciliation-agent";
import { calculateReadiness, calculateClaimValue } from "../agents/readiness-agent";
import {
  AnalyzeResult,
  Finding,
  TraceStage,
  VatScheduleEvidence,
  WorkflowInfo,
} from "../types";
import type { StoredRun } from "../runs/run-store";
import {
  governmentDataSummary,
  inactiveVatSnapshot,
  vatInvoiceRulePack,
  vatRates,
  vatSchedules,
} from "../government-data";
import {
  compareMuleRunResult,
  isMuleRunConfigured,
  runMuleRunWorkflow,
  type WorkflowInput,
} from "./mulerun-adapter";

export type UploadedImage = {
  base64: string;
  mimeType: string;
};

/** Synthetic totals the reconciliation agent works against. */
const FIXTURE_TOTALS = {
  scheduleLkr: 18_300_000,
  cusdecLkr: 16_000_000,
  supplierSnapshotDate: "2025-11-18",
};

/** Times a stage and records it on the trace, so the UI shows real durations. */
async function timed<T>(
  trace: TraceStage[],
  name: string,
  run: () => T | Promise<T>,
): Promise<T> {
  const started = performance.now();
  try {
    const value = await run();
    trace.push({ name, status: "ok", ms: Math.round(performance.now() - started) });
    return value;
  } catch (error) {
    trace.push({
      name,
      status: "failed",
      ms: Math.round(performance.now() - started),
      detail: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

export async function runOrchestrator(
  image: UploadedImage | null,
  isFutureRules: boolean,
  resolvedBlockers: string[] = [],
  /** A previous run to continue, so a live extraction survives later clicks. */
  previous?: StoredRun,
  /** A newly uploaded VAT Schedule CSV. Previous evidence is reused when omitted. */
  scheduleUpload?: VatScheduleEvidence,
): Promise<AnalyzeResult> {
  const trace: TraceStage[] = [];
  let mode: AnalyzeResult["mode"] = "LIVE_QWEN";
  let fallbackReason: string | null = null;
  let extraction = null;
  const scheduleEvidence = scheduleUpload ?? previous?.scheduleEvidence ?? null;

  if (image) {
    const started = performance.now();
    try {
      extraction = await extractInvoiceData(image.base64, image.mimeType);
      trace.push({
        name: "Qwen extraction",
        status: "ok",
        ms: Math.round(performance.now() - started),
      });
    } catch (error) {
      // The demo must stay usable when Model Studio is unavailable, but it must
      // never present fixture data as a live model response.
      mode = "DEMO_FALLBACK";
      fallbackReason = error instanceof Error ? error.message : "Extraction failed.";
      trace.push({
        name: "Qwen extraction",
        status: "failed",
        ms: Math.round(performance.now() - started),
        detail: fallbackReason,
      });
      console.warn("[orchestrator] Qwen extraction failed, using demo fixtures:", fallbackReason);
    }
  } else if (previous) {
    // Resolving a blocker or changing rule profile re-runs the deterministic
    // checks against whatever this run already extracted.
    extraction = previous.extraction;
    mode = previous.mode;
    fallbackReason = previous.fallbackReason;
    trace.push({
      name: "Qwen extraction",
      status: "ok",
      ms: 0,
      detail: "Reused the extraction from this run.",
    });
  } else {
    mode = "DEMO_FALLBACK";
    fallbackReason = "No document was uploaded, so the synthetic demo case is shown.";
    trace.push({
      name: "Qwen extraction",
      status: "waiting",
      ms: 0,
      detail: "No document uploaded.",
    });
  }

  const runId =
    previous?.runId ?? `RUN-${Math.random().toString(36).substring(2, 9).toUpperCase()}`;

  // 1. Document Compliance Agent
  const docFinding = await timed(trace, "Document Compliance Agent", () =>
    analyzeDocument(extraction, isFutureRules),
  );

  // 2. Supplier & Reconciliation Agent
  const reconciliation = await timed(trace, "Reconciliation Agent", () =>
    analyzeReconciliation(extraction, scheduleEvidence),
  );

  let allFindings: Finding[] = [];
  if (docFinding) allFindings.push(docFinding);
  allFindings.push(...reconciliation.findings);

  // Apply resolved status based on human actions
  allFindings = allFindings.map((finding) =>
    resolvedBlockers.includes(finding.id) ? { ...finding, status: "resolved" as const } : finding,
  );

  // 3. Hand the structured case to MuleRun when it is configured. A failure is
  // never fatal - the local rules below still produce the same shaped result.
  let workflowMode: WorkflowInfo["mode"] = "LOCAL";
  let executionId: string | null = null;
  let workflowFallbackReason: string | null = null;
  let muleRunAttempted = false;

  if (process.env.WORKFLOW_MODE === "mulerun") {
    muleRunAttempted = true;
    const started = performance.now();
    try {
      if (!isMuleRunConfigured()) {
        throw new Error("MULERUN_API_URL or MULERUN_API_KEY is not set.");
      }
      const input: WorkflowInput = {
        runId,
        ruleProfile: isFutureRules ? "v2026.10" : "historical",
        invoice: (extraction as Record<string, unknown> | null) ?? null,
        schedule: {
          source: scheduleEvidence ? "upload" : "fixture",
          fileName: scheduleEvidence?.fileName ?? null,
          rowCount: scheduleEvidence?.rows.length ?? 0,
          totalLkr: reconciliation.schedule.totals?.netAmount ?? FIXTURE_TOTALS.scheduleLkr,
          rows: scheduleEvidence?.rows ?? [],
        },
        cusdec: { totalLkr: FIXTURE_TOTALS.cusdecLkr },
        supplier: { snapshotDate: FIXTURE_TOTALS.supplierSnapshotDate },
        governmentContext: {
          sourceVerifiedAt: governmentDataSummary.lastVerifiedAt ?? "unknown",
          invoiceRulePack: {
            id: vatInvoiceRulePack.id,
            version: vatInvoiceRulePack.version,
            effectiveFrom: vatInvoiceRulePack.effectiveFrom,
            sourceIds: vatInvoiceRulePack.sourceIds,
          },
          vatRates: vatRates.rates.map((rate) => ({
            id: rate.id,
            ratePercent: rate.ratePercent,
            effectiveFrom: rate.effectiveFrom,
          })),
          schedules: vatSchedules.schedules.map((schedule) => ({
            id: schedule.id,
            name: schedule.name,
          })),
          supplierSnapshot: {
            id: inactiveVatSnapshot.id,
            effectiveDate: inactiveVatSnapshot.effectiveDate,
            containsTaxpayerRecords: false,
          },
        },
        resolvedBlockers,
      };
      const result = await runMuleRunWorkflow(input);

      // Advisory only. Remote statuses are compared, never applied: see
      // compareMuleRunResult for why accepting them would be a scoring hole.
      const disagreements = compareMuleRunResult(allFindings, result);
      workflowMode = "LIVE_MULERUN";
      executionId = result.executionId;
      trace.push({
        name: "MuleRun workflow",
        status: "ok",
        ms: Math.round(performance.now() - started),
        detail:
          disagreements.length === 0
            ? `Execution ${result.executionId} agrees with the local rules pack.`
            : `Execution ${result.executionId} disagrees on ${disagreements
                .map((d) => `${d.findingId} (workflow ${d.remoteStatus}, local ${d.localStatus})`)
                .join(", ")}. Local findings kept.`,
      });
    } catch (error) {
      workflowFallbackReason = error instanceof Error ? error.message : String(error);
      trace.push({
        name: "MuleRun workflow",
        status: "failed",
        ms: Math.round(performance.now() - started),
        detail: workflowFallbackReason,
      });
      console.warn("[orchestrator] MuleRun unavailable, using local orchestrator:", workflowFallbackReason);
    }
  } else {
    workflowFallbackReason =
      "WORKFLOW_MODE is not set to mulerun, so the local orchestrator ran.";
  }

  // 4. Refund Readiness Agent. The score is always computed here, never taken
  // from a remote workflow, so the number stays reproducible by hand.
  const score = await timed(trace, "Refund Readiness Agent", () =>
    calculateReadiness(allFindings),
  );
  const claimValueUnderReviewLkr = calculateClaimValue(allFindings);

  const openCount = allFindings.filter((finding) => finding.status === "open").length;
  const gate: WorkflowInfo["gate"] = openCount === 0 ? "READY_TO_FILE" : "NEEDS_HUMAN";
  trace.push({
    name: "Human approval gate",
    status: gate === "READY_TO_FILE" ? "ok" : "waiting",
    ms: 0,
    detail:
      gate === "READY_TO_FILE"
        ? "All blockers resolved. Awaiting explicit human approval."
        : `${openCount} blocker${openCount === 1 ? "" : "s"} must be resolved by a human.`,
  });

  return {
    runId,
    mode,
    workflow: {
      mode: workflowMode,
      executionId,
      fallbackReason: workflowMode === "LIVE_MULERUN" ? null : workflowFallbackReason,
      muleRunAttempted,
      trace,
      gate,
    },
    fallbackReason,
    invoice: extraction,
    scheduleEvidence,
    scheduleReconciliation: reconciliation.schedule,
    findings: allFindings,
    score,
    claimValueUnderReviewLkr,
    auditEvents: [],
  };
}
