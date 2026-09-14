import { Pool } from "pg";

/**
 * One pooled connection, shared across route handlers and hot reloads.
 *
 * DATABASE_URL is required in every environment that stores run state -
 * there is no in-memory fallback, so a case does not silently disappear on
 * the next ECS restart or lose isolation between browser sessions.
 */
const globalForDb = globalThis as unknown as { __complypilotPool?: Pool };

export function getPool(): Pool {
  if (!globalForDb.__complypilotPool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error(
        "DATABASE_URL is not set. Run `docker compose up` (which provisions Postgres) or point it at a Postgres instance in .env.local.",
      );
    }
    globalForDb.__complypilotPool = new Pool({ connectionString, max: 10 });
  }
  return globalForDb.__complypilotPool;
}
