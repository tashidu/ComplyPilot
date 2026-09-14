import { createHash, pbkdf2Sync, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { getPool } from "../db/pool";
import type { AuthUser, UserRole } from "./types";

const SESSION_DAYS = 7;
const globalForAuth = globalThis as unknown as { __authSchema?: Promise<void> };

async function ensureAuthSchema() {
  if (!globalForAuth.__authSchema) {
    globalForAuth.__authSchema = getPool().query(`
      CREATE TABLE IF NOT EXISTS user_accounts (
        id TEXT PRIMARY KEY,
        full_name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        phone TEXT NOT NULL,
        role TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        password_salt TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS auth_sessions (
        token_hash TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES user_accounts(id) ON DELETE CASCADE,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS auth_sessions_user_id_idx ON auth_sessions(user_id);
    `).then(() => undefined).catch((error) => {
      globalForAuth.__authSchema = undefined;
      throw error;
    });
  }
  return globalForAuth.__authSchema;
}

function derivePassword(password: string, salt: string) {
  return pbkdf2Sync(password, salt, 160_000, 32, "sha256").toString("hex");
}

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function mapUser(row: Record<string, unknown>): AuthUser {
  return {
    id: String(row.id),
    fullName: String(row.full_name),
    email: String(row.email),
    phone: String(row.phone),
    role: row.role as UserRole,
    createdAt: new Date(String(row.created_at)).toISOString(),
  };
}

export async function registerUser(input: { fullName: string; email: string; phone: string; role: UserRole; password: string }) {
  await ensureAuthSchema();
  const salt = randomBytes(16).toString("hex");
  const id = `USR-${randomUUID()}`;
  try {
    const result = await getPool().query(
      `INSERT INTO user_accounts (id, full_name, email, phone, role, password_hash, password_salt)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, full_name, email, phone, role, created_at`,
      [id, input.fullName, input.email.toLowerCase(), input.phone, input.role, derivePassword(input.password, salt), salt],
    );
    return mapUser(result.rows[0]);
  } catch (error) {
    if ((error as { code?: string }).code === "23505") throw new Error("EMAIL_EXISTS");
    throw error;
  }
}

export async function authenticateUser(email: string, password: string): Promise<AuthUser | null> {
  await ensureAuthSchema();
  const result = await getPool().query(
    `SELECT id, full_name, email, phone, role, created_at, password_hash, password_salt
     FROM user_accounts WHERE email = $1`,
    [email.toLowerCase()],
  );
  const row = result.rows[0];
  if (!row) return null;
  const expected = Buffer.from(String(row.password_hash), "hex");
  const actual = Buffer.from(derivePassword(password, String(row.password_salt)), "hex");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  return mapUser(row);
}

export async function createAuthSession(userId: string): Promise<string> {
  await ensureAuthSchema();
  const token = randomBytes(32).toString("base64url");
  await getPool().query(
    `INSERT INTO auth_sessions (token_hash, user_id, expires_at)
     VALUES ($1, $2, now() + ($3 || ' days')::interval)`,
    [tokenHash(token), userId, String(SESSION_DAYS)],
  );
  return token;
}

export async function resolveAuthSession(token: string): Promise<AuthUser | null> {
  await ensureAuthSchema();
  const result = await getPool().query(
    `SELECT u.id, u.full_name, u.email, u.phone, u.role, u.created_at
     FROM auth_sessions s JOIN user_accounts u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.expires_at > now()`,
    [tokenHash(token)],
  );
  return result.rows[0] ? mapUser(result.rows[0]) : null;
}

export async function revokeAuthSession(token: string): Promise<void> {
  await ensureAuthSchema();
  await getPool().query(`DELETE FROM auth_sessions WHERE token_hash = $1`, [tokenHash(token)]);
}

export const AUTH_SESSION_MAX_AGE = SESSION_DAYS * 24 * 60 * 60;
