import type { AuditEvent } from "../types";

/**
 * Regulatory Watch Agent.
 *
 * SIMULATED. In production this is a MuleRun scheduled task that checks the
 * published IRD sources weekly, detects a changed page or document, and asks
 * Qwen to summarise what changed. Here the detection step is a fixture so the
 * demo is deterministic and never depends on a government site being up.
 *
 * The rule that matters is not simulated: a detected change NEVER becomes an
 * active rule pack on its own. It sits in `pending` until a named human tax
 * reviewer approves it, and the approval is written to the audit trail. An
 * agent must not be able to change the rules it is later judged against.
 */

export type RuleChange = {
  id: string;
  source: string;
  sourceUrl: string;
  detectedAt: string;
  /** The version this change would introduce if approved. */
  proposedVersion: string;
  currentVersion: string;
  summary: string;
  impact: string;
  affectedRuleIds: string[];
};

export type WatchState = {
  lastCheckedAt: string;
  /** Sources the scheduled task watches. */
  sources: { name: string; url: string; lastSeen: string; changed: boolean }[];
  pending: RuleChange | null;
  activeVersion: string;
  approvedBy: string | null;
  approvedAt: string | null;
};

const PENDING_CHANGE: RuleChange = {
  id: "RC-2026-002",
  source: "Gazette Extraordinary No. 2500/106",
  sourceUrl: "https://www.ird.gov.lk/en/publications/Gazette_Documents/2026_2500_106_E.pdf",
  detectedAt: "2026-09-01 06:00:12",
  proposedVersion: "v2026.10",
  currentVersion: "v2026.07",
  summary:
    "The effective date of the revised tax-invoice format moves from 1 July 2026 to 1 October 2026. The mandatory field list is unchanged; only the date on which it binds has shifted.",
  impact:
    "Invoices issued between 1 July and 30 September 2026 are validated against the earlier profile instead of the revised one. Two invoices in the current evidence set change from failing to passing.",
  affectedRuleIds: ["DOC-021", "DOC-022"],
};

function freshState(): WatchState {
  return {
    lastCheckedAt: "2026-09-01 06:00:12",
    sources: [
      {
        name: "Gazette Extraordinary No. 2500/106",
        url: "https://www.ird.gov.lk/en/publications/Gazette_Documents/2026_2500_106_E.pdf",
        lastSeen: "2026-09-01",
        changed: true,
      },
      {
        name: "IRD Circular SEC/2025/E/06 (Risk-Based Refund Scheme)",
        url: "https://www.ird.gov.lk/en/publications/Circulars_Circulars/SEC_2025_E_06_E.pdf",
        lastSeen: "2026-09-01",
        changed: false,
      },
      {
        name: "IRD Inactive VAT List",
        url: "https://www.ird.gov.lk/en/publications/SitePages/Inactive%20VAT%20List.aspx?menuid=1411",
        lastSeen: "2026-09-01",
        changed: false,
      },
    ],
    pending: PENDING_CHANGE,
    activeVersion: "v2026.07",
    approvedBy: null,
    approvedAt: null,
  };
}

/**
 * State is keyed per demo session, not global. Two judges opening the hosted
 * prototype at the same time each get their own pending change; otherwise one
 * of them approving it would make it vanish from the other's screen.
 */
const store = globalThis as unknown as { __complypilotWatch?: Map<string, WatchState> };
store.__complypilotWatch ??= new Map<string, WatchState>();
const sessions = store.__complypilotWatch;

const MAX_SESSIONS = 200;

export function getWatchState(sessionId: string): WatchState {
  let state = sessions.get(sessionId);
  if (!state) {
    // Cheap bound so a public demo cannot grow the map without limit.
    if (sessions.size >= MAX_SESSIONS) {
      const oldest = sessions.keys().next().value;
      if (oldest) sessions.delete(oldest);
    }
    state = freshState();
    sessions.set(sessionId, state);
  }
  return state;
}

/** A human tax reviewer accepts the change; only then does the pack go active. */
export function approveChange(sessionId: string, reviewer: string): { state: WatchState; event: AuditEvent } {
  const state = getWatchState(sessionId);
  if (!state.pending) throw new Error("There is no pending rule change to approve.");

  const change = state.pending;
  const at = new Date().toLocaleTimeString("en-GB", { hour12: false });

  state.activeVersion = change.proposedVersion;
  state.approvedBy = reviewer;
  state.approvedAt = at;
  state.pending = null;

  return {
    state,
    event: {
      time: at,
      actor: "human",
      title: `Rule pack ${change.proposedVersion} approved`,
      detail: `${reviewer} accepted ${change.source} after review. Rules ${change.affectedRuleIds.join(", ")} now apply. Detected by the watch agent at ${change.detectedAt}.`,
    },
  };
}

export function rejectChange(sessionId: string, reviewer: string): { state: WatchState; event: AuditEvent } {
  const state = getWatchState(sessionId);
  if (!state.pending) throw new Error("There is no pending rule change to reject.");

  const change = state.pending;
  const at = new Date().toLocaleTimeString("en-GB", { hour12: false });
  state.pending = null;

  return {
    state,
    event: {
      time: at,
      actor: "human",
      title: `Rule pack ${change.proposedVersion} rejected`,
      detail: `${reviewer} declined the change from ${change.source}. The active pack remains ${state.activeVersion}.`,
    },
  };
}

export function resetWatch(sessionId: string): WatchState {
  const state = freshState();
  sessions.set(sessionId, state);
  return state;
}
