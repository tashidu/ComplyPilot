import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { resolveAuthSession } from "../auth/auth-store";
import type { AuthUser } from "../auth/types";

/**
 * Per-browser demo session, shared by every route.
 *
 * The hosted prototype is one process that several judges may open at once.
 * Without a session, anything keyed by a guessable id - a run, a filing
 * session - is reachable by anyone who knows or guesses that id. The cookie
 * gives each browser its own namespace.
 *
 * Ids come from randomUUID rather than Math.random: Math.random is not a
 * cryptographic source, and these ids are the only thing separating one
 * viewer's evidence from another's.
 */

export const SESSION_COOKIE = "cp_demo_session";
export const AUTH_COOKIE = "cp_auth_session";
const MAX_AGE_SECONDS = 60 * 60 * 8;

export type Session = { id: string; isNew: boolean; user: AuthUser | null };

export async function getSession(): Promise<Session> {
  const jar = await cookies();
  const authToken = jar.get(AUTH_COOKIE)?.value;
  if (authToken) {
    const user = await resolveAuthSession(authToken);
    if (user) return { id: `USER-${user.id}`, isNew: false, user };
  }
  const existing = jar.get(SESSION_COOKIE)?.value;
  if (existing) return { id: existing, isNew: false, user: null };
  return { id: `S-${randomUUID()}`, isNew: true, user: null };
}

/** Attaches the session cookie when the browser did not already have one. */
export function withSession<T>(body: T, session: Session, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  if (session.isNew) {
    response.cookies.set(SESSION_COOKIE, session.id, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: MAX_AGE_SECONDS,
    });
  }
  return response;
}

/* ------------------------------------------------------------ rate limits */

type Bucket = { startedAt: number; count: number };

const store = globalThis as unknown as { __complypilotRates?: Map<string, Bucket> };
store.__complypilotRates ??= new Map<string, Bucket>();
const buckets = store.__complypilotRates;

/**
 * A fixed-window limiter, per session and per named endpoint.
 *
 * These endpoints spend real resources - a Qwen call against a paid quota, a
 * Chromium process - so an unthrottled public URL is a way to lose the demo
 * on the day. Returns how many requests remain, for the response headers.
 */
export function consumeRate(
  key: string,
  limit: number,
  windowMs: number,
): { allowed: boolean; remaining: number; retryAfterSeconds: number } {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || now - bucket.startedAt > windowMs) {
    buckets.set(key, { startedAt: now, count: 1 });
    return { allowed: true, remaining: limit - 1, retryAfterSeconds: 0 };
  }

  if (bucket.count >= limit) {
    const retryAfterSeconds = Math.ceil((bucket.startedAt + windowMs - now) / 1000);
    return { allowed: false, remaining: 0, retryAfterSeconds };
  }

  bucket.count += 1;
  return { allowed: true, remaining: limit - bucket.count, retryAfterSeconds: 0 };
}

export function rateLimited(retryAfterSeconds: number, message: string) {
  return NextResponse.json(
    { error: message, retryAfterSeconds },
    { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } },
  );
}
