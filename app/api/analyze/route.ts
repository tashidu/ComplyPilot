import { NextResponse } from "next/server";
import { runOrchestrator, type UploadedImage } from "@/lib/workflows/orchestrator";
import { recallRun, rememberRun } from "@/lib/runs/run-store";
import { parseVatScheduleCsv, ScheduleParseError } from "@/lib/evidence/schedule-parser";
import type { VatScheduleEvidence } from "@/lib/types";
import { SUPPORTED_IMAGE_TYPES } from "@/lib/ai/qwen-client";
import { consumeRate, getSession, rateLimited, withSession } from "@/lib/http/session";

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_CSV_BYTES = 2 * 1024 * 1024; // 2 MB

// An upload can reach Model Studio on a paid quota, so a public URL needs a
// ceiling. Generous enough that no one demonstrating the product will hit it.
const ANALYZE_LIMIT = 40;
const ANALYZE_WINDOW_MS = 10 * 60 * 1000;

/** Findings a client may mark resolved. Anything else is rejected outright. */
const KNOWN_BLOCKERS = new Set(["invoice", "supplier", "customs", "schedule"]);

function parseResolvedBlockers(raw: unknown): string[] | null {
  if (typeof raw !== "string" || raw.length === 0) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;
  if (!parsed.every((id) => typeof id === "string" && KNOWN_BLOCKERS.has(id))) return null;
  return parsed as string[];
}

function now() {
  return new Date().toLocaleTimeString("en-GB", { hour12: false });
}

export async function POST(req: Request) {
  const session = await getSession();
  const rate = consumeRate(`analyze:${session.id}`, ANALYZE_LIMIT, ANALYZE_WINDOW_MS);
  if (!rate.allowed) {
    return rateLimited(
      rate.retryAfterSeconds,
      "Too many analyses from this session. Wait a moment and try again.",
    );
  }

  try {
    const formData = await req.formData();

    // Process image if available
    let image: UploadedImage | null = null;
    let scheduleUpload: VatScheduleEvidence | undefined;
    const file = formData.get("file");
    if (file instanceof File && file.size > 0) {
      const isCsv = file.type === "text/csv" || file.name.toLowerCase().endsWith(".csv");
      const limit = isCsv ? MAX_CSV_BYTES : MAX_FILE_BYTES;
      if (file.size > limit) {
        return NextResponse.json(
          { error: `File is larger than the ${limit / 1024 / 1024} MB limit.` },
          { status: 413 },
        );
      }
      if (isCsv) {
        scheduleUpload = parseVatScheduleCsv(await file.text(), file.name);
      } else {
        if (!SUPPORTED_IMAGE_TYPES.includes(file.type)) {
          return NextResponse.json(
            { error: "Upload a JPEG, PNG, WebP or BMP invoice image, or a VAT Schedule CSV." },
            { status: 415 },
          );
        }
        const arrayBuffer = await file.arrayBuffer();
        image = {
          base64: Buffer.from(arrayBuffer).toString("base64"),
          // Carry the real content type through; the vision model rejects a
          // PNG or PDF that has been mislabelled as a JPEG.
          mimeType: file.type || "application/octet-stream",
        };
      }
    }

    const futureRules = formData.get("futureRules") === "true";
    // Malformed or unknown ids are a client error, not a 500. Validating the
    // list also stops an arbitrary id being marked resolved.
    const resolvedBlockers = parseResolvedBlockers(formData.get("resolvedBlockers"));
    if (resolvedBlockers === null) {
      return NextResponse.json(
        { error: "resolvedBlockers must be a JSON array of known finding ids." },
        { status: 400 },
      );
    }

    // Continue an existing run when no new file is supplied, so a live
    // extraction is not replaced by fixtures on a rule-profile change.
    const previous = recallRun(formData.get("runId") as string | null, session.id);
    const result = await runOrchestrator(
      image,
      futureRules,
      resolvedBlockers,
      previous,
      scheduleUpload,
    );
    rememberRun(result, session.id);

    // Audit events must describe what actually happened, never what was intended.
    if (!image && !scheduleUpload && resolvedBlockers.length === 0) {
      result.auditEvents = [
        {
          time: now(),
          actor: "agent",
          title: "Pre-flight workflow started",
          detail: "13 synthetic evidence files routed to three specialist agents.",
        },
        {
          time: now(),
          actor: "agent",
          title: "Demo fixture loaded",
          detail: "No document was uploaded, so the synthetic demo case is shown.",
        },
      ];
    } else if (scheduleUpload) {
      result.auditEvents = [
        {
          time: now(),
          actor: "agent",
          title: "VAT Schedule CSV parsed and reconciled",
          detail: `${scheduleUpload.fileName}: ${scheduleUpload.rows.length} rows parsed; result ${result.scheduleReconciliation.status}.`,
        },
      ];
    } else if (image) {
      result.auditEvents = [
        result.mode === "LIVE_QWEN"
          ? {
              time: now(),
              actor: "agent",
              title: "Document Agent extracted the upload",
              detail: `Model Studio (${process.env.QWEN_MODEL || "qwen-vl-plus"}) returned schema-validated fields.`,
            }
          : {
              time: now(),
              actor: "agent",
              title: "Demo fallback used for the upload",
              detail: result.fallbackReason ?? "Model Studio was unavailable.",
            },
      ];
    }

    return withSession(result, session);
  } catch (error) {
    console.error("Error in /api/analyze", error);
    if (error instanceof ScheduleParseError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to analyze document" }, { status: 500 });
  }
}
