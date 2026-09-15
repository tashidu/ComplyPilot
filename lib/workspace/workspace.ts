import { randomUUID } from "node:crypto";
import type { AnalyzeResult, DataMode, FindingSeverity } from "../types";
export { isProfileComplete, canOperateVat, vatOperationBlocker } from "./profile-readiness";

export type FilingFrequency = "MONTHLY" | "QUARTERLY";
export type VatRegistrationStatus = "ACTIVE" | "PENDING" | "NOT_SET";
export type BusinessEntityType = "COMPANY" | "INDIVIDUAL_PROPRIETORSHIP" | "PARTNERSHIP" | "OTHER";
export type IrdPinStatus = "NOT_REQUESTED" | "REQUESTED" | "ACTIVE";
export type RamisConnectionStatus = "SIMULATOR" | "NOT_CONNECTED" | "ONBOARDING" | "LIVE_APPROVED";
export type VatPeriodStatus =
  | "COLLECTING"
  | "NEEDS_REVIEW"
  | "READY_TO_CLOSE"
  | "APPROVED"
  | "SUBMITTED";
export type InboxItemStatus = "PROCESSED" | "MATCHED" | "NEEDS_REVIEW" | "FAILED";
export type InboxDocumentType = "INVOICE" | "VAT_SCHEDULE" | "CREDIT_DEBIT_NOTE" | "SUPPORTING_EVIDENCE";
export type WorkspaceTaskStatus = "OPEN" | "WAITING_EVIDENCE" | "READY_FOR_REVIEW" | "COMPLETED";
export type VatRegistrationBasis = "TURNOVER" | "VOLUNTARY" | "IMPORT_EXPORT" | "SECTION_10C_NEW_BUSINESS" | "TEMPORARY";
export type VatRegistrationApplicationStatus = "NOT_STARTED" | "IN_PROGRESS" | "READY_FOR_REVIEW" | "EXTERNALLY_SUBMITTED";
export type VatRegistrationDocumentStatus = "MISSING" | "READY" | "NOT_APPLICABLE";
export type RamisApiStatus = "NOT_STARTED" | "CONTACT_IRD" | "ONBOARDING" | "APPROVED";
export type VatTransactionKind = "OUTPUT" | "INPUT_LOCAL" | "INPUT_IMPORT";
export type VatTreatment = "STANDARD_18" | "ZERO_RATED" | "EXEMPT" | "OUT_OF_SCOPE";
export type VatSupplyType = "GOODS" | "SERVICES";
export type VatInvoiceStatus = "DRAFT" | "ISSUED" | "VOID";
export type VatScheduleCode = "01" | "02" | "03" | "04" | "05" | "06" | "07";
export type VatScheduleStatus = "NEEDS_REVIEW" | "READY" | "APPROVED" | "IRD_VERIFIED";

export type BusinessProfile = {
  id: string;
  legalName: string;
  displayName: string;
  entityType: BusinessEntityType;
  businessRegistrationNumber: string;
  incorporationDate: string;
  tin: string;
  irdPinStatus: IrdPinStatus;
  vatRegistrationStatus: VatRegistrationStatus;
  vatRegistrationEffectiveDate: string;
  vatRegistrationCertificateRef: string;
  filingFrequency: FilingFrequency;
  industry: string;
  address: string;
  postalCode: string;
  contactPhone: string;
  financeEmail: string;
  accountingSystem: string;
  authorisedReviewer: string;
  ramisConnection: RamisConnectionStatus;
  isSynthetic: boolean;
  activePeriodId: string;
  createdAt: string;
  updatedAt: string;
};

export type VatRegistrationDocument = {
  key: string;
  label: string;
  required: boolean;
  status: VatRegistrationDocumentStatus;
  note: string;
};

export type VatRegistrationApplication = {
  id: string;
  profileId: string;
  status: VatRegistrationApplicationStatus;
  basis: VatRegistrationBasis;
  premisesNo: string;
  unitNo: string;
  taxTypeAddress: string;
  postalCode: string;
  businessActivity: string;
  activityCode: string;
  requestedEffectiveDate: string;
  firstTransactionDate: string;
  estimatedTaxableSupplyDate: string;
  taxableSuppliesLastQuarterLkr: number;
  taxableSuppliesToDateLkr: number;
  estimatedTaxableSuppliesNext12MonthsLkr: number;
  operationAddress: string;
  cashBasisRequested: boolean;
  reason: string;
  signatoryName: string;
  signatoryNic: string;
  documents: VatRegistrationDocument[];
  updatedAt: string;
};

export type RamisApiProfile = {
  profileId: string;
  status: RamisApiStatus;
  integrationReference: string;
  erpSystemName: string;
  technicalContactEmail: string;
  ssid: string;
  credentialsConfigured: boolean;
  baseUrlReceivedFromIrd: boolean;
  scheduleScopes: Array<"SCHEDULE_01" | "SCHEDULE_04" | "SCHEDULE_07">;
  notes: string;
  updatedAt: string;
};

export type VatTransaction = {
  id: string;
  profileId: string;
  periodId: string;
  kind: VatTransactionKind;
  treatment: VatTreatment;
  supplyType: VatSupplyType;
  invoiceNumber: string;
  invoiceDate: string;
  counterpartyName: string;
  counterpartyTin: string;
  description: string;
  netAmountLkr: number;
  vatRate: number;
  vatAmountLkr: number;
  grossAmountLkr: number;
  disallowedInputVatLkr: number;
  scheduleCode: "01" | "02" | "03" | "06" | "07" | "NONE";
  source: "MANUAL" | "GENERATED_INVOICE" | "DOCUMENT_EXTRACTION";
  /**
   * The generated invoice this line came from, when it came from one.
   *
   * Voiding an invoice has to withdraw its output VAT, and matching back on the
   * invoice number alone would be wrong: a purchase can legitimately be entered
   * by hand carrying the same number a supplier used, and deleting that instead
   * would silently drop a real input claim. The id is unambiguous.
   */
  sourceInvoiceId?: string;
  createdAt: string;
};

export type VatScheduleIssue = {
  transactionId: string | null;
  rowNumber: number | null;
  severity: "ERROR" | "WARNING";
  field: string;
  message: string;
};

/**
 * Persisted build/review metadata for a deterministic IRD schedule export.
 * The actual rows remain in vatTransactions, so there is only one source of
 * truth and a rebuild can never copy stale invoice amounts into a second store.
 */
/**
 * The per-row facts a schedule needs that the ledger does not hold.
 *
 * Keyed by transaction and schedule: the same import can appear in the input
 * schedule and, if the goods are later exported, carry a different set of
 * customs facts in the export schedule.
 */
/**
 * One entry in the trail, as stored.
 *
 * The time is an ISO instant rather than the clock face the UI shows, because
 * a trail that only records "09:42" cannot survive a day boundary, an export,
 * or a reviewer in another timezone asking when something actually happened.
 */
export type WorkspaceAuditEvent = {
  id: string;
  at: string;
  actor: "agent" | "human";
  title: string;
  detail: string;
};

export type VatScheduleDetail = {
  transactionId: string;
  code: VatScheduleCode;
  values: Record<string, string>;
  updatedAt: string;
};

export type VatScheduleBatch = {
  id: string;
  profileId: string;
  periodId: string;
  code: VatScheduleCode;
  submissionType: "ORIGINAL" | "AMENDMENT";
  versionNumber: number;
  templateVersion: "1.8";
  periodCode: string;
  fileName: string;
  status: VatScheduleStatus;
  sourceTransactionIds: string[];
  rowCount: number;
  netTotalLkr: number;
  vatTotalLkr: number;
  disallowedVatTotalLkr: number;
  issues: VatScheduleIssue[];
  approvedBy: string | null;
  approvedAt: string | null;
  verifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type VatInvoiceLine = {
  description: string;
  quantity: number;
  unitPriceLkr: number;
  netAmountLkr: number;
  vatRate: number;
  vatAmountLkr: number;
  grossAmountLkr: number;
};

export type GeneratedVatInvoice = {
  id: string;
  profileId: string;
  periodId: string;
  invoiceNumber: string;
  invoiceDate: string;
  supplyDate: string;
  classificationCode: string;
  treatment: "STANDARD_18" | "ZERO_RATED";
  supplyType: VatSupplyType;
  purchaserName: string;
  purchaserTin: string;
  purchaserAddress: string;
  placeOfSupply: string;
  paymentMode: string;
  lines: VatInvoiceLine[];
  netTotalLkr: number;
  vatTotalLkr: number;
  grossTotalLkr: number;
  /**
   * DRAFT is prepared but not yet given to the purchaser; ISSUED has left the
   * business and is the figure the buyer will claim against; VOID has been
   * withdrawn. A tax invoice is never edited after issue - it is voided and
   * replaced - so this status, not an edit history, is the audit trail.
   */
  status: VatInvoiceStatus;
  issuedAt: string | null;
  voidedAt: string | null;
  voidReason: string;
  createdAt: string;
};

export type VatPeriodRecord = {
  id: string;
  profileId: string;
  label: string;
  frequency: FilingFrequency;
  startDate: string;
  endDate: string;
  paymentDueDate: string;
  returnDueDate: string;
  status: VatPeriodStatus;
  runId: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  lastActivityAt: string;
};

export type InvoiceInboxItem = {
  id: string;
  periodId: string;
  runId: string;
  fileName: string;
  reference: string;
  supplierName: string | null;
  documentType: InboxDocumentType;
  status: InboxItemStatus;
  dataMode: DataMode;
  vatAmountLkr: number | null;
  summary: string;
  uploadedAt: string;
};

export type WorkspaceTask = {
  id: string;
  periodId: string;
  findingId: string;
  title: string;
  description: string;
  severity: FindingSeverity;
  status: WorkspaceTaskStatus;
  amountLkrM: number;
  assignedTo: string;
  evidenceNote: string;
  selectedForAction: boolean;
  createdAt: string;
  updatedAt: string;
};

export type SubmissionHistoryItem = {
  id: string;
  periodId: string;
  acknowledgement: string;
  submissionType: "RAMIS_SIMULATOR" | "LIVE_RAMIS";
  status: "ACCEPTED_MOCK" | "ACCEPTED" | "FAILED";
  readinessScore: number;
  submittedBy: string;
  submittedAt: string;
  note: string;
};

export type BusinessWorkspace = {
  version: 1;
  activeProfileId: string;
  profiles: BusinessProfile[];
  periods: VatPeriodRecord[];
  inbox: InvoiceInboxItem[];
  tasks: WorkspaceTask[];
  submissions: SubmissionHistoryItem[];
  vatRegistrations: VatRegistrationApplication[];
  ramisApiProfiles: RamisApiProfile[];
  vatTransactions: VatTransaction[];
  generatedInvoices: GeneratedVatInvoice[];
  vatScheduleBatches: VatScheduleBatch[];
  vatScheduleDetails: VatScheduleDetail[];
  auditEvents: WorkspaceAuditEvent[];
  updatedAt: string;
};

export function createId(prefix: string): string {
  return `${prefix}-${randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase()}`;
}

function iso(value: string): string {
  return new Date(value).toISOString();
}

export function createDefaultWorkspace(): BusinessWorkspace {
  const now = new Date().toISOString();
  const profileId = "BIZ-SERENDIB-DEMO";
  const activePeriodId = "PERIOD-2026-10-DEMO";
  return {
    version: 1,
    activeProfileId: profileId,
    profiles: [
      {
        id: profileId,
        legalName: "Serendib Export Works (Pvt) Ltd",
        displayName: "Serendib Export Works",
        entityType: "COMPANY",
        businessRegistrationNumber: "PV-DEMO-20481",
        incorporationDate: "2019-04-18",
        tin: "134857291",
        irdPinStatus: "ACTIVE",
        vatRegistrationStatus: "ACTIVE",
        vatRegistrationEffectiveDate: "2022-01-01",
        vatRegistrationCertificateRef: "VAT-DEMO-134857291",
        filingFrequency: "MONTHLY",
        industry: "Export manufacturing",
        address: "42 Export Park, Colombo 03, Sri Lanka",
        postalCode: "00300",
        contactPhone: "+94 11 555 0188",
        financeEmail: "finance@serendib.demo",
        accountingSystem: "Spreadsheet + ERP export",
        authorisedReviewer: "N. Perera",
        ramisConnection: "SIMULATOR",
        isSynthetic: true,
        activePeriodId,
        createdAt: now,
        updatedAt: now,
      },
    ],
    periods: [
      {
        id: "PERIOD-2026-08-DEMO",
        profileId,
        label: "August 2026",
        frequency: "MONTHLY",
        startDate: "2026-08-01",
        endDate: "2026-08-31",
        paymentDueDate: "2026-09-20",
        returnDueDate: "2026-09-30",
        status: "SUBMITTED",
        runId: null,
        approvedBy: "N. Perera",
        approvedAt: iso("2026-09-28T09:15:00+05:30"),
        lastActivityAt: iso("2026-09-28T09:17:00+05:30"),
      },
      {
        id: "PERIOD-2026-09-DEMO",
        profileId,
        label: "September 2026",
        frequency: "MONTHLY",
        startDate: "2026-09-01",
        endDate: "2026-09-30",
        paymentDueDate: "2026-10-20",
        returnDueDate: "2026-10-31",
        status: "SUBMITTED",
        runId: null,
        approvedBy: "N. Perera",
        approvedAt: iso("2026-10-27T10:20:00+05:30"),
        lastActivityAt: iso("2026-10-27T10:23:00+05:30"),
      },
      {
        id: activePeriodId,
        profileId,
        label: "October 2026",
        frequency: "MONTHLY",
        startDate: "2026-10-01",
        endDate: "2026-10-31",
        paymentDueDate: "2026-11-20",
        returnDueDate: "2026-11-30",
        status: "COLLECTING",
        runId: null,
        approvedBy: null,
        approvedAt: null,
        lastActivityAt: now,
      },
    ],
    inbox: [
      {
        id: "DOC-DEMO-1030",
        periodId: activePeriodId,
        runId: "DEMO-SEED",
        fileName: "invoice-26OCT_BR03_1030.jpg",
        reference: "26OCT_BR03_1030",
        supplierName: "Ceylon Industrial Supplies",
        documentType: "INVOICE",
        status: "NEEDS_REVIEW",
        dataMode: "SYNTHETIC_DEMO",
        vatAmountLkr: 800_000,
        summary: "October 2026 synthetic invoice; Smart Fix review required.",
        uploadedAt: now,
      },
      {
        id: "DOC-DEMO-1044",
        periodId: activePeriodId,
        runId: "DEMO-SEED",
        fileName: "invoice-26OCT_EXP01_1044.pdf",
        reference: "26OCT_EXP01_1044",
        supplierName: "Oceanic Packaging Lanka",
        documentType: "INVOICE",
        status: "MATCHED",
        dataMode: "SYNTHETIC_DEMO",
        vatAmountLkr: 425_000,
        summary: "Synthetic invoice matched to the purchase ledger.",
        uploadedAt: now,
      },
      {
        id: "DOC-DEMO-SCHEDULE",
        periodId: activePeriodId,
        runId: "DEMO-SEED",
        fileName: "vat-schedule-02-october-2026.csv",
        reference: "Schedule 02",
        supplierName: null,
        documentType: "VAT_SCHEDULE",
        status: "PROCESSED",
        dataMode: "SYNTHETIC_DEMO",
        vatAmountLkr: null,
        summary: "Synthetic Schedule 02 evidence prepared for reconciliation.",
        uploadedAt: now,
      },
    ],
    tasks: [],
    submissions: [
      {
        id: "SUB-DEMO-AUG-2026",
        periodId: "PERIOD-2026-08-DEMO",
        acknowledgement: "CP-DEMO-2026-0829",
        submissionType: "RAMIS_SIMULATOR",
        status: "ACCEPTED_MOCK",
        readinessScore: 91,
        submittedBy: "N. Perera",
        submittedAt: iso("2026-09-28T09:17:00+05:30"),
        note: "Synthetic history item; no live IRD action occurred.",
      },
      {
        id: "SUB-DEMO-SEP-2026",
        periodId: "PERIOD-2026-09-DEMO",
        acknowledgement: "CP-DEMO-2026-0938",
        submissionType: "RAMIS_SIMULATOR",
        status: "ACCEPTED_MOCK",
        readinessScore: 94,
        submittedBy: "N. Perera",
        submittedAt: iso("2026-10-27T10:23:00+05:30"),
        note: "Synthetic history item; no live IRD action occurred.",
      },
    ],
    vatRegistrations: [],
    ramisApiProfiles: [],
    vatTransactions: [
      {
        id: "VATTX-DEMO-OUTPUT-1",
        profileId,
        periodId: activePeriodId,
        kind: "OUTPUT",
        treatment: "STANDARD_18",
        supplyType: "GOODS",
        invoiceNumber: "26OCT_BR03_1030",
        invoiceDate: "2026-10-06",
        counterpartyName: "Lanka Retail Partners",
        counterpartyTin: "100123456",
        description: "Packaging materials",
        netAmountLkr: 2_500_000,
        vatRate: 18,
        vatAmountLkr: 450_000,
        grossAmountLkr: 2_950_000,
        disallowedInputVatLkr: 0,
        scheduleCode: "01",
        source: "MANUAL",
        createdAt: now,
      },
      {
        id: "VATTX-DEMO-INPUT-1",
        profileId,
        periodId: activePeriodId,
        kind: "INPUT_LOCAL",
        treatment: "STANDARD_18",
        supplyType: "GOODS",
        invoiceNumber: "26OCT_SUP08_0042",
        invoiceDate: "2026-10-08",
        counterpartyName: "Ceylon Industrial Supplies",
        counterpartyTin: "100654321",
        description: "Production consumables",
        netAmountLkr: 1_000_000,
        vatRate: 18,
        vatAmountLkr: 180_000,
        grossAmountLkr: 1_180_000,
        disallowedInputVatLkr: 20_000,
        scheduleCode: "02",
        source: "MANUAL",
        createdAt: now,
      },
    ],
    generatedInvoices: [],
    vatScheduleBatches: [],
    vatScheduleDetails: [],
    auditEvents: [],
    updatedAt: now,
  };
}

/** Upgrades JSON workspaces created before profile and VAT-onboarding fields existed. */
export function normaliseWorkspace(input: BusinessWorkspace): BusinessWorkspace {
  return {
    ...input,
    profiles: input.profiles.map((profile) => ({
      ...profile,
      entityType: profile.entityType ?? "COMPANY",
      businessRegistrationNumber: profile.businessRegistrationNumber ?? "",
      incorporationDate: profile.incorporationDate ?? "",
      irdPinStatus: profile.irdPinStatus ?? "NOT_REQUESTED",
      vatRegistrationEffectiveDate: profile.vatRegistrationEffectiveDate ?? "",
      vatRegistrationCertificateRef: profile.vatRegistrationCertificateRef ?? "",
      postalCode: profile.postalCode ?? "",
      contactPhone: profile.contactPhone ?? "",
      accountingSystem: profile.accountingSystem ?? "",
    })),
    vatRegistrations: input.vatRegistrations ?? [],
    ramisApiProfiles: input.ramisApiProfiles ?? [],
    vatTransactions: input.vatTransactions ?? [],
    // Invoices stored before issue/void existed are all still DRAFT, which is
    // what an absent status meant at the time.
    vatScheduleDetails: input.vatScheduleDetails ?? [],
    auditEvents: input.auditEvents ?? [],
    generatedInvoices: (input.generatedInvoices ?? []).map((invoice) => ({
      ...invoice,
      status: invoice.status ?? "DRAFT",
      issuedAt: invoice.issuedAt ?? null,
      voidedAt: invoice.voidedAt ?? null,
      voidReason: invoice.voidReason ?? "",
    })),
    vatScheduleBatches: input.vatScheduleBatches ?? [],
  };
}

export function activeProfile(workspace: BusinessWorkspace): BusinessProfile {
  return workspace.profiles.find((profile) => profile.id === workspace.activeProfileId) ?? workspace.profiles[0];
}

export function activePeriod(workspace: BusinessWorkspace): VatPeriodRecord {
  const profile = activeProfile(workspace);
  return (
    workspace.periods.find((period) => period.id === profile.activePeriodId && period.profileId === profile.id) ??
    workspace.periods.find((period) => period.profileId === profile.id)!
  );
}

function inboxStatus(analysis: AnalyzeResult, documentType: InboxDocumentType): InboxItemStatus {
  if (!analysis.invoice && documentType === "INVOICE") return "FAILED";
  if (documentType === "VAT_SCHEDULE" && analysis.scheduleReconciliation.status === "MATCHED") return "MATCHED";
  if (analysis.findings.some((finding) => finding.status === "open")) return "NEEDS_REVIEW";
  return "PROCESSED";
}

function fieldValue(analysis: AnalyzeResult, key: string): string | number | null {
  const field = analysis.invoice?.[key];
  return field && typeof field === "object" && "value" in field ? field.value : null;
}

export function syncAnalysisToWorkspace(
  workspace: BusinessWorkspace,
  analysis: AnalyzeResult,
  options: {
    periodId?: string;
    fileName?: string;
    documentType?: InboxDocumentType;
  } = {},
): BusinessWorkspace {
  const now = new Date().toISOString();
  const periodId = options.periodId ?? activePeriod(workspace).id;
  const period = workspace.periods.find((candidate) => candidate.id === periodId);
  if (!period) throw new Error("The selected VAT period does not exist.");

  let inbox = workspace.inbox;
  if (options.fileName && options.documentType) {
    const invoiceNumber = fieldValue(analysis, "invoiceNumber");
    const supplierName = fieldValue(analysis, "sellerName");
    const vatAmount = fieldValue(analysis, "vatTotal");
    const existing = inbox.find(
      (item) => item.periodId === periodId && item.fileName === options.fileName && item.runId === analysis.runId,
    );
    const item: InvoiceInboxItem = {
      id: existing?.id ?? createId("DOC"),
      periodId,
      runId: analysis.runId,
      fileName: options.fileName,
      reference: String(invoiceNumber ?? options.fileName),
      supplierName: supplierName === null ? null : String(supplierName),
      documentType: options.documentType,
      status: inboxStatus(analysis, options.documentType),
      dataMode: analysis.dataMode,
      vatAmountLkr: typeof vatAmount === "number" ? vatAmount : vatAmount ? Number(vatAmount) || null : null,
      summary:
        options.documentType === "VAT_SCHEDULE"
          ? `Schedule reconciliation status: ${analysis.scheduleReconciliation.status}.`
          : analysis.invoice
            ? `${analysis.findings.filter((finding) => finding.status === "open").length} open review task(s) after extraction.`
            : "The document could not be extracted; human review is required.",
      uploadedAt: existing?.uploadedAt ?? now,
    };
    inbox = existing
      ? inbox.map((candidate) => (candidate.id === existing.id ? item : candidate))
      : [item, ...inbox];
  }

  const findingIds = new Set(analysis.findings.filter((finding) => finding.status !== "inactive").map((finding) => finding.id));
  const existingPeriodTasks = workspace.tasks.filter((task) => task.periodId === periodId);
  const untouchedTasks = workspace.tasks.filter((task) => task.periodId !== periodId);
  const tasks = analysis.findings
    .filter((finding) => finding.status !== "inactive")
    .map<WorkspaceTask>((finding) => {
      const existing = existingPeriodTasks.find((task) => task.findingId === finding.id);
      return {
        id: existing?.id ?? createId("TASK"),
        periodId,
        findingId: finding.id,
        title: finding.title,
        description: finding.graph.at(-1)?.detail ?? finding.description,
        severity: finding.severity,
        status:
          finding.status === "resolved"
            ? "COMPLETED"
            : existing?.status === "WAITING_EVIDENCE" || existing?.status === "READY_FOR_REVIEW"
              ? existing.status
              : "OPEN",
        amountLkrM: finding.amountLkrM,
        assignedTo: existing?.assignedTo ?? "",
        evidenceNote: existing?.evidenceNote ?? "",
        selectedForAction: existing?.selectedForAction ?? false,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
    });

  for (const existing of existingPeriodTasks) {
    if (!findingIds.has(existing.findingId)) {
      tasks.push({ ...existing, status: "COMPLETED", selectedForAction: false, updatedAt: now });
    }
  }

  const hasOpenTasks = tasks.some((task) => task.status !== "COMPLETED");
  const hasDocuments = inbox.some((item) => item.periodId === periodId);
  const nextStatus: VatPeriodStatus =
    period.status === "SUBMITTED" || period.status === "APPROVED"
      ? period.status
      : hasOpenTasks
        ? "NEEDS_REVIEW"
        : hasDocuments
          ? "READY_TO_CLOSE"
          : "COLLECTING";

  return {
    ...workspace,
    periods: workspace.periods.map((candidate) =>
      candidate.id === periodId
        ? { ...candidate, runId: analysis.runId, status: nextStatus, lastActivityAt: now }
        : candidate,
    ),
    inbox,
    tasks: [...untouchedTasks, ...tasks],
    updatedAt: now,
  };
}

export function periodMetrics(workspace: BusinessWorkspace, periodId: string) {
  const inbox = workspace.inbox.filter((item) => item.periodId === periodId);
  const tasks = workspace.tasks.filter((task) => task.periodId === periodId);
  return {
    documentCount: inbox.length,
    matchedCount: inbox.filter((item) => item.status === "MATCHED").length,
    openTaskCount: tasks.filter((task) => task.status !== "COMPLETED").length,
    completedTaskCount: tasks.filter((task) => task.status === "COMPLETED").length,
    vatUnderReviewLkr: tasks
      .filter((task) => task.status !== "COMPLETED")
      .reduce((sum, task) => sum + task.amountLkrM * 1_000_000, 0),
  };
}
