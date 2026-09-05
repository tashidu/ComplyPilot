export type AuditEvent = {
  time: string;
  actor: "agent" | "human";
  title: string;
  detail: string;
};

export type FindingSeverity = "high" | "medium" | "low";

export type FindingStatus = "open" | "resolved" | "inactive";

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
export type TraceStage = {
  name: string;
  status: "ok" | "waiting" | "failed";
  ms: number;
  detail?: string;
};

export type WorkflowInfo = {
  /** LIVE_MULERUN only when a MuleRun execution genuinely returned a result. */
  mode: "LIVE_MULERUN" | "LOCAL";
  /** MuleRun execution id, so the run can be found in their dashboard. */
  executionId: string | null;
  /** Why the local orchestrator ran instead of MuleRun. Null when MuleRun ran. */
  fallbackReason: string | null;
  trace: TraceStage[];
  gate: "NEEDS_HUMAN" | "READY_TO_FILE";
};

export type AnalyzeResult = {
  runId: string;
  mode: "LIVE_QWEN" | "DEMO_FALLBACK";
  workflow: WorkflowInfo;
  /** Why the run fell back to fixtures. Null on a live run. Shown in the UI. */
  fallbackReason: string | null;
  invoice: any | null; // From Qwen
  findings: Finding[];
  score: Score;
  claimValueUnderReviewLkr: number;
  auditEvents: AuditEvent[];
};
