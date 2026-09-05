import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  approveChange,
  getWatchState,
  rejectChange,
  resetWatch,
} from "@/lib/agents/regulatory-watch";

export const runtime = "nodejs";

const COOKIE = "cp_demo_session";

/**
 * Each browser gets its own demo session, so two judges viewing the hosted
 * prototype at the same time do not share one pending rule change.
 */
async function sessionId(): Promise<{ id: string; isNew: boolean }> {
  const jar = await cookies();
  const existing = jar.get(COOKIE)?.value;
  if (existing) return { id: existing, isNew: false };
  return { id: `S-${Math.random().toString(36).slice(2, 10)}`, isNew: true };
}

function withSession(body: unknown, id: string, isNew: boolean) {
  const response = NextResponse.json(body);
  if (isNew) {
    response.cookies.set(COOKIE, id, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 8,
    });
  }
  return response;
}

export async function GET() {
  const { id, isNew } = await sessionId();
  return withSession({ simulated: true, state: getWatchState(id) }, id, isNew);
}

export async function POST(req: Request) {
  const { id, isNew } = await sessionId();
  try {
    const body = await req.json().catch(() => ({}));
    const reviewer = String(body.reviewer ?? "").trim();

    if (body.action === "reset") {
      return withSession({ simulated: true, state: resetWatch(id), event: null }, id, isNew);
    }

    // A rule pack never activates without a named human accepting it.
    if (!reviewer) {
      return NextResponse.json(
        { error: "The name of the reviewing tax professional is required." },
        { status: 400 },
      );
    }

    if (body.action === "approve") {
      const { state, event } = approveChange(id, reviewer);
      return withSession({ simulated: true, state, event }, id, isNew);
    }
    if (body.action === "reject") {
      const { state, event } = rejectChange(id, reviewer);
      return withSession({ simulated: true, state, event }, id, isNew);
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (error) {
    console.error("Error in /api/regulatory-watch", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "The watch agent failed." },
      { status: 500 },
    );
  }
}
