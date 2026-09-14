/**
 * The declared agent pipeline.
 *
 * Every run is described by these seven stages in this order, whether or not a
 * given stage did any work. Declaring them means the trace shows the whole
 * pipeline - including the stages a run never reached, and why - instead of
 * only the steps that happened to execute. A reviewer can then tell "this
 * stage passed" apart from "this stage never ran".
 *
 * MuleRun receives this same definition, so the remote workflow and the local
 * orchestrator describe the run in identical terms.
 */

export const PIPELINE_VERSION = "v1";

export type AgentId =
  | "document"
  | "temporal"
  | "smart-fix"
  | "reconciliation"
  | "rescue"
  | "approval"
  | "submission";

export type AgentStageDefinition = {
  id: AgentId;
  /** 1-based position, shown in the UI as "3 of 7". */
  ordinal: number;
  name: string;
  /** What this stage is responsible for, in one line. */
  role: string;
  /** Whether a language model decides anything here, and what it may decide. */
  intelligence: "qwen" | "deterministic" | "qwen-explains-deterministic-decides" | "human";
};

export const AGENT_PIPELINE: AgentStageDefinition[] = [
  {
    id: "document",
    ordinal: 1,
    name: "Qwen Document Agent",
    role: "Reads the invoice image and returns schema-validated fields with per-field confidence.",
    intelligence: "qwen",
  },
  {
    id: "temporal",
    ordinal: 2,
    name: "Temporal Regulation Agent",
    role: "Selects the rule pack in force on the document's own date, and cites the gazettes.",
    intelligence: "deterministic",
  },
  {
    id: "smart-fix",
    ordinal: 3,
    name: "Smart Fix Agent",
    role: "Drafts safe corrections and refers every source fact to a human.",
    intelligence: "deterministic",
  },
  {
    id: "reconciliation",
    ordinal: 4,
    name: "Semantic Reconciliation Agent",
    role: "Matches the invoice to a VAT schedule row and explains each scoring feature.",
    intelligence: "qwen-explains-deterministic-decides",
  },
  {
    id: "rescue",
    ordinal: 5,
    name: "Refund Rescue Planning Agent",
    role: "Ranks corrective actions by the VAT they unlock and models a what-if position.",
    intelligence: "qwen-explains-deterministic-decides",
  },
  {
    id: "approval",
    ordinal: 6,
    name: "Human Approval Agent",
    role: "Holds the run until an authorised person approves the evidence package.",
    intelligence: "human",
  },
  {
    id: "submission",
    ordinal: 7,
    name: "Evidence Passport / Mock submission",
    role: "Seals the package with a content digest, or files it against the bundled mock portal.",
    intelligence: "deterministic",
  },
];

export const agentStage = (id: AgentId): AgentStageDefinition =>
  AGENT_PIPELINE.find((stage) => stage.id === id)!;

/**
 * Folds the stages that actually executed onto the declared pipeline, so the
 * caller always gets seven rows in order.
 *
 * A declared stage with no executed trace entry is reported as "pending" with
 * the reason it was not reached. Silently omitting it would let the UI imply a
 * stage passed when it never ran.
 */
export function buildPipelineView(
  executed: { agent?: AgentId; name: string; status: string; ms: number; detail?: string }[],
  notReached: Partial<Record<AgentId, string>> = {},
  /** What a MuleRun execution reported for the same agents, if one ran. */
  muleRunStages: { agent?: string; status?: string; ms: number }[] = [],
): {
  id: AgentId;
  ordinal: number;
  name: string;
  role: string;
  status: "ok" | "waiting" | "failed" | "pending";
  ms: number;
  detail?: string;
  muleRun?: { status: string; ms: number } | null;
}[] {
  return AGENT_PIPELINE.map((stage) => {
    const remote = muleRunStages.find((entry) => entry.agent === stage.id);
    const muleRun = remote ? { status: remote.status ?? "ok", ms: remote.ms } : null;
    // A stage may run more than once; the last outcome is the one that stands.
    const runs = executed.filter((entry) => entry.agent === stage.id);
    const last = runs.at(-1);
    if (!last) {
      return {
        id: stage.id,
        ordinal: stage.ordinal,
        name: stage.name,
        role: stage.role,
        status: "pending" as const,
        ms: 0,
        detail: notReached[stage.id] ?? "This run did not reach this stage.",
        muleRun,
      };
    }
    return {
      id: stage.id,
      ordinal: stage.ordinal,
      name: stage.name,
      role: stage.role,
      status: last.status as "ok" | "waiting" | "failed" | "pending",
      // Repeated runs of one stage are summed, so the number is the time the
      // pipeline actually spent there.
      ms: runs.reduce((total, entry) => total + entry.ms, 0),
      detail: last.detail,
      muleRun,
    };
  });
}
