import { extractInvoiceData } from "../ai/qwen-client";
import { analyzeDocument } from "../agents/document-agent";
import { analyzeReconciliation } from "../agents/reconciliation-agent";
import { calculateReadiness, calculateClaimValue } from "../agents/readiness-agent";
import { createRescuePlan } from "../agents/rescue-planner-agent";
import { createSmartFixPlan } from "../agents/smart-fix-agent";
import { selectInvoiceRuleProfile } from "../rules/rule-selection";
import {
  AGENT_PIPELINE,
  PIPELINE_VERSION,
  agentStage,
  buildPipelineView,
  type AgentId,
} from "./pipeline";
import {
  AnalyzeResult,
  DataMode,
  Finding,
  TraceStage,
  VatScheduleEvidence,
  WorkflowInfo,
} from "../types";
import type { StoredRun } from "../runs/run-store";
import { FIXTURE_INVOICE } from "../fixtures/demo-case";
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

/** Who actually made the call at this stage, for the trace badge. */
function decidedBy(agent: AgentId): TraceStage["decidedBy"] {
  const kind = agentStage(agent).intelligence;
  if (kind === "qwen") return "qwen";
  if (kind === "human") return "human";
  return "deterministic";
}

/** Times a stage and records it on the trace, so the UI shows real durations. */
async function timed<T>(
  trace: TraceStage[],
  name: string,
  run: () => T | Promise<T>,
  agent?: AgentId,
): Promise<T> {
  const started = performance.now();
  const identity = agent
    ? { agent, ordinal: agentStage(agent).ordinal, decidedBy: decidedBy(agent) }
    : {};
  try {
    const value = await run();
    trace.push({ name, status: "ok", ms: Math.round(performance.now() - started), ...identity });
    return value;
  } catch (error) {
    trace.push({
      name,
      status: "failed",
      ms: Math.round(performance.now() - started),
      detail: error instanceof Error ? error.message : String(error),
      ...identity,
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
  /** Explicitly separates the bundled golden case from user-provided evidence. */
  requestedDataMode?: DataMode,
): Promise<AnalyzeResult> {
  const trace: TraceStage[] = [];
  const previousDataMode = previous?.analysis.dataMode;
  const dataMode: DataMode =
    requestedDataMode ??
    previousDataMode ??
    (image || scheduleUpload ? "USER_PROVIDED" : "SYNTHETIC_DEMO");
  const reusablePrevious = previousDataMode === dataMode ? previous : undefined;
  let mode: AnalyzeResult["mode"] = "DEMO_FALLBACK";
  let fallbackReason: string | null = null;
  // Stage 1 of the declared pipeline. Every extraction outcome - live, reused,
  // fixture or unavailable - is reported under the same agent identity so the
  // trace always shows seven stages.
  const documentStage = {
    name: agentStage("document").name,
    agent: "document" as const,
    ordinal: agentStage("document").ordinal,
    decidedBy: "qwen" as const,
  };

  let extraction = null;
  const scheduleEvidence = scheduleUpload ?? reusablePrevious?.scheduleEvidence ?? null;

  if (image) {
    const started = performance.now();
    try {
      extraction = await extractInvoiceData(image.base64, image.mimeType);
      mode = "LIVE_QWEN";
      trace.push({
        ...documentStage,
        status: "ok",
        ms: Math.round(performance.now() - started),
      });
    } catch (error) {
      // The demo must stay usable when Model Studio is unavailable, but it must
      // never present fixture data as a live model response.
      mode = "DEMO_FALLBACK";
      fallbackReason = error instanceof Error ? error.message : "Extraction failed.";
      trace.push({
        ...documentStage,
        status: "failed",
        ms: Math.round(performance.now() - started),
        detail: fallbackReason,
      });
      console.warn("[orchestrator] Qwen extraction failed, using demo fixtures:", fallbackReason);
    }
  } else if (reusablePrevious) {
    // Resolving a blocker or changing rule profile re-runs the deterministic
    // checks against whatever this run already extracted.
    extraction = reusablePrevious.extraction;
    mode = reusablePrevious.mode;
    fallbackReason = reusablePrevious.fallbackReason;
    trace.push({
      ...documentStage,
      status: "ok",
      ms: 0,
      detail: "Reused the extraction from this run.",
    });
  } else if (dataMode === "SYNTHETIC_DEMO") {
    extraction = FIXTURE_INVOICE;
    mode = "DEMO_FALLBACK";
    fallbackReason = "The named synthetic Team Odin demo invoice is shown; Model Studio was not called.";
    trace.push({
      ...documentStage,
      status: "waiting",
      ms: 0,
      detail: "Synthetic extraction fixture loaded; no Model Studio call occurred.",
    });
  } else {
    mode = "DEMO_FALLBACK";
    fallbackReason = "No usable extraction exists for this user-provided case.";
    trace.push({
      ...documentStage,
      status: "waiting",
      ms: 0,
      detail: "User-provided case is waiting for a supported invoice image.",
    });
  }

  const runId =
    reusablePrevious?.runId ?? `RUN-${Math.random().toString(36).substring(2, 9).toUpperCase()}`;

  // 1. Document Compliance Agent
  const docFinding = await timed(
    trace,
    "Temporal rule validation",
    () => analyzeDocument(extraction, isFutureRules),
    "temporal",
  );

  // Which rule pack the invoice's own date selects. The UI toggle is treated as
  // a reviewer override so a disagreement is shown as a what-if rather than
  // silently presented as the rule in force on that date.
  const documentDate =
    (extraction as any)?.invoiceDate?.value ?? (extraction as any)?.supplyDate?.value ?? null;
  const ruleSelection = selectInvoiceRuleProfile(
    documentDate,
    isFutureRules ? "v2026.10" : "historical",
  );
  trace.push({
    name: agentStage("temporal").name,
    status: ruleSelection.overriddenFrom ? "waiting" : "ok",
    ms: 0,
    detail: ruleSelection.reason,
    agent: "temporal",
    ordinal: agentStage("temporal").ordinal,
    decidedBy: "deterministic",
  });

  const smartFix = await timed(
    trace,
    agentStage("smart-fix").name,
    () => createSmartFixPlan(extraction, isFutureRules),
    "smart-fix",
  );
  trace.at(-1)!.detail =
    smartFix.status === "NEEDS_REVIEW"
      ? `${smartFix.autoDraftCount} safe draft action(s); ${smartFix.humanInputCount} source fact(s) need a human.`
      : `Smart Fix status: ${smartFix.status}.`;

  // 2. Supplier & Reconciliation Agent
  const reconciliation = await timed(
    trace,
    agentStage("reconciliation").name,
    () => analyzeReconciliation(extraction, scheduleEvidence, dataMode === "SYNTHETIC_DEMO"),
    "reconciliation",
  );
  trace.at(-1)!.detail =
    reconciliation.schedule.matchScore === null
      ? `Status: ${reconciliation.schedule.status}.`
      : `${reconciliation.schedule.matchMode} returned ${reconciliation.schedule.matchScore}/100; status ${reconciliation.schedule.status}.`;

  let allFindings: Finding[] = [];
  if (docFinding) allFindings.push(docFinding);
  allFindings.push(...reconciliation.findings);

  // Apply resolved status based on human actions.
  //
  // The schedule check is the exception: while reconciliation is waiting for an
  // invoice there is nothing for a human to have fixed, so it cannot be marked
  // resolved. Allowing it would award the matched-schedule points - and show a
  // higher score - while the panel still reads "invoice extraction required".
  const scheduleAwaitsInvoice = reconciliation.schedule?.status === "NEEDS_INVOICE";
  allFindings = allFindings.map((finding) => {
    if (finding.id === "schedule" && scheduleAwaitsInvoice) {
      return { ...finding, status: "inactive" as const };
    }
    return resolvedBlockers.includes(finding.id)
      ? { ...finding, status: "resolved" as const }
      : finding;
  });

  // 3. Hand the structured case to MuleRun when it is configured. A failure is
  // never fatal - the local rules below still produce the same shaped result.
  let workflowMode: WorkflowInfo["mode"] = "LOCAL";
  let executionId: string | null = null;
  let workflowFallbackReason: string | null = null;
  let muleRunAttempted = false;
  /** What MuleRun reported per declared agent. Displayed, never authoritative. */
  let muleRunStages: { agent?: string; status?: string; ms: number }[] = [];

  if (process.env.WORKFLOW_MODE === "mulerun") {
    muleRunAttempted = true;
    const started = performance.now();
    try {
      if (!isMuleRunConfigured()) {
        throw new Error("MULERUN_API_URL or MULERUN_API_KEY is not set.");
      }
      const input: WorkflowInput = {
        runId,
        // The remote workflow reports against these same seven agents, so the
        // local and remote traces can be compared stage by stage.
        pipeline: {
          version: PIPELINE_VERSION,
          agents: AGENT_PIPELINE.map(({ id, ordinal, name, role }) => ({
            id,
            ordinal,
            name,
            role,
          })),
        },
        ruleProfile: isFutureRules ? "v2026.10" : "historical",
        invoice: (extraction as Record<string, unknown> | null) ?? null,
        schedule: {
          source: scheduleEvidence ? "upload" : dataMode === "SYNTHETIC_DEMO" ? "fixture" : "not-supplied",
          fileName: scheduleEvidence?.fileName ?? null,
          rowCount: scheduleEvidence?.rows.length ?? 0,
          totalLkr:
            reconciliation.schedule.totals?.netAmount ??
            (dataMode === "SYNTHETIC_DEMO" ? FIXTURE_TOTALS.scheduleLkr : 0),
          rows: scheduleEvidence?.rows ?? [],
        },
        cusdec: { totalLkr: dataMode === "SYNTHETIC_DEMO" ? FIXTURE_TOTALS.cusdecLkr : 0 },
        supplier: {
          snapshotDate:
            dataMode === "SYNTHETIC_DEMO" ? FIXTURE_TOTALS.supplierSnapshotDate : "not-supplied",
        },
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
      muleRunStages = result.stages ?? [];
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
  const rescuePlan = await timed(
    trace,
    agentStage("rescue").name,
    () => createRescuePlan(allFindings, score),
    "rescue",
  );
  trace.at(-1)!.detail =
    rescuePlan.mode === "LIVE_QWEN"
      ? `Qwen explained ${rescuePlan.actions.length} deterministic rescue action(s).`
      : `${rescuePlan.actions.length} deterministic rescue action(s); Qwen narrative fallback disclosed.`;

  const openCount = allFindings.filter((finding) => finding.status === "open").length;
  const gate: WorkflowInfo["gate"] = openCount === 0 ? "READY_TO_FILE" : "NEEDS_HUMAN";
  trace.push({
    agent: "approval",
    ordinal: agentStage("approval").ordinal,
    decidedBy: "human",
    name: agentStage("approval").name,
    status: gate === "READY_TO_FILE" ? "ok" : "waiting",
    ms: 0,
    detail:
      gate === "READY_TO_FILE"
        ? "All blockers resolved. Awaiting explicit human approval."
        : `${openCount} blocker${openCount === 1 ? "" : "s"} must be resolved by a human.`,
  });

  // Stage 7 runs only when a human approves and files, which happens in a later
  // request. Reported here as declared-but-not-reached rather than omitted.
  const pipeline = buildPipelineView(
    trace,
    {
    submission:
      gate === "READY_TO_FILE"
        ? "Ready. Seals the Evidence Passport, or files against the mock portal, once a human approves."
        : "Blocked until the open findings are resolved and a human approves.",
    },
    muleRunStages,
  );

  return {
    runId,
    dataMode,
    mode,
    workflow: {
      mode: workflowMode,
      executionId,
      fallbackReason: workflowMode === "LIVE_MULERUN" ? null : workflowFallbackReason,
      muleRunAttempted,
      pipeline,
      trace,
      gate,
    },
    fallbackReason,
    invoice: extraction,
    smartFix,
    ruleSelection: {
      profile: ruleSelection.profile,
      effectiveFrom: ruleSelection.effectiveFrom,
      reason: ruleSelection.reason,
      overriddenFrom: ruleSelection.overriddenFrom,
      sourceIds: ruleSelection.sourceIds,
      invoiceDate: ruleSelection.invoiceDate,
    },
    scheduleEvidence,
    scheduleReconciliation: reconciliation.schedule,
    findings: allFindings,
    score,
    rescuePlan,
    claimValueUnderReviewLkr,
    auditEvents: [],
  };
}
