import { NextResponse } from "next/server";
import { z } from "zod";
import { InvoiceExtractionSchema, type InvoiceExtraction } from "@/lib/ai/extraction-schema";
import { getSession, withSession } from "@/lib/http/session";
import { ResolvedBlockersSchema } from "@/lib/runs/resolved-blockers";
import { recallRun, rememberRun, type StoredRun } from "@/lib/runs/run-store";
import { runOrchestrator } from "@/lib/workflows/orchestrator";

export const runtime = "nodejs";

const RequestSchema = z.object({
  runId: z.string().min(1).max(120),
  futureRules: z.boolean().optional().default(true),
  resolvedBlockers: ResolvedBlockersSchema.optional().default([]),
  humanValues: z.record(z.string(), z.string().trim().max(300)).optional().default({}),
});

function setExtractionValue(
  extraction: InvoiceExtraction,
  path: string,
  value: string | number,
  source: string,
) {
  if (path.startsWith("lineItems[].")) {
    const key = path.split(".")[1] as keyof InvoiceExtraction["lineItems"][number];
    if (!extraction.lineItems[0]) return;
    const current = extraction.lineItems[0][key];
    extraction.lineItems[0][key] = { ...current, value, confidence: 100, source };
    return;
  }
  const key = path.split(".")[0] as keyof Omit<InvoiceExtraction, "lineItems">;
  const current = extraction[key];
  extraction[key] = { ...current, value, confidence: 100, source };
}

export async function POST(req: Request) {
  const session = await getSession();
  try {
    const parsed = RequestSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Send a valid run, human values and current blocker state." }, { status: 400 });
    }

    const { runId, futureRules, resolvedBlockers, humanValues } = parsed.data;
    const stored = await recallRun(runId, session.id);
    if (!stored?.analysis || !stored.extraction) {
      return NextResponse.json({ error: "This invoice run expired. Upload the invoice again." }, { status: 404 });
    }

    const plan = stored.analysis.smartFix;
    if (plan.status !== "NEEDS_REVIEW") {
      return NextResponse.json({ error: "This invoice does not have a pending Smart Fix draft." }, { status: 409 });
    }

    const missing = plan.actions
      .filter((action) => action.decision === "NEEDS_HUMAN" && !humanValues[action.field]?.trim())
      .map((action) => action.label);
    if (missing.length) {
      return NextResponse.json(
        { error: `Enter source-backed values for: ${missing.join(", ")}.` },
        { status: 400 },
      );
    }

    const corrected = structuredClone(stored.extraction) as InvoiceExtraction;
    for (const action of plan.actions) {
      const value = action.decision === "AI_DRAFT" ? action.suggestedValue : humanValues[action.field]?.trim();
      if (value === null || value === undefined || value === "") continue;
      setExtractionValue(
        corrected,
        action.extractionPath,
        typeof value === "boolean" ? String(value) : value,
        action.decision === "AI_DRAFT" ? "Approved Smart Fix draft" : "Authorised human correction",
      );
    }

    const validated = InvoiceExtractionSchema.safeParse(corrected);
    if (!validated.success) {
      return NextResponse.json({ error: "The corrected invoice values do not match the extraction schema." }, { status: 400 });
    }

    const correctedPrevious: StoredRun = { ...stored, extraction: validated.data };
    const result = await runOrchestrator(
      null,
      futureRules,
      resolvedBlockers.filter((id) => id !== "invoice"),
      correctedPrevious,
      undefined,
      stored.analysis.dataMode,
    );
    if (result.smartFix.status === "NEEDS_REVIEW") {
      return NextResponse.json(
        {
          error: `Some values still fail validation: ${result.smartFix.actions.map((action) => action.label).join(", ")}.`,
        },
        { status: 400 },
      );
    }

    result.auditEvents = [
      {
        time: new Date().toLocaleTimeString("en-GB", { hour12: false }),
        actor: "human",
        title: "Smart Fix correction approved",
        detail: `${plan.autoDraftCount} format draft(s) and ${plan.humanInputCount} source-backed value(s) were applied and revalidated.`,
      },
    ];
    await rememberRun(result, session.id);
    return withSession(result, session);
  } catch (error) {
    console.error("Error in /api/smart-fix", error);
    return NextResponse.json({ error: "The Smart Fix correction could not be applied." }, { status: 500 });
  }
}
