/**
 * Presentation fixtures for the demo case.
 *
 * Scoring rules are NOT here. They live in lib/rules/scoring.ts, which both the
 * readiness agent and the UI read from, so the label and maximum shown next to
 * a bar can never drift from the points the API awarded.
 */

export { SCORE_CONFIG, type ScoreKey } from "./rules/scoring";

export type AuditEvent = {
  time: string;
  actor: "agent" | "human";
  title: string;
  detail: string;
};

/** Formats an LKR value given in millions. */
export function formatLkr(valueInMillions: number): string {
  return valueInMillions === 0 ? "LKR 0" : `LKR ${valueInMillions.toFixed(1)}M`;
}

export const INITIAL_AUDIT: AuditEvent[] = [
  {
    time: "09:42:03",
    actor: "agent",
    title: "Pre-flight workflow started",
    detail: "13 synthetic evidence files routed to three specialist agents.",
  },
  {
    time: "09:42:08",
    actor: "agent",
    title: "Document Agent extracted the invoice fields",
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
    detail: "Deterministic rules returned 68/100 with three open blockers.",
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
