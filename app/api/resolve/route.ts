import { NextResponse } from "next/server";
import { runOrchestrator } from "@/lib/workflows/orchestrator";
import { recallRun, rememberRun } from "@/lib/runs/run-store";

export async function POST(req: Request) {
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
    const result = await runOrchestrator(null, !!futureRules, nextResolved, recallRun(runId));
    rememberRun(result);

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

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error in /api/resolve", error);
    return NextResponse.json(
      { error: "Failed to resolve finding" },
      { status: 500 }
    );
  }
}
