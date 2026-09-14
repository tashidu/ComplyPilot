import { NextResponse } from "next/server";
import { z } from "zod";
import { recallRun } from "@/lib/runs/run-store";
import { consumeRate, getSession, rateLimited } from "@/lib/http/session";
import { KNOWN_BLOCKER_IDS } from "@/lib/runs/resolved-blockers";
import { calculateClaimValue, calculateReadiness } from "@/lib/agents/readiness-agent";
import type { Finding } from "@/lib/types";

export const runtime = "nodejs";

// A pure, local recompute over already-known findings - no Qwen call, no
// MuleRun call, no disk I/O beyond the one recall. Cheap enough to run on
// every checkbox toggle, so the ceiling is generous.
const SIMULATE_LIMIT = 120;
const SIMULATE_WINDOW_MS = 10 * 60 * 1000;

const SimulateRequestSchema = z.object({
  runId: z.string().min(1).max(120),
  selectedActionIds: z.array(z.enum(KNOWN_BLOCKER_IDS)).max(50).optional().default([]),
});

export async function POST(req: Request) {
  const session = await getSession();
  const rate = consumeRate(`simulate:${session.id}`, SIMULATE_LIMIT, SIMULATE_WINDOW_MS);
  if (!rate.allowed) {
    return rateLimited(
      rate.retryAfterSeconds,
      "Too many simulator previews from this session. Wait a moment and try again.",
    );
  }

  try {
    const parsed = SimulateRequestSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Send a runId and, optionally, selectedActionIds." }, { status: 400 });
    }
    const { runId, selectedActionIds } = parsed.data;

    const stored = await recallRun(runId, session.id);
    if (!stored?.analysis) {
      return NextResponse.json({ error: "This analysis run expired. Refresh or reset the demo." }, { status: 404 });
    }

    // The actual case is never touched: this only ever reads the persisted
    // run and returns a hypothetical score. Inactive findings (e.g. schedule
    // awaiting an invoice) cannot be hypothetically resolved - there is
    // nothing yet for a human to have fixed - and an already-resolved
    // finding cannot be hypothetically un-resolved by simply not selecting it.
    const selected = new Set<string>(selectedActionIds);
    const scenarioFindings: Finding[] = stored.analysis.findings.map((finding) =>
      finding.status === "open" && selected.has(finding.id)
        ? { ...finding, status: "resolved" as const }
        : finding,
    );

    const score = calculateReadiness(scenarioFindings);
    const claimValueUnderReviewLkr = calculateClaimValue(scenarioFindings);

    return NextResponse.json({ score, claimValueUnderReviewLkr });
  } catch (error) {
    console.error("Error in /api/simulate", error);
    return NextResponse.json({ error: "The simulator could not compute a preview." }, { status: 500 });
  }
}
