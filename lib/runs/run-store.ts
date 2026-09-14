import type { InvoiceExtraction } from "../ai/extraction-schema";
import type { AnalyzeResult } from "../types";

/**
 * Remembers what a run actually extracted.
 *
 * Resolving a blocker or switching rule profile re-runs the deterministic
 * agents, and those calls carry no file. Without this, a live Qwen extraction
 * would be silently replaced by the synthetic fixture on the very next click,
 * and the UI would drop back to DEMO_FALLBACK mid-demo.
 *
 * In-memory and per-process, which is all the demo needs. A durable store
 * belongs here when the workflow becomes stateful.
 *
 * Runs are owned by the demo session that created them. The hosted prototype
 * is a single process that several judges may use at once, and a run id alone
 * is not a secret - recall therefore requires the owning session, so one
 * viewer's extraction cannot be read from another's browser.
 */

export type StoredRun = {
  runId: string;
  extraction: InvoiceExtraction | null;
  mode: AnalyzeResult["mode"];
  fallbackReason: string | null;
  scheduleEvidence: AnalyzeResult["scheduleEvidence"];
  /** Latest deterministic result used to ground the run-aware data copilot. */
  analysis: AnalyzeResult;
  /** The demo session that created this run. Only it may recall the run. */
  ownerSessionId: string;
  createdAt: number;
};

const TTL_MS = 30 * 60 * 1000;

const store = globalThis as unknown as { __complypilotRuns?: Map<string, StoredRun> };
store.__complypilotRuns ??= new Map<string, StoredRun>();
const runs = store.__complypilotRuns;

function reap() {
  const cutoff = Date.now() - TTL_MS;
  for (const [id, run] of runs) {
    if (run.createdAt < cutoff) runs.delete(id);
  }
}

export function rememberRun(result: AnalyzeResult, ownerSessionId: string): void {
  reap();
  runs.set(result.runId, {
    ownerSessionId,
    runId: result.runId,
    extraction: result.invoice ?? null,
    mode: result.mode,
    fallbackReason: result.fallbackReason,
    scheduleEvidence: result.scheduleEvidence,
    analysis: result,
    createdAt: Date.now(),
  });
}

/**
 * Returns the run only to the session that created it. A mismatch is treated
 * as "no such run" rather than an error, so the response does not confirm
 * that someone else's run id exists.
 */
export function recallRun(
  runId: string | null | undefined,
  sessionId: string,
): StoredRun | undefined {
  if (!runId) return undefined;
  const run = runs.get(runId);
  if (!run || run.ownerSessionId !== sessionId) return undefined;
  return run;
}
