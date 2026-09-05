export type BlockerId = "supplier" | "customs" | "invoice";

export type GraphNode = {
  title: string;
  detail: string;
  status?: "warning" | "action";
};

export type Blocker = {
  id: BlockerId;
  badge: string;
  title: string;
  description: string;
  tag: string;
  severity: "high" | "medium";
  meta: string[];
  scoreGain: number;
  /** Input VAT value in LKR millions linked to this unresolved evidence. */
  amountLkrM: number;
  confidence: number;
  ruleId: string;
  graphTitle: string;
  graph: GraphNode[];
};

export const BLOCKERS: Record<BlockerId, Blocker> = {
  supplier: {
    id: "supplier",
    badge: "S",
    title: "Supplier VAT status needs confirmation",
    description:
      "The latest published supplier snapshot is not current enough to support an automatic conclusion.",
    tag: "Source outdated",
    severity: "high",
    meta: ["Source: IRD inactive VAT list", "Effective: 18 Nov 2025", "Claim value: LKR 1.8M"],
    scoreGain: 10,
    amountLkrM: 1.8,
    confidence: 78,
    ruleId: "SUP-004",
    graphTitle: "Supplier evidence chain",
    graph: [
      { title: "Invoice INV-1024", detail: "Supplier SUP-008" },
      { title: "Supplier record", detail: "TIN captured with 96% confidence" },
      { title: "Published snapshot", detail: "Effective 18 Nov 2025" },
      { title: "Freshness rule", detail: "Point-in-time source is outdated", status: "warning" },
      { title: "Human action", detail: "Request current supplier evidence", status: "action" },
    ],
  },
  customs: {
    id: "customs",
    badge: "C",
    title: "Export value differs from CUSDEC by 12.4%",
    description:
      "The schedule structure passes, but the export total needs a documented cross-system reconciliation.",
    tag: "Reconciliation",
    severity: "high",
    meta: ["Schedule total: LKR 18.3M", "CUSDEC total: LKR 16.0M", "Claim value: LKR 1.6M"],
    scoreGain: 7,
    amountLkrM: 1.6,
    confidence: 94,
    ruleId: "RECON-001",
    graphTitle: "Customs reconciliation chain",
    graph: [
      { title: "VAT Schedule 06", detail: "Export value LKR 18.3M" },
      { title: "CUSDEC batch", detail: "Export value LKR 16.0M" },
      { title: "Variance engine", detail: "Difference 12.4%", status: "warning" },
      { title: "Guidance rule", detail: "Reconciliation document required" },
      { title: "Human action", detail: "Review drafted explanation", status: "action" },
    ],
  },
  invoice: {
    id: "invoice",
    badge: "I",
    title: "Two invoices fail the October 2026 rule pack",
    description:
      "The records pass the earlier profile but require revised serial and purchaser details under the selected profile.",
    tag: "Future rule active",
    severity: "medium",
    meta: ["Rule pack: v2026.10", "2 mandatory fields", "Claim value: LKR 0.8M"],
    scoreGain: 4,
    amountLkrM: 0.8,
    confidence: 92,
    ruleId: "DOC-021",
    graphTitle: "Invoice compliance chain",
    graph: [
      { title: "Invoice INV-1030", detail: "Photographed document" },
      { title: "Qwen-VL extraction", detail: "Purchaser fields + serial" },
      { title: "Rule pack v2026.10", detail: "Effective 1 Oct 2026" },
      { title: "Validation", detail: "2 mandatory fields missing", status: "warning" },
      { title: "Human action", detail: "Correct and approve fields", status: "action" },
    ],
  },
};

export const BLOCKER_ORDER: BlockerId[] = ["supplier", "customs", "invoice"];

export type ScoreKey = "document" | "schedule" | "supplier" | "customs" | "package";

export const SCORE_CONFIG: Record<ScoreKey, { label: string; base: number; max: number }> = {
  document: { label: "Document completeness", base: 24, max: 30 },
  schedule: { label: "Schedule reconciliation", base: 18, max: 25 },
  supplier: { label: "Supplier evidence", base: 8, max: 20 },
  customs: { label: "Customs reconciliation", base: 10, max: 15 },
  package: { label: "Submission package", base: 8, max: 10 },
};

export type DemoState = {
  resolved: BlockerId[];
  futureRules: boolean;
};

/** Blockers that are both applicable under the active rule profile and still open. */
export function openBlockerIds(state: DemoState): BlockerId[] {
  return BLOCKER_ORDER.filter(
    (id) => (id !== "invoice" || state.futureRules) && !state.resolved.includes(id),
  );
}

/**
 * Deterministic score components. The model never produces this number - the
 * rules live here in plain TypeScript so every point is explainable.
 */
export function scoreComponents(state: DemoState): Record<ScoreKey, number> {
  const values = Object.fromEntries(
    (Object.keys(SCORE_CONFIG) as ScoreKey[]).map((key) => [key, SCORE_CONFIG[key].base]),
  ) as Record<ScoreKey, number>;

  if (!state.futureRules || state.resolved.includes("invoice")) values.document += 4;
  if (state.resolved.includes("customs")) {
    values.schedule += 2;
    values.customs += 5;
  }
  if (state.resolved.includes("supplier")) values.supplier += 10;
  return values;
}

export function totalScore(state: DemoState): number {
  return Object.values(scoreComponents(state)).reduce((sum, value) => sum + value, 0);
}

/** Input VAT value connected to unresolved evidence, in LKR millions. */
export function claimValueUnderReview(state: DemoState): number {
  return openBlockerIds(state).reduce((sum, id) => sum + BLOCKERS[id].amountLkrM, 0);
}

export function formatLkr(valueInMillions: number): string {
  return valueInMillions === 0 ? "LKR 0" : `LKR ${valueInMillions.toFixed(1)}M`;
}

export type AuditEvent = {
  time: string;
  actor: "agent" | "human";
  title: string;
  detail: string;
};

export const INITIAL_AUDIT: AuditEvent[] = [
  {
    time: "09:42:03",
    actor: "agent",
    title: "MuleRun started pre-flight workflow",
    detail: "13 evidence files routed to three specialist agents.",
  },
  {
    time: "09:42:08",
    actor: "agent",
    title: "Document Agent extracted 94 fields",
    detail: "Two fields were below the material confidence threshold.",
  },
  {
    time: "09:42:12",
    actor: "agent",
    title: "Schedule structure passed",
    detail: "The CSV format is valid; evidence reconciliation continued.",
  },
  {
    time: "09:42:16",
    actor: "agent",
    title: "Supplier source marked outdated",
    detail: "Snapshot effective date is shown instead of treating the result as real-time.",
  },
  {
    time: "09:42:21",
    actor: "agent",
    title: "CUSDEC variance detected",
    detail: "A 12.4% value difference was linked to its source records.",
  },
  {
    time: "09:42:25",
    actor: "agent",
    title: "Readiness score calculated",
    detail: "Formula v1.0 returned 68/100 with three open blockers.",
  },
];

export const EVIDENCE_INVENTORY = [
  {
    name: "Invoice batch OCT-26",
    note: "10 photographed invoices",
    source: "Exporter upload",
    effective: "18 Oct 2026",
    fresh: true,
    status: "2 fields need review",
  },
  {
    name: "VAT Schedule 02",
    note: "Local purchases",
    source: "Finance export",
    effective: "31 Oct 2026",
    fresh: true,
    status: "Structure passed",
  },
  {
    name: "Supplier snapshot",
    note: "Inactive VAT list copy",
    source: "IRD published page",
    effective: "18 Nov 2025",
    fresh: false,
    status: "Confirmation required",
  },
  {
    name: "CUSDEC export file",
    note: "5 declarations",
    source: "Sample Customs data",
    effective: "31 Oct 2026",
    fresh: true,
    status: "12.4% variance",
  },
];
