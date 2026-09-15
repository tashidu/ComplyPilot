import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession, withSession } from "@/lib/http/session";
import { recallRun } from "@/lib/runs/run-store";
import { getOrCreateWorkspace, saveWorkspace } from "@/lib/workspace/workspace-store";
import { buildVatDocumentChecklist, createVatRegistrationDraft, registrationReadiness } from "@/lib/vat-registration";
import { calculateInvoiceLine, calculateVat, invoiceSerial, resolveTransactionVat, scheduleFor, totalInvoiceLines } from "@/lib/vat-operations";
import {
  activeProfile,
  createId,
  isProfileComplete,
  canOperateVat,
  vatOperationBlocker,
  syncAnalysisToWorkspace,
  type BusinessProfile,
  type BusinessWorkspace,
  type FilingFrequency,
  type VatRegistrationApplication,
  type VatPeriodRecord,
} from "@/lib/workspace/workspace";

export const runtime = "nodejs";

const DateText = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const ProfileFields = z.object({
  legalName: z.string().trim().max(140),
  displayName: z.string().trim().min(2).max(80),
  entityType: z.enum(["COMPANY", "INDIVIDUAL_PROPRIETORSHIP", "PARTNERSHIP", "OTHER"]),
  businessRegistrationNumber: z.string().trim().max(80),
  incorporationDate: z.union([z.literal(""), DateText]),
  tin: z.union([z.literal(""), z.string().trim().regex(/^\d{9}$/, "TIN must contain nine digits.")]),
  irdPinStatus: z.enum(["NOT_REQUESTED", "REQUESTED", "ACTIVE"]),
  vatRegistrationStatus: z.enum(["ACTIVE", "PENDING", "NOT_SET"]),
  vatRegistrationEffectiveDate: z.union([z.literal(""), DateText]),
  vatRegistrationCertificateRef: z.string().trim().max(120),
  filingFrequency: z.enum(["MONTHLY", "QUARTERLY"]),
  industry: z.string().trim().max(100),
  address: z.string().trim().max(240),
  postalCode: z.string().trim().max(12),
  contactPhone: z.string().trim().max(30),
  financeEmail: z.union([z.literal(""), z.string().email().max(160)]),
  accountingSystem: z.string().trim().max(100),
  authorisedReviewer: z.string().trim().max(100),
  ramisConnection: z.enum(["SIMULATOR", "NOT_CONNECTED", "ONBOARDING", "LIVE_APPROVED"]),
}).refine(
  // ACTIVE is a claim that the Department registered this business. It may only
  // be saved together with the evidence for it - otherwise a profile edit is
  // enough to unlock invoicing and a VAT return with nothing behind them.
  // confirm_vat_registration is the path that supplies both.
  (profile) =>
    profile.vatRegistrationStatus !== "ACTIVE" ||
    Boolean(profile.vatRegistrationEffectiveDate && profile.vatRegistrationCertificateRef.trim()),
  {
    message:
      "An active VAT registration needs its IRD effective date and certificate or acknowledgement reference.",
    path: ["vatRegistrationStatus"],
  },
);

const WorkspaceAction = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create_profile"), profile: ProfileFields }),
  z.object({ action: z.literal("update_profile"), profileId: z.string().min(1).max(100), profile: ProfileFields }),
  z.object({ action: z.literal("activate_profile"), profileId: z.string().min(1).max(100) }),
  z.object({
    action: z.literal("confirm_vat_registration"),
    profileId: z.string().min(1).max(100),
    effectiveDate: DateText,
    certificateReference: z.string().trim().min(3).max(120),
  }),
  z.object({
    action: z.literal("save_ramis_api_profile"),
    profileId: z.string().min(1).max(100),
    integration: z.object({
      status: z.enum(["NOT_STARTED", "CONTACT_IRD", "ONBOARDING", "APPROVED"]),
      integrationReference: z.string().trim().max(120),
      erpSystemName: z.string().trim().max(120),
      technicalContactEmail: z.union([z.literal(""), z.string().email().max(160)]),
      ssid: z.string().trim().max(120),
      credentialsConfigured: z.boolean(),
      baseUrlReceivedFromIrd: z.boolean(),
      scheduleScopes: z.array(z.enum(["SCHEDULE_01", "SCHEDULE_04", "SCHEDULE_07"])).max(3),
      notes: z.string().trim().max(800),
    }),
  }),
  z.object({
    action: z.literal("create_vat_transaction"),
    profileId: z.string().min(1).max(100),
    periodId: z.string().min(1).max(100),
    transaction: z.object({
      kind: z.enum(["OUTPUT", "INPUT_LOCAL", "INPUT_IMPORT"]),
      treatment: z.enum(["STANDARD_18", "ZERO_RATED", "EXEMPT", "OUT_OF_SCOPE"]),
      supplyType: z.enum(["GOODS", "SERVICES"]),
      invoiceNumber: z.string().trim().min(1).max(40),
      invoiceDate: DateText,
      counterpartyName: z.string().trim().min(2).max(160),
      counterpartyTin: z.union([z.literal(""), z.string().regex(/^\d{9}$/)]),
      description: z.string().trim().min(2).max(240),
      netAmountLkr: z.number().finite().positive().max(1_000_000_000_000),
      /**
       * The VAT printed on the supplier's invoice. Purchases only: input tax is
       * recoverable to the extent it was charged and evidenced, so the claim
       * follows the document rather than a recomputed 18%.
       */
      statedVatAmountLkr: z.number().finite().min(0).max(1_000_000_000_000).optional(),
      disallowedInputVatLkr: z.number().finite().min(0).max(1_000_000_000_000),
    }),
  }),
  z.object({
    action: z.literal("create_vat_invoice"),
    profileId: z.string().min(1).max(100),
    periodId: z.string().min(1).max(100),
    invoice: z.object({
      invoiceDate: DateText,
      supplyDate: DateText,
      classificationCode: z.string().trim().regex(/^[A-Za-z0-9]{1,15}$/),
      treatment: z.enum(["STANDARD_18", "ZERO_RATED"]),
      supplyType: z.enum(["GOODS", "SERVICES"]),
      purchaserName: z.string().trim().min(2).max(160),
      purchaserTin: z.string().regex(/^\d{9}$/),
      purchaserAddress: z.string().trim().min(3).max(240),
      placeOfSupply: z.string().trim().max(160),
      paymentMode: z.string().trim().max(80),
      lines: z.array(z.object({ description: z.string().trim().min(2).max(240), quantity: z.number().finite().positive().max(1_000_000), unitPriceLkr: z.number().finite().positive().max(1_000_000_000_000) })).min(1).max(20),
    }),
  }),
  z.object({
    action: z.literal("save_vat_registration"),
    profileId: z.string().min(1).max(100),
    application: z.object({
      basis: z.enum(["TURNOVER", "VOLUNTARY", "IMPORT_EXPORT", "SECTION_10C_NEW_BUSINESS", "TEMPORARY"]),
      premisesNo: z.string().trim().max(40),
      unitNo: z.string().trim().max(40),
      taxTypeAddress: z.string().trim().max(240),
      postalCode: z.string().trim().max(12),
      businessActivity: z.string().trim().max(180),
      activityCode: z.string().trim().max(30),
      requestedEffectiveDate: z.union([z.literal(""), DateText]),
      firstTransactionDate: z.union([z.literal(""), DateText]),
      estimatedTaxableSupplyDate: z.union([z.literal(""), DateText]),
      taxableSuppliesLastQuarterLkr: z.number().finite().min(0).max(1_000_000_000_000),
      taxableSuppliesToDateLkr: z.number().finite().min(0).max(1_000_000_000_000),
      estimatedTaxableSuppliesNext12MonthsLkr: z.number().finite().min(0).max(1_000_000_000_000),
      operationAddress: z.string().trim().max(240),
      cashBasisRequested: z.boolean(),
      reason: z.string().trim().max(800),
      signatoryName: z.string().trim().max(100),
      signatoryNic: z.string().trim().max(30),
      documents: z.array(z.object({ key: z.string().min(1).max(80), status: z.enum(["MISSING", "READY", "NOT_APPLICABLE"]), note: z.string().trim().max(300) })).max(30),
    }),
  }),
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
    return withSession({ workspace: await getOrCreateWorkspace(session.id), user: session.user }, session);
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
    } else if (input.action === "confirm_vat_registration") {
      const profile = findProfile(workspace, input.profileId);
      workspace = {
        ...workspace,
        profiles: workspace.profiles.map((candidate) => candidate.id === profile.id ? {
          ...candidate,
          vatRegistrationStatus: "ACTIVE",
          vatRegistrationEffectiveDate: input.effectiveDate,
          vatRegistrationCertificateRef: input.certificateReference,
          updatedAt: now,
        } : candidate),
        vatRegistrations: workspace.vatRegistrations.map((application) => application.profileId === profile.id ? { ...application, status: "EXTERNALLY_SUBMITTED", updatedAt: now } : application),
        updatedAt: now,
      };
    } else if (input.action === "save_ramis_api_profile") {
      const profile = findProfile(workspace, input.profileId);
      if (input.integration.status === "APPROVED" && !canOperateVat(profile)) {
        throw new WorkspaceRequestError(
          vatOperationBlocker(profile) ??
            "Confirm the VAT registration before marking RAMIS Web API onboarding approved.",
        );
      }
      const integration = { profileId: profile.id, ...input.integration, updatedAt: now };
      const existing = workspace.ramisApiProfiles.some((item) => item.profileId === profile.id);
      workspace = {
        ...workspace,
        ramisApiProfiles: existing
          ? workspace.ramisApiProfiles.map((item) => item.profileId === profile.id ? integration : item)
          : [...workspace.ramisApiProfiles, integration],
        profiles: workspace.profiles.map((candidate) => candidate.id === profile.id ? { ...candidate, ramisConnection: input.integration.status === "APPROVED" ? "LIVE_APPROVED" : input.integration.status === "NOT_STARTED" ? "NOT_CONNECTED" : "ONBOARDING", updatedAt: now } : candidate),
        updatedAt: now,
      };
    } else if (input.action === "create_vat_transaction") {
      const profile = findProfile(workspace, input.profileId);
      const period = findPeriod(workspace, input.periodId);
      if (!canOperateVat(profile)) {
        throw new WorkspaceRequestError(
          vatOperationBlocker(profile) ?? "Confirm VAT registration before recording VAT transactions.",
        );
      }
      if (period.profileId !== profile.id) throw new WorkspaceRequestError("That period belongs to another business.");
      if (period.status === "APPROVED" || period.status === "SUBMITTED") throw new WorkspaceRequestError("This VAT period is closed.");
      const amounts = resolveTransactionVat({
        kind: input.transaction.kind,
        netAmountLkr: input.transaction.netAmountLkr,
        treatment: input.transaction.treatment,
        statedVatAmountLkr: input.transaction.statedVatAmountLkr ?? null,
      });
      const disallowed = input.transaction.kind === "OUTPUT" ? 0 : Math.min(amounts.vatAmountLkr, input.transaction.disallowedInputVatLkr);
      const transaction = {
        id: createId("VATTX"),
        profileId: profile.id,
        periodId: period.id,
        ...input.transaction,
        ...amounts,
        disallowedInputVatLkr: disallowed,
        scheduleCode: scheduleFor(input.transaction.kind, input.transaction.treatment, input.transaction.supplyType),
        source: "MANUAL" as const,
        createdAt: now,
      };
      workspace = { ...workspace, vatTransactions: [transaction, ...workspace.vatTransactions], updatedAt: now };
    } else if (input.action === "create_vat_invoice") {
      const profile = findProfile(workspace, input.profileId);
      const period = findPeriod(workspace, input.periodId);
      if (!canOperateVat(profile)) {
        throw new WorkspaceRequestError(
          vatOperationBlocker(profile) ?? "Confirm VAT registration before issuing a tax invoice.",
        );
      }
      if (period.profileId !== profile.id) throw new WorkspaceRequestError("That period belongs to another business.");
      if (period.status === "APPROVED" || period.status === "SUBMITTED") throw new WorkspaceRequestError("This VAT period is closed.");
      if (input.invoice.invoiceDate < period.startDate || input.invoice.invoiceDate > period.endDate) throw new WorkspaceRequestError("Invoice date must fall inside the active VAT period.");
      const sequence = workspace.generatedInvoices.filter((item) => item.profileId === profile.id && item.invoiceDate.slice(0, 7) === input.invoice.invoiceDate.slice(0, 7) && item.classificationCode === input.invoice.classificationCode).length + 1;
      const number = invoiceSerial(input.invoice.invoiceDate, input.invoice.classificationCode, sequence);
      const lines = input.invoice.lines.map((line) => calculateInvoiceLine(line, input.invoice.treatment));
      const { netTotalLkr, vatTotalLkr, grossTotalLkr } = totalInvoiceLines(lines, input.invoice.treatment);
      const invoice = { id: createId("VATINV"), profileId: profile.id, periodId: period.id, invoiceNumber: number, ...input.invoice, lines, netTotalLkr, vatTotalLkr, grossTotalLkr, status: "DRAFT" as const, createdAt: now };
      const transaction = { id: createId("VATTX"), profileId: profile.id, periodId: period.id, kind: "OUTPUT" as const, treatment: input.invoice.treatment, supplyType: input.invoice.supplyType, invoiceNumber: number, invoiceDate: input.invoice.invoiceDate, counterpartyName: input.invoice.purchaserName, counterpartyTin: input.invoice.purchaserTin, description: lines.map((line) => line.description).join("; ").slice(0, 240), netAmountLkr: netTotalLkr, vatRate: input.invoice.treatment === "STANDARD_18" ? 18 : 0, vatAmountLkr: vatTotalLkr, grossAmountLkr: grossTotalLkr, disallowedInputVatLkr: 0, scheduleCode: scheduleFor("OUTPUT", input.invoice.treatment, input.invoice.supplyType), source: "GENERATED_INVOICE" as const, createdAt: now };
      workspace = { ...workspace, generatedInvoices: [invoice, ...workspace.generatedInvoices], vatTransactions: [transaction, ...workspace.vatTransactions], updatedAt: now };
    } else if (input.action === "save_vat_registration") {
      const profile = findProfile(workspace, input.profileId);
      const existing = workspace.vatRegistrations.find((item) => item.profileId === profile.id);
      const suppliedDocuments = input.application.documents.map((item) => ({ ...item, label: "", required: true }));
      const application: VatRegistrationApplication = {
        ...createVatRegistrationDraft(profile),
        ...input.application,
        id: existing?.id ?? createId("VATREG"),
        profileId: profile.id,
        documents: buildVatDocumentChecklist(input.application.basis, profile.entityType, suppliedDocuments),
        status: "IN_PROGRESS" as const,
        updatedAt: now,
      };
      const readiness = registrationReadiness(application, profile);
      application.status = readiness.ready ? "READY_FOR_REVIEW" : "IN_PROGRESS";
      workspace = {
        ...workspace,
        vatRegistrations: existing
          ? workspace.vatRegistrations.map((item) => item.id === existing.id ? application : item)
          : [...workspace.vatRegistrations, application],
        updatedAt: now,
      };
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
