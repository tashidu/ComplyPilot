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

/**
 * The trail starts empty.
 *
 * It previously opened with six events carrying fixed clock times, describing
 * work no one in this session had done. An audit trail that is pre-populated
 * with things that did not happen is not a weaker audit trail - it is a false
 * one, and it is the first thing a reviewer would catch. Entries now appear
 * only as actions actually occur, and are stored with the workspace.
 */

export const EVIDENCE_INVENTORY = [
  {
    name: "Invoice batch OCT-26",
    note: "10 photographed invoices",
    source: "Taxpayer upload",
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
