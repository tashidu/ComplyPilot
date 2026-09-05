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
 */

export type StoredRun = {
  runId: string;
  extraction: InvoiceExtraction | null;
  mode: AnalyzeResult["mode"];
  fallbackReason: string | null;
  scheduleEvidence: AnalyzeResult["scheduleEvidence"];
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

export function rememberRun(result: AnalyzeResult): void {
  reap();
  runs.set(result.runId, {
    runId: result.runId,
    extraction: result.invoice ?? null,
    mode: result.mode,
    fallbackReason: result.fallbackReason,
    scheduleEvidence: result.scheduleEvidence,
    createdAt: Date.now(),
  });
}

export function recallRun(runId: string | null | undefined): StoredRun | undefined {
  if (!runId) return undefined;
  return runs.get(runId);
}
