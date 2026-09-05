import { NextResponse } from "next/server";
import { runOrchestrator, type UploadedImage } from "@/lib/workflows/orchestrator";
import { recallRun, rememberRun } from "@/lib/runs/run-store";

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

function now() {
  return new Date().toLocaleTimeString("en-GB", { hour12: false });
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData();

    // Process image if available
    let image: UploadedImage | null = null;
    const file = formData.get("file");
    if (file instanceof File && file.size > 0) {
      if (file.size > MAX_FILE_BYTES) {
        return NextResponse.json(
          { error: `File is larger than the ${MAX_FILE_BYTES / 1024 / 1024} MB limit.` },
          { status: 413 },
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

    const futureRules = formData.get("futureRules") === "true";
    const resolvedBlockersStr = formData.get("resolvedBlockers") as string;
    const resolvedBlockers = resolvedBlockersStr ? JSON.parse(resolvedBlockersStr) : [];

    // Continue an existing run when no new file is supplied, so a live
    // extraction is not replaced by fixtures on a rule-profile change.
    const previous = image ? undefined : recallRun(formData.get("runId") as string | null);
    const result = await runOrchestrator(image, futureRules, resolvedBlockers, previous);
    rememberRun(result);

    // Audit events must describe what actually happened, never what was intended.
    if (!image && resolvedBlockers.length === 0) {
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

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error in /api/analyze", error);
    return NextResponse.json({ error: "Failed to analyze document" }, { status: 500 });
  }
}
