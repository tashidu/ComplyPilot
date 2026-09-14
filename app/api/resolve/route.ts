import { NextResponse } from "next/server";
import { z } from "zod";
import { runOrchestrator } from "@/lib/workflows/orchestrator";
import { recallRun, rememberRun } from "@/lib/runs/run-store";
import { getOrCreateSessionId, withSessionCookie } from "@/lib/runs/session";

export const runtime = "nodejs";

const ResolveRequestSchema = z.object({
  findingId: z.string().min(1),
  resolvedBlockers: z.array(z.string().min(1)).max(50).optional().default([]),
  futureRules: z.boolean().optional().default(false),
  runId: z.string().min(1).max(120).nullable().optional(),
});

export async function POST(req: Request) {
  const { id: ownerSessionId, isNew } = await getOrCreateSessionId();
  try {
    const body = await req.json().catch(() => null);
    const parsed = ResolveRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Send a findingId and, optionally, resolvedBlockers, futureRules and runId." },
        { status: 400 },
      );
    }
    const { findingId, resolvedBlockers, futureRules, runId } = parsed.data;

    const currentResolved = new Set<string>(resolvedBlockers);
    
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
    const result = await runOrchestrator(null, futureRules, nextResolved, previous);
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
