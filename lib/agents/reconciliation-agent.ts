import type { InvoiceExtraction } from "../ai/extraction-schema";
import { FIXTURE_FINDINGS } from "../fixtures/demo-case";
import type {
  Finding,
  ReconciliationVariance,
  ScheduleReconciliation,
  VatScheduleEvidence,
  VatScheduleRow,
} from "../types";

export type ReconciliationResult = {
  findings: Finding[];
  schedule: ScheduleReconciliation;
};

function fieldValue(
  extraction: InvoiceExtraction,
  field: "invoiceNumber" | "sellerVatNumber" | "netTotal" | "vatTotal" | "grossTotal",
): string | number | null {
  return extraction[field].value;
}

function normaliseInvoiceNumber(value: string | number | null): string | null {
  if (value === null) return null;
  const normalised = String(value).trim().toUpperCase().replace(/\s/g, "");
  return normalised || null;
}

function normaliseTin(value: string | number | null): string | null {
  if (value === null) return null;
  return String(value).replace(/\D/g, "") || null;
}

function numberValue(value: string | number | null): number | null {
  if (value === null) return null;
  const parsed = typeof value === "number" ? value : Number(value.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function scheduleTotals(schedule: VatScheduleEvidence) {
  const sum = (field: "netAmount" | "vatAmount" | "grossAmount") => {
    const values = schedule.rows
      .map((row) => row[field])
      .filter((value): value is number => value !== null);
    return values.length > 0 ? values.reduce((total, value) => total + value, 0) : null;
  };
  return {
    netAmount: sum("netAmount"),
    vatAmount: sum("vatAmount"),
    grossAmount: sum("grossAmount"),
  };
}

function compareAmount(
  variances: ReconciliationVariance[],
  matchedFields: string[],
  field: "netAmount" | "vatAmount" | "grossAmount",
  label: string,
  invoiceValue: number | null,
  scheduleValue: number | null,
) {
  if (invoiceValue === null || scheduleValue === null) {
    variances.push({
      field,
      label: `${label} could not be compared`,
      invoiceValue,
      scheduleValue,
      difference: null,
    });
    return;
  }
  const difference = Number((scheduleValue - invoiceValue).toFixed(2));
  if (Math.abs(difference) > 0.02) {
    variances.push({ field, label: `${label} differs`, invoiceValue, scheduleValue, difference });
  } else {
    matchedFields.push(label);
  }
}

function findingForSchedule(
  schedule: VatScheduleEvidence,
  summary: ScheduleReconciliation,
  row: VatScheduleRow | null,
): Finding {
  const matched = summary.status === "MATCHED";
  const needsInvoice = summary.status === "NEEDS_INVOICE";
  const firstIssues = summary.variances.slice(0, 3).map((variance) => variance.label);
  const vatUnderReview = row?.vatAmount ?? 0;

  return {
    id: "schedule",
    badge: "V",
    title: matched
      ? "Invoice matches the uploaded VAT Schedule row"
      : needsInvoice
        ? "VAT Schedule uploaded; invoice extraction required"
        : `${summary.variances.length} invoice-to-schedule mismatch${summary.variances.length === 1 ? "" : "es"}`,
    description: matched
      ? `${summary.matchedFields.join(", ")} agree within the LKR 0.02 tolerance.`
      : needsInvoice
        ? "Upload an invoice image so the agent can find its schedule row and compare the evidence."
        : `${firstIssues.join("; ")}${summary.variances.length > firstIssues.length ? "; additional differences require review" : ""}.`,
    tag: matched ? "Reconciled" : "Schedule reconciliation",
    severity: matched ? "low" : "high",
    meta: [
      `File: ${schedule.fileName}`,
      `${schedule.rows.length} parsed row${schedule.rows.length === 1 ? "" : "s"}`,
      row ? `Matched row: ${row.rowNumber}` : "No schedule row matched",
    ],
    scoreGain: 3,
    amountLkrM: Number((vatUnderReview / 1_000_000).toFixed(4)),
    confidence: matched ? 100 : 96,
    ruleId: "RECON-CSV-001",
    graphTitle: "Invoice-to-schedule evidence chain",
    graph: [
      {
        title: "Invoice extraction",
        detail: needsInvoice ? "Waiting for invoice image" : "Qwen schema-validated fields",
      },
      {
        title: schedule.fileName,
        detail: `${schedule.rows.length} CSV rows parsed deterministically`,
      },
      {
        title: "Row matcher",
        detail: row ? `Invoice found on row ${row.rowNumber}` : "No exact invoice-number match",
        status: row ? undefined : "warning",
      },
      {
        title: "Value comparison",
        detail: matched
          ? `${summary.matchedFields.length} fields agree`
          : `${summary.variances.length} checks need review`,
        status: matched ? undefined : "warning",
      },
      {
        title: "Human gate",
        detail: matched ? "Evidence can continue to package review" : "Correct or explain before filing",
        status: matched ? undefined : "action",
      },
    ],
    status: matched ? "resolved" : "open",
  };
}

function reconcileSchedule(
  extraction: InvoiceExtraction | null,
  schedule: VatScheduleEvidence | null,
): { summary: ScheduleReconciliation; finding: Finding | null } {
  if (!schedule) {
    return {
      summary: {
        status: "NOT_UPLOADED",
        fileName: null,
        rowCount: 0,
        matchedRowNumber: null,
        matchedFields: [],
        variances: [],
        warnings: [],
        totals: null,
      },
      finding: null,
    };
  }

  const base = {
    fileName: schedule.fileName,
    rowCount: schedule.rows.length,
    warnings: schedule.warnings,
    totals: scheduleTotals(schedule),
  };
  const invoiceNumber = extraction
    ? normaliseInvoiceNumber(fieldValue(extraction, "invoiceNumber"))
    : null;
  if (!extraction || !invoiceNumber) {
    const summary: ScheduleReconciliation = {
      ...base,
      status: "NEEDS_INVOICE",
      matchedRowNumber: null,
      matchedFields: [],
      variances: [],
    };
    return { summary, finding: findingForSchedule(schedule, summary, null) };
  }

  const row =
    schedule.rows.find(
      (candidate) => normaliseInvoiceNumber(candidate.invoiceNumber) === invoiceNumber,
    ) ?? null;
  const variances: ReconciliationVariance[] = [];
  const matchedFields: string[] = [];

  if (!row) {
    variances.push({
      field: "invoiceNumber",
      label: "Invoice number has no schedule row",
      invoiceValue: fieldValue(extraction, "invoiceNumber"),
      scheduleValue: null,
      difference: null,
    });
  } else {
    matchedFields.push("Invoice number");
    const invoiceTin = normaliseTin(fieldValue(extraction, "sellerVatNumber"));
    if (row.supplierTin && invoiceTin !== row.supplierTin) {
      variances.push({
        field: "supplierTin",
        label: "Supplier TIN differs",
        invoiceValue: invoiceTin,
        scheduleValue: row.supplierTin,
        difference: null,
      });
    } else if (row.supplierTin && invoiceTin === row.supplierTin) {
      matchedFields.push("Supplier TIN");
    }
    compareAmount(
      variances,
      matchedFields,
      "netAmount",
      "Net amount",
      numberValue(fieldValue(extraction, "netTotal")),
      row.netAmount,
    );
    compareAmount(
      variances,
      matchedFields,
      "vatAmount",
      "VAT amount",
      numberValue(fieldValue(extraction, "vatTotal")),
      row.vatAmount,
    );
    compareAmount(
      variances,
      matchedFields,
      "grossAmount",
      "Gross amount",
      numberValue(fieldValue(extraction, "grossTotal")),
      row.grossAmount,
    );
  }

  const summary: ScheduleReconciliation = {
    ...base,
    status: variances.length === 0 ? "MATCHED" : "MISMATCH",
    matchedRowNumber: row?.rowNumber ?? null,
    matchedFields,
    variances,
  };
  return { summary, finding: findingForSchedule(schedule, summary, row) };
}

export function analyzeReconciliation(
  extraction: InvoiceExtraction | null,
  schedule: VatScheduleEvidence | null,
): ReconciliationResult {
  const findings: Finding[] = [];
  const supplierFinding = FIXTURE_FINDINGS.find((finding) => finding.id === "supplier");
  const customsFinding = FIXTURE_FINDINGS.find((finding) => finding.id === "customs");
  if (supplierFinding) findings.push(supplierFinding);
  if (customsFinding) findings.push(customsFinding);

  const { summary, finding } = reconcileSchedule(extraction, schedule);
  if (finding) findings.push(finding);
  return { findings, schedule: summary };
}
