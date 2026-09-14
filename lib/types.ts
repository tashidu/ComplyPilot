export type AuditEvent = {
  time: string;
  actor: "agent" | "human";
  title: string;
  detail: string;
};

export type FindingSeverity = "high" | "medium" | "low";

export type FindingStatus = "open" | "resolved" | "inactive";

export type DataMode = "SYNTHETIC_DEMO" | "USER_PROVIDED";

export type GraphNode = {
  title: string;
  detail: string;
  status?: "warning" | "action";
};

export type Finding = {
  id: string; // e.g. 'supplier', 'customs', 'invoice'
  badge: string;
  title: string;
  description: string;
  tag: string;
  severity: FindingSeverity;
  meta: string[];
  scoreGain: number;
  amountLkrM: number;
  confidence: number;
  ruleId: string;
  graphTitle: string;
  graph: GraphNode[];
  status: FindingStatus;
};

export type ScoreBreakdown = {
  document: number;
  schedule: number;
  supplier: number;
  customs: number;
  package: number;
};

export type Score = {
  total: number;
  components: ScoreBreakdown;
};

/** One stage of the pre-flight workflow, with the time it actually took. */
import type { AgentId } from "./workflows/pipeline";

export type TraceStage = {
  name: string;
  /**
   * "pending" means the stage is declared but this run never reached it -
   * distinct from "ok" (ran and passed) and "failed" (ran and failed).
   */
  status: "ok" | "waiting" | "failed" | "pending";
  ms: number;
  detail?: string;
  /** Which declared pipeline agent produced this stage, when it maps to one. */
  agent?: AgentId;
  /** 1-based position in the declared pipeline. */
  ordinal?: number;
  /** Who decided here: the model, the rules, or a person. */
  decidedBy?: "qwen" | "deterministic" | "human";
};

/** One row of the declared seven-agent pipeline, always present in order. */
export type PipelineStage = {
  id: AgentId;
  ordinal: number;
  name: string;
  role: string;
  status: "ok" | "waiting" | "failed" | "pending";
  ms: number;
  detail?: string;
  /**
   * What the MuleRun workflow reported for this same agent, when one ran.
   * Shown beside the local result; it never replaces it. A remote workflow
   * cannot be allowed to decide a compliance outcome on its own say-so.
   */
  muleRun?: { status: string; ms: number } | null;
};

export type WorkflowInfo = {
  /** LIVE_MULERUN only when a MuleRun execution genuinely returned a result. */
  mode: "LIVE_MULERUN" | "LOCAL";
  /** MuleRun execution id, so the run can be found in their dashboard. */
  executionId: string | null;
  /** Why the local orchestrator ran instead of MuleRun. Null when MuleRun ran. */
  fallbackReason: string | null;
  /** True only when a MuleRun call was actually made, so the UI can tell
   *  "never configured" apart from "tried and failed". */
  muleRunAttempted: boolean;
  trace: TraceStage[];
  /** The seven declared agents and what each one did on this run. */
  pipeline: PipelineStage[];
  gate: "NEEDS_HUMAN" | "READY_TO_FILE";
};

export type VatScheduleRow = {
  rowNumber: number;
  invoiceNumber: string | null;
  supplierTin: string | null;
  supplierName: string | null;
  invoiceDate: string | null;
  netAmount: number | null;
  vatAmount: number | null;
  grossAmount: number | null;
};

export type VatScheduleEvidence = {
  fileName: string;
  uploadedAt: string;
  headers: string[];
  rows: VatScheduleRow[];
  warnings: string[];
};

export type ReconciliationVariance = {
  field:
    | "invoiceNumber"
    | "supplierTin"
    | "supplierName"
    | "invoiceDate"
    | "netAmount"
    | "vatAmount"
    | "grossAmount";
  label: string;
  invoiceValue: string | number | null;
  scheduleValue: string | number | null;
  difference: number | null;
};

export type ReconciliationFeatureScore = {
  key: "supplierTin" | "invoiceNumber" | "amounts" | "invoiceDate" | "supplierName";
  label: string;
  earned: number;
  available: number;
  detail: string;
  source: "deterministic" | "qwen-embedding";
};

export type ScheduleReconciliation = {
  status:
    | "NOT_UPLOADED"
    | "NEEDS_INVOICE"
    | "MATCHED"
    | "NEEDS_REVIEW"
    | "MISMATCH"
    | "UNMATCHED";
  fileName: string | null;
  rowCount: number;
  matchedRowNumber: number | null;
  candidateCount: number;
  matchScore: number | null;
  matchMode: "LIVE_QWEN_EMBEDDING" | "LOCAL_SIMILARITY" | "NOT_RUN";
  matchFeatures: ReconciliationFeatureScore[];
  matchedFields: string[];
  variances: ReconciliationVariance[];
  warnings: string[];
  totals: {
    netAmount: number | null;
    vatAmount: number | null;
    grossAmount: number | null;
  } | null;
};

export type SmartFixAction = {
  field: string;
  label: string;
  observedValue: string | number | boolean | null;
  suggestedValue: string | number | boolean | null;
  decision: "AI_DRAFT" | "NEEDS_HUMAN";
  reason: string;
  confidence: number;
  ruleId: string;
  sourceIds: string[];
};

export type SmartFixPlan = {
  status: "NO_INVOICE" | "NOT_APPLICABLE" | "COMPLIANT" | "NEEDS_REVIEW";
  actions: SmartFixAction[];
  autoDraftCount: number;
  humanInputCount: number;
  draftInvoice: Record<string, unknown> | null;
  disclaimer: string;
};

export type RescueAction = {
  rank: number;
  findingId: string;
  title: string;
  requiredAction: string;
  scoreGain: number;
  lkrAtRisk: number;
};

export type RescuePlan = {
  mode: "LIVE_QWEN" | "DETERMINISTIC";
  fallbackReason: string | null;
  headline: string;
  explanation: string;
  actualScore: number;
  simulatedScore: number;
  actualLkrAtRisk: number;
  simulatedLkrAtRisk: number;
  actions: RescueAction[];
  disclaimer: string;
};

/** Which invoice rule pack the document's own date selects, and why. */
export type RuleSelectionInfo = {
  profile: "historical" | "v2026.10";
  effectiveFrom: string;
  reason: string;
  /** The date-derived profile, set only when a reviewer chose the other one. */
  overriddenFrom: "historical" | "v2026.10" | null;
  sourceIds: string[];
  invoiceDate: string | null;
};

export type AnalyzeResult = {
  runId: string;
  dataMode: DataMode;
  mode: "LIVE_QWEN" | "DEMO_FALLBACK";
  workflow: WorkflowInfo;
  /** Why the run fell back to fixtures. Null on a live run. Shown in the UI. */
  fallbackReason: string | null;
  invoice: any | null; // From Qwen
  smartFix: SmartFixPlan;
  ruleSelection: RuleSelectionInfo;
  scheduleEvidence: VatScheduleEvidence | null;
  scheduleReconciliation: ScheduleReconciliation;
  findings: Finding[];
  score: Score;
  rescuePlan: RescuePlan;
  claimValueUnderReviewLkr: number;
  auditEvents: AuditEvent[];
};
