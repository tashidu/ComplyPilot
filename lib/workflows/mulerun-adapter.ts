import { z } from "zod";
import type { Finding } from "../types";

/**
 * MuleRun adapter.
 *
 * The pre-flight workflow is published in MuleRun and exposed as a production
 * webhook. This posts the already-extracted invoice data to it and validates
 * whatever comes back before any of it reaches the UI.
 *
 * The image itself is never sent. Qwen extraction happens in this application
 * and only the structured result crosses the boundary, which keeps the payload
 * small and keeps document bytes out of a third-party workflow engine.
 *
 * A failure here is never fatal: the caller falls back to the local
 * orchestrator and the UI says so.
 */

const TIMEOUT_MS = 30_000;

const FieldValue = z.union([z.string(), z.number(), z.null()]);

export const WorkflowInputSchema = z.object({
  runId: z.string(),
  ruleProfile: z.string(),
  invoice: z.record(z.string(), z.unknown()).nullable(),
  schedule: z.object({
    source: z.enum(["fixture", "upload"]),
    fileName: z.string().nullable(),
    rowCount: z.number().int().nonnegative(),
    totalLkr: z.number(),
    rows: z.array(
      z.object({
        rowNumber: z.number().int().positive(),
        invoiceNumber: z.string().nullable(),
        supplierTin: z.string().nullable(),
        netAmount: z.number().nullable(),
        vatAmount: z.number().nullable(),
        grossAmount: z.number().nullable(),
      }),
    ),
  }),
  cusdec: z.object({ totalLkr: z.number() }),
  supplier: z.object({ snapshotDate: z.string() }),
  governmentContext: z.object({
    sourceVerifiedAt: z.string(),
    invoiceRulePack: z.object({
      id: z.string(),
      version: z.string(),
      effectiveFrom: z.string(),
      sourceIds: z.array(z.string()),
    }),
    vatRates: z.array(
      z.object({
        id: z.string(),
        ratePercent: z.number(),
        effectiveFrom: z.string().nullable(),
      }),
    ),
    schedules: z.array(z.object({ id: z.string(), name: z.string() })),
    supplierSnapshot: z.object({
      id: z.string(),
      effectiveDate: z.string(),
      containsTaxpayerRecords: z.boolean(),
    }),
  }),
  resolvedBlockers: z.array(z.string()),
});

export type WorkflowInput = z.infer<typeof WorkflowInputSchema>;

/** What a MuleRun execution must return for this app to trust it. */
export const WorkflowResultSchema = z.object({
  executionId: z.string().min(1),
  gate: z.enum(["NEEDS_HUMAN", "READY_TO_FILE"]),
  findings: z.array(
    z.object({
      id: z.string(),
      status: z.enum(["open", "resolved", "inactive"]),
    }),
  ),
  score: z
    .object({
      total: z.number(),
      components: z.object({
        document: z.number(),
        schedule: z.number(),
        supplier: z.number(),
        customs: z.number(),
        package: z.number(),
      }),
    })
    .optional(),
  auditEvents: z
    .array(
      z.object({
        time: z.string(),
        actor: z.enum(["agent", "human"]),
        title: z.string(),
        detail: z.string(),
      }),
    )
    .optional(),
  stages: z
    .array(z.object({ name: z.string(), ms: z.number(), status: z.string().optional() }))
    .optional(),
});

export type WorkflowResult = z.infer<typeof WorkflowResultSchema>;

export function isMuleRunConfigured(): boolean {
  return Boolean(process.env.MULERUN_API_URL && process.env.MULERUN_API_KEY);
}

export async function runMuleRunWorkflow(input: WorkflowInput): Promise<WorkflowResult> {
  const url = process.env.MULERUN_API_URL;
  const apiKey = process.env.MULERUN_API_KEY;

  if (!url || !apiKey) {
    throw new Error("MULERUN_API_URL or MULERUN_API_KEY is not set.");
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      /timeout|abort/i.test(detail)
        ? `MuleRun did not respond within ${TIMEOUT_MS / 1000}s.`
        : `MuleRun could not be reached: ${detail}`,
    );
  }

  const raw = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      raw && typeof raw === "object" && "error" in raw
        ? String((raw as { error: unknown }).error)
        : `MuleRun returned HTTP ${response.status}.`;
    throw new Error(message);
  }

  const parsed = WorkflowResultSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new Error(
      `MuleRun response failed validation${issue ? `: ${issue.path.join(".")} ${issue.message}` : "."}`,
    );
  }
  return parsed.data;
}

export type WorkflowDisagreement = {
  findingId: string;
  localStatus: Finding["status"];
  remoteStatus: Finding["status"];
};

/**
 * Compares a MuleRun result against the locally computed findings.
 *
 * MuleRun's statuses are ADVISORY and are never applied. A blocker counts as
 * resolved only because a human resolved it, and the score is calculated from
 * local findings alone. Accepting a remote status would let anything able to
 * answer the webhook award points: returning "resolved" - or "inactive", which
 * also earns the document award - would move the score with no human involved.
 *
 * Disagreements are surfaced rather than silently applied, which is the more
 * useful signal anyway: it means the workflow and the local rules pack have
 * drifted apart and one of them needs updating.
 */
export function compareMuleRunResult(
  localFindings: Finding[],
  result: WorkflowResult,
): WorkflowDisagreement[] {
  const disagreements: WorkflowDisagreement[] = [];
  for (const finding of localFindings) {
    const remote = result.findings.find((f) => f.id === finding.id);
    if (remote && remote.status !== finding.status) {
      disagreements.push({
        findingId: finding.id,
        localStatus: finding.status,
        remoteStatus: remote.status,
      });
    }
  }
  return disagreements;
}
