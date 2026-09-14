import { NextResponse } from "next/server";
import {
  approveChange,
  getWatchState,
  rejectChange,
  resetWatch,
} from "@/lib/agents/regulatory-watch";
import { getOrCreateSessionId, withSessionCookie } from "@/lib/runs/session";

export const runtime = "nodejs";

/**
 * Each browser gets its own demo session, so two judges viewing the hosted
 * prototype at the same time do not share one pending rule change.
 */
function withSession(body: unknown, id: string, isNew: boolean) {
  return withSessionCookie(NextResponse.json(body), id, isNew);
}

export async function GET() {
  const { id, isNew } = await getOrCreateSessionId();
  return withSession({ simulated: true, state: getWatchState(id) }, id, isNew);
}

export async function POST(req: Request) {
  const { id, isNew } = await getOrCreateSessionId();
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
