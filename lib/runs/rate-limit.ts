/**
 * Sliding-window request cap per key (session id, run id, ...).
 *
 * In-memory and per-process, unlike run state: a restart simply resets
 * everyone's quota rather than losing a case, so this does not need Postgres.
 */
const globalRate = globalThis as unknown as {
  __complypilotRateBuckets?: Map<string, { startedAt: number; count: number }>;
};
globalRate.__complypilotRateBuckets ??= new Map();
const buckets = globalRate.__complypilotRateBuckets;

export function consumeRateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const current = buckets.get(key);
  if (!current || now - current.startedAt > windowMs) {
    buckets.set(key, { startedAt: now, count: 1 });
    return true;
  }
  if (current.count >= limit) return false;
  current.count += 1;
  return true;
}
