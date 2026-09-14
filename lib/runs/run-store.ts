import type { InvoiceExtraction } from "../ai/extraction-schema";
import type { AnalyzeResult } from "../types";
import { getPool } from "../db/pool";

/**
 * Remembers what a run actually extracted.
 *
 * Resolving a blocker or switching rule profile re-runs the deterministic
 * agents, and those calls carry no file. Without this, a live Qwen extraction
 * would be silently replaced by the synthetic fixture on the very next click,
 * and the UI would drop back to DEMO_FALLBACK mid-demo.
 *
 * Stored in Postgres, keyed by runId and scoped to the owning session cookie,
 * so state survives a container restart and one browser session can never
 * recall or mutate another session's run.
 */

export type StoredRun = {
  runId: string;
  extraction: InvoiceExtraction | null;
  mode: AnalyzeResult["mode"];
  fallbackReason: string | null;
  scheduleEvidence: AnalyzeResult["scheduleEvidence"];
  /** Latest deterministic result used to ground the run-aware data copilot. */
  analysis: AnalyzeResult;
  createdAt: number;
};

// Period workspaces span months. Keep their structured analysis long enough to
// reopen a prior filing cycle while still bounding abandoned prototype data.
const TTL_INTERVAL = "400 days";

let schemaReady: Promise<void> | null = null;
function ensureSchema(): Promise<void> {
  schemaReady ??= getPool()
    .query(
      `CREATE TABLE IF NOT EXISTS runs (
         run_id TEXT PRIMARY KEY,
         owner_session_id TEXT NOT NULL,
         payload JSONB NOT NULL,
         created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
         updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
       );
       CREATE INDEX IF NOT EXISTS runs_owner_session_id_idx ON runs (owner_session_id);`,
    )
    .then(() => undefined)
    .catch((error) => {
      schemaReady = null;
      throw error;
    });
  return schemaReady;
}

function reap(): void {
  // Fire-and-forget: bounds table growth without adding latency to the
  // request that triggered it. A failure here just leaves a stale row.
  void getPool()
    .query(`DELETE FROM runs WHERE updated_at < now() - interval '${TTL_INTERVAL}'`)
    .catch((error) => console.error("Run-store reap failed", error));
}

export async function rememberRun(result: AnalyzeResult, ownerSessionId: string): Promise<void> {
  await ensureSchema();
  const stored: StoredRun = {
    runId: result.runId,
    extraction: result.invoice ?? null,
    mode: result.mode,
    fallbackReason: result.fallbackReason,
    scheduleEvidence: result.scheduleEvidence,
    analysis: result,
    createdAt: Date.now(),
  };
  await getPool().query(
    `INSERT INTO runs (run_id, owner_session_id, payload, updated_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (run_id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = now()`,
    [stored.runId, ownerSessionId, JSON.stringify(stored)],
  );
  reap();
}

export async function recallRun(
  runId: string | null | undefined,
  ownerSessionId: string,
): Promise<StoredRun | undefined> {
  if (!runId) return undefined;
  await ensureSchema();
  const { rows } = await getPool().query<{ payload: StoredRun }>(
    `SELECT payload FROM runs
     WHERE run_id = $1 AND owner_session_id = $2 AND updated_at > now() - interval '${TTL_INTERVAL}'`,
    [runId, ownerSessionId],
  );
  return rows[0]?.payload;
}
