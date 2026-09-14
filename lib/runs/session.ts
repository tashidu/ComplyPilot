import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import type { NextResponse } from "next/server";

/**
 * Binds every run, chat and filing session to the browser that created it, so
 * one demo session can never read or drive another's case by guessing or
 * replaying a runId/sessionId. Shared by every route that touches run state.
 */
const COOKIE = "cp_demo_session";
const MAX_AGE_SECONDS = 60 * 60 * 8;

export async function getOrCreateSessionId(): Promise<{ id: string; isNew: boolean }> {
  const jar = await cookies();
  const existing = jar.get(COOKIE)?.value;
  if (existing) return { id: existing, isNew: false };
  return { id: `S-${randomUUID()}`, isNew: true };
}

export function withSessionCookie<T extends NextResponse>(response: T, id: string, isNew: boolean): T {
  if (isNew) {
    response.cookies.set(COOKIE, id, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: MAX_AGE_SECONDS,
    });
  }
  return response;
}
