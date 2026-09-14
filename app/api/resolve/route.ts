import { NextResponse } from "next/server";
import { runOrchestrator } from "@/lib/workflows/orchestrator";
import { recallRun, rememberRun } from "@/lib/runs/run-store";
import { getOrCreateSessionId, withSessionCookie } from "@/lib/runs/session";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const { id: ownerSessionId, isNew } = await getOrCreateSessionId();
  try {
    const { findingId, resolvedBlockers, futureRules, runId } = await req.json();

    if (!findingId) {
      return NextResponse.json({ error: "findingId is required" }, { status: 400 });
    }

    const currentResolved = new Set<string>(resolvedBlockers || []);
    
    // Toggle the findingId
    if (currentResolved.has(findingId)) {
      currentResolved.delete(findingId);
    } else {
      currentResolved.add(findingId);
    }

    const nextResolved = Array.from(currentResolved);

    // Re-run the deterministic checks against whatever this run extracted,
    // without making another AI call.
    const previous = await recallRun(runId, ownerSessionId);
    const result = await runOrchestrator(null, !!futureRules, nextResolved, previous);
    await rememberRun(result, ownerSessionId);

    // Prepare audit event
    const action = currentResolved.has(findingId) ? "resolved" : "reopened";
    result.auditEvents = [
      {
        time: new Date().toLocaleTimeString("en-GB", { hour12: false }),
        actor: "human",
        title: `Finding ${findingId} ${action}`,
        detail: `The state of the finding was toggled to ${action}. Readiness recalculated to ${result.score.total}/100.`,
      }
    ];

    return withSessionCookie(NextResponse.json(result), ownerSessionId, isNew);
  } catch (error) {
    console.error("Error in /api/resolve", error);
    return NextResponse.json(
      { error: "Failed to resolve finding" },
      { status: 500 }
    );
  }
}
