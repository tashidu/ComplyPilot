import { NextResponse } from "next/server";
import { z } from "zod";
import { runOrchestrator } from "@/lib/workflows/orchestrator";
import { recallRun, rememberRun } from "@/lib/runs/run-store";
import { getSession, withSession } from "@/lib/http/session";
import { KNOWN_BLOCKER_IDS, ResolvedBlockersSchema } from "@/lib/runs/resolved-blockers";

export const runtime = "nodejs";

const ResolveRequestSchema = z.object({
  findingId: z.enum(KNOWN_BLOCKER_IDS),
  resolvedBlockers: ResolvedBlockersSchema.optional().default([]),
  futureRules: z.boolean().optional().default(false),
  runId: z.string().min(1).max(120).nullable().optional(),
  evidenceNote: z.string().trim().max(800).optional().default(""),
});

export async function POST(req: Request) {
  const session = await getSession();
  try {
    const body = await req.json().catch(() => null);
    const parsed = ResolveRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Send a known findingId and, optionally, resolvedBlockers, futureRules and runId." },
        { status: 400 },
      );
    }
    const { findingId, resolvedBlockers, futureRules, runId, evidenceNote } = parsed.data;

    const currentResolved = new Set<string>(resolvedBlockers);

    if (!currentResolved.has(findingId) && findingId === "invoice") {
      return NextResponse.json(
        { error: "Invoice findings must be corrected and revalidated through Smart Fix." },
        { status: 409 },
      );
    }
    if (!currentResolved.has(findingId) && evidenceNote.length < 8) {
      return NextResponse.json(
        { error: "Add an evidence note of at least eight characters before resolving this finding." },
        { status: 400 },
      );
    }

    // Toggle the findingId
    if (currentResolved.has(findingId)) {
      currentResolved.delete(findingId);
    } else {
      currentResolved.add(findingId);
    }

    const nextResolved = Array.from(currentResolved);

    // Re-run the deterministic checks against whatever this run extracted,
    // without making another AI call.
    const previous = await recallRun(runId, session.id);
    const result = await runOrchestrator(null, futureRules, nextResolved, previous);
    await rememberRun(result, session.id);

    // Prepare audit event
    const action = currentResolved.has(findingId) ? "resolved" : "reopened";
    result.auditEvents = [
      {
        time: new Date().toLocaleTimeString("en-GB", { hour12: false }),
        actor: "human",
        title: `Finding ${findingId} ${action}`,
        detail: action === "resolved"
          ? `A human evidence note was recorded and the finding was resolved. Readiness recalculated to ${result.score.total}/100.`
          : `The finding was reopened. Readiness recalculated to ${result.score.total}/100.`,
      }
    ];

    return withSession(result, session);
  } catch (error) {
    console.error("Error in /api/resolve", error);
    return NextResponse.json(
      { error: "Failed to resolve finding" },
      { status: 500 }
    );
  }
}
