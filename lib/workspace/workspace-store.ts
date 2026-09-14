import { getPool } from "../db/pool";
import { createDefaultWorkspace, type BusinessWorkspace } from "./workspace";

const globalForWorkspace = globalThis as unknown as { __workspaceSchema?: Promise<void> };

async function ensureWorkspaceSchema(): Promise<void> {
  if (!globalForWorkspace.__workspaceSchema) {
    globalForWorkspace.__workspaceSchema = getPool()
      .query(
        `CREATE TABLE IF NOT EXISTS business_workspaces (
           owner_session_id TEXT PRIMARY KEY,
           payload JSONB NOT NULL,
           created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
           updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
         );`,
      )
      .then(() => undefined)
      .catch((error) => {
        globalForWorkspace.__workspaceSchema = undefined;
        throw error;
      });
  }
  return globalForWorkspace.__workspaceSchema;
}

export async function saveWorkspace(ownerSessionId: string, workspace: BusinessWorkspace): Promise<void> {
  await ensureWorkspaceSchema();
  await getPool().query(
    `INSERT INTO business_workspaces (owner_session_id, payload, updated_at)
     VALUES ($1, $2, now())
     ON CONFLICT (owner_session_id)
     DO UPDATE SET payload = EXCLUDED.payload, updated_at = now()`,
    [ownerSessionId, JSON.stringify(workspace)],
  );
}

export async function getOrCreateWorkspace(ownerSessionId: string): Promise<BusinessWorkspace> {
  await ensureWorkspaceSchema();
  const existing = await getPool().query<{ payload: BusinessWorkspace }>(
    `SELECT payload FROM business_workspaces WHERE owner_session_id = $1`,
    [ownerSessionId],
  );
  if (existing.rows[0]?.payload) return existing.rows[0].payload;

  const workspace = createDefaultWorkspace();
  await getPool().query(
    `INSERT INTO business_workspaces (owner_session_id, payload)
     VALUES ($1, $2)
     ON CONFLICT (owner_session_id) DO NOTHING`,
    [ownerSessionId, JSON.stringify(workspace)],
  );
  const created = await getPool().query<{ payload: BusinessWorkspace }>(
    `SELECT payload FROM business_workspaces WHERE owner_session_id = $1`,
    [ownerSessionId],
  );
  return created.rows[0]?.payload ?? workspace;
}
