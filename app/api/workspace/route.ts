import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession, withSession } from "@/lib/http/session";
import { recallRun } from "@/lib/runs/run-store";
import { getOrCreateWorkspace, saveWorkspace } from "@/lib/workspace/workspace-store";
import {
  activeProfile,
  createId,
  isProfileComplete,
  syncAnalysisToWorkspace,
  type BusinessProfile,
  type BusinessWorkspace,
  type FilingFrequency,
  type VatPeriodRecord,
} from "@/lib/workspace/workspace";

export const runtime = "nodejs";

const DateText = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const ProfileFields = z.object({
  legalName: z.string().trim().max(140),
  displayName: z.string().trim().min(2).max(80),
  tin: z.union([z.literal(""), z.string().trim().regex(/^\d{9}$/, "TIN must contain nine digits.")]),
  vatRegistrationStatus: z.enum(["ACTIVE", "PENDING", "NOT_SET"]),
  filingFrequency: z.enum(["MONTHLY", "QUARTERLY"]),
  industry: z.string().trim().max(100),
  address: z.string().trim().max(240),
  financeEmail: z.union([z.literal(""), z.string().email().max(160)]),
  authorisedReviewer: z.string().trim().max(100),
  ramisConnection: z.enum(["SIMULATOR", "NOT_CONNECTED", "ONBOARDING"]),
});

const WorkspaceAction = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create_profile"), profile: ProfileFields }),
  z.object({ action: z.literal("update_profile"), profileId: z.string().min(1).max(100), profile: ProfileFields }),
  z.object({ action: z.literal("activate_profile"), profileId: z.string().min(1).max(100) }),
  z.object({
    action: z.literal("create_period"),
    profileId: z.string().min(1).max(100),
    period: z.object({
      label: z.string().trim().min(2).max(60),
      frequency: z.enum(["MONTHLY", "QUARTERLY"]),
      startDate: DateText,
      endDate: DateText,
      paymentDueDate: DateText,
      returnDueDate: DateText,
    }),
  }),
  z.object({
    action: z.literal("activate_period"),
    profileId: z.string().min(1).max(100),
    periodId: z.string().min(1).max(100),
  }),
  z.object({
    action: z.literal("sync_analysis"),
    runId: z.string().min(1).max(120),
    periodId: z.string().min(1).max(100).optional(),
    fileName: z.string().trim().min(1).max(240).optional(),
    documentType: z.enum(["INVOICE", "VAT_SCHEDULE", "CREDIT_DEBIT_NOTE", "SUPPORTING_EVIDENCE"]).optional(),
  }),
  z.object({
    action: z.literal("update_task"),
    taskId: z.string().min(1).max(100),
    status: z.enum(["OPEN", "WAITING_EVIDENCE", "READY_FOR_REVIEW"]),
    assignedTo: z.string().trim().max(100),
    evidenceNote: z.string().trim().max(800),
  }),
  z.object({
    action: z.literal("queue_tasks"),
    periodId: z.string().min(1).max(100),
    findingIds: z.array(z.enum(["invoice", "supplier", "customs", "schedule"])).min(1).max(4),
  }),
  z.object({
    action: z.literal("approve_period"),
    periodId: z.string().min(1).max(100),
    reviewer: z.string().trim().min(2).max(100),
  }),
  z.object({
    action: z.literal("record_submission"),
    periodId: z.string().min(1).max(100),
    acknowledgement: z.string().trim().min(4).max(120),
    readinessScore: z.number().int().min(0).max(100),
    submittedBy: z.string().trim().min(2).max(100),
  }),
]);

class WorkspaceRequestError extends Error {}

function findProfile(workspace: BusinessWorkspace, profileId: string): BusinessProfile {
  const profile = workspace.profiles.find((candidate) => candidate.id === profileId);
  if (!profile) throw new WorkspaceRequestError("The selected business profile does not exist.");
  return profile;
}

function findPeriod(workspace: BusinessWorkspace, periodId: string): VatPeriodRecord {
  const period = workspace.periods.find((candidate) => candidate.id === periodId);
  if (!period) throw new WorkspaceRequestError("The selected VAT period does not exist.");
  return period;
}

function defaultPeriod(profileId: string, frequency: FilingFrequency): VatPeriodRecord {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const quarterStart = Math.floor(month / 3) * 3;
  const startMonth = frequency === "MONTHLY" ? month : quarterStart;
  const endMonth = frequency === "MONTHLY" ? month : quarterStart + 2;
  const start = new Date(Date.UTC(year, startMonth, 1));
  const end = new Date(Date.UTC(year, endMonth + 1, 0));
  const paymentDue = new Date(Date.UTC(year, endMonth + 1, 20));
  const returnDue = new Date(Date.UTC(year, endMonth + 2, 0));
  const monthLabel = start.toLocaleString("en", { month: "long", timeZone: "UTC" });
  return {
    id: createId("PERIOD"),
    profileId,
    label: frequency === "MONTHLY" ? `${monthLabel} ${year}` : `Q${Math.floor(month / 3) + 1} ${year}`,
    frequency,
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
    paymentDueDate: paymentDue.toISOString().slice(0, 10),
    returnDueDate: returnDue.toISOString().slice(0, 10),
    status: "COLLECTING",
    runId: null,
    approvedBy: null,
    approvedAt: null,
    lastActivityAt: now.toISOString(),
  };
}

export async function GET() {
  const session = await getSession();
  try {
    return withSession({ workspace: await getOrCreateWorkspace(session.id) }, session);
  } catch (error) {
    console.error("Error in GET /api/workspace", error);
    return NextResponse.json({ error: "The business workspace is unavailable. Check the database connection." }, { status: 503 });
  }
}

export async function POST(req: Request) {
  const session = await getSession();
  try {
    const parsed = WorkspaceAction.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "The workspace action contains invalid or missing fields." }, { status: 400 });
    }

    let workspace = await getOrCreateWorkspace(session.id);
    const now = new Date().toISOString();
    const input = parsed.data;

    if (input.action === "create_profile") {
      const profileId = createId("BIZ");
      const period = defaultPeriod(profileId, input.profile.filingFrequency);
      const profile: BusinessProfile = {
        ...input.profile,
        id: profileId,
        activePeriodId: period.id,
        isSynthetic: false,
        createdAt: now,
        updatedAt: now,
      };
      workspace = {
        ...workspace,
        activeProfileId: profileId,
        profiles: [...workspace.profiles, profile],
        periods: [...workspace.periods, period],
        updatedAt: now,
      };
    } else if (input.action === "update_profile") {
      findProfile(workspace, input.profileId);
      workspace = {
        ...workspace,
        profiles: workspace.profiles.map((profile) =>
          profile.id === input.profileId ? { ...profile, ...input.profile, updatedAt: now } : profile,
        ),
        updatedAt: now,
      };
    } else if (input.action === "activate_profile") {
      findProfile(workspace, input.profileId);
      workspace = { ...workspace, activeProfileId: input.profileId, updatedAt: now };
    } else if (input.action === "create_period") {
      const profile = findProfile(workspace, input.profileId);
      if (input.period.startDate > input.period.endDate) {
        throw new WorkspaceRequestError("The period end date must be on or after its start date.");
      }
      if (workspace.periods.some((period) => period.profileId === profile.id && period.label.toLowerCase() === input.period.label.toLowerCase())) {
        throw new WorkspaceRequestError("A VAT period with this label already exists for the business.");
      }
      const period: VatPeriodRecord = {
        id: createId("PERIOD"),
        profileId: profile.id,
        ...input.period,
        status: "COLLECTING",
        runId: null,
        approvedBy: null,
        approvedAt: null,
        lastActivityAt: now,
      };
      workspace = {
        ...workspace,
        periods: [...workspace.periods, period],
        profiles: workspace.profiles.map((candidate) =>
          candidate.id === profile.id ? { ...candidate, activePeriodId: period.id, updatedAt: now } : candidate,
        ),
        updatedAt: now,
      };
    } else if (input.action === "activate_period") {
      const profile = findProfile(workspace, input.profileId);
      const period = findPeriod(workspace, input.periodId);
      if (period.profileId !== profile.id) throw new WorkspaceRequestError("That period belongs to another business profile.");
      if (period.status === "SUBMITTED") throw new WorkspaceRequestError("Submitted periods are read-only. Open Submission History instead.");
      workspace = {
        ...workspace,
        profiles: workspace.profiles.map((candidate) =>
          candidate.id === profile.id ? { ...candidate, activePeriodId: period.id, updatedAt: now } : candidate,
        ),
        updatedAt: now,
      };
    } else if (input.action === "sync_analysis") {
      const stored = await recallRun(input.runId, session.id);
      if (!stored?.analysis) throw new WorkspaceRequestError("The analysis run expired. Run the analysis again.");
      if (Boolean(input.fileName) !== Boolean(input.documentType)) {
        throw new WorkspaceRequestError("A workspace document needs both a file name and a document type.");
      }
      const targetPeriod = findPeriod(workspace, input.periodId ?? activeProfile(workspace).activePeriodId);
      if (input.fileName && (targetPeriod.status === "APPROVED" || targetPeriod.status === "SUBMITTED")) {
        throw new WorkspaceRequestError("This VAT period is closed and cannot accept new documents.");
      }
      workspace = syncAnalysisToWorkspace(workspace, stored.analysis, {
        periodId: input.periodId,
        fileName: input.fileName,
        documentType: input.documentType,
      });
    } else if (input.action === "update_task") {
      const task = workspace.tasks.find((candidate) => candidate.id === input.taskId);
      if (!task) throw new WorkspaceRequestError("The selected task does not exist.");
      const period = findPeriod(workspace, task.periodId);
      if (period.status === "APPROVED" || period.status === "SUBMITTED") {
        throw new WorkspaceRequestError("Tasks in a closed VAT period are read-only.");
      }
      workspace = {
        ...workspace,
        tasks: workspace.tasks.map((candidate) =>
          candidate.id === task.id
            ? {
                ...candidate,
                status: input.status,
                assignedTo: input.assignedTo,
                evidenceNote: input.evidenceNote,
                updatedAt: now,
              }
            : candidate,
        ),
        updatedAt: now,
      };
    } else if (input.action === "queue_tasks") {
      const period = findPeriod(workspace, input.periodId);
      if (period.status === "APPROVED" || period.status === "SUBMITTED") {
        throw new WorkspaceRequestError("Tasks cannot be added to a closed VAT period.");
      }
      const selected = new Set(input.findingIds);
      workspace = {
        ...workspace,
        tasks: workspace.tasks.map((task) =>
          task.periodId === input.periodId && selected.has(task.findingId as "invoice" | "supplier" | "customs" | "schedule")
            ? { ...task, selectedForAction: true, status: task.status === "COMPLETED" ? task.status : "READY_FOR_REVIEW", updatedAt: now }
            : task,
        ),
        updatedAt: now,
      };
    } else if (input.action === "approve_period") {
      const period = findPeriod(workspace, input.periodId);
      const profile = findProfile(workspace, period.profileId);
      if (period.status === "SUBMITTED") throw new WorkspaceRequestError("A submitted VAT period cannot be reopened.");
      if (period.status === "APPROVED") throw new WorkspaceRequestError("This VAT period is already approved.");
      if (!isProfileComplete(profile)) throw new WorkspaceRequestError("Complete the business profile before period approval.");
      const openTasks = workspace.tasks.filter((task) => task.periodId === period.id && task.status !== "COMPLETED");
      if (openTasks.length) throw new WorkspaceRequestError(`${openTasks.length} saved task(s) still require completion.`);
      if (!period.runId) throw new WorkspaceRequestError("Run the period analysis before approval.");
      const stored = await recallRun(period.runId, session.id);
      if (!stored?.analysis || stored.analysis.workflow.gate !== "READY_TO_FILE") {
        throw new WorkspaceRequestError("The latest analysis is not ready for human approval.");
      }
      workspace = {
        ...workspace,
        periods: workspace.periods.map((candidate) =>
          candidate.id === period.id
            ? { ...candidate, status: "APPROVED", approvedBy: input.reviewer, approvedAt: now, lastActivityAt: now }
            : candidate,
        ),
        updatedAt: now,
      };
    } else if (input.action === "record_submission") {
      const period = findPeriod(workspace, input.periodId);
      if (period.status !== "APPROVED") throw new WorkspaceRequestError("The VAT period must be approved before submission.");
      const submission = {
        id: `SUB-${randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase()}`,
        periodId: period.id,
        acknowledgement: input.acknowledgement,
        submissionType: "RAMIS_SIMULATOR" as const,
        status: "ACCEPTED_MOCK" as const,
        readinessScore: input.readinessScore,
        submittedBy: input.submittedBy,
        submittedAt: now,
        note: "Simulator acknowledgement only; no live government action occurred.",
      };
      workspace = {
        ...workspace,
        periods: workspace.periods.map((candidate) =>
          candidate.id === period.id ? { ...candidate, status: "SUBMITTED", lastActivityAt: now } : candidate,
        ),
        submissions: [submission, ...workspace.submissions],
        updatedAt: now,
      };
    }

    await saveWorkspace(session.id, workspace);
    return withSession({ workspace }, session);
  } catch (error) {
    console.error("Error in POST /api/workspace", error);
    if (error instanceof WorkspaceRequestError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: "The business workspace could not be updated." }, { status: 500 });
  }
}
