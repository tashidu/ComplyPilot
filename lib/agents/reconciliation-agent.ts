import type { InvoiceExtraction } from "../ai/extraction-schema";
import { cosineSimilarity, embedCandidateTexts } from "../ai/embedding-client";
import { FIXTURE_FINDINGS } from "../fixtures/demo-case";
import type {
  Finding,
  ReconciliationFeatureScore,
  ReconciliationVariance,
  ScheduleReconciliation,
  VatScheduleEvidence,
  VatScheduleRow,
} from "../types";

export type ReconciliationResult = {
  findings: Finding[];
  schedule: ScheduleReconciliation;
};

type InvoiceField =
  | "invoiceNumber"
  | "sellerVatNumber"
  | "sellerName"
  | "invoiceDate"
  | "netTotal"
  | "vatTotal"
  | "grossTotal";

type CandidateScore = {
  row: VatScheduleRow;
  score: number;
  features: ReconciliationFeatureScore[];
  mode: ScheduleReconciliation["matchMode"];
};

const WEIGHTS = {
  supplierTin: 40,
  invoiceNumber: 25,
  amounts: 15,
  invoiceDate: 10,
  supplierName: 10,
} as const;

function fieldValue(extraction: InvoiceExtraction, field: InvoiceField): string | number | null {
  return extraction[field].value;
}

function normaliseInvoiceNumber(value: string | number | null): string | null {
  if (value === null) return null;
  const normalised = String(value).trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  return normalised || null;
}

function normaliseTin(value: string | number | null): string | null {
  if (value === null) return null;
  return String(value).replace(/\D/g, "") || null;
}

function normaliseName(value: string | number | null): string | null {
  if (value === null) return null;
  const ignored = new Set(["pvt", "private", "ltd", "limited", "plc", "company", "co"]);
  const words = String(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word && !ignored.has(word));
  return words.join(" ") || null;
}

function numberValue(value: string | number | null): number | null {
  if (value === null) return null;
  const parsed = typeof value === "number" ? value : Number(value.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function diceSimilarity(leftValue: string | null, rightValue: string | null): number {
  if (!leftValue || !rightValue) return 0;
  if (leftValue === rightValue) return 1;
  if (leftValue.length < 2 || rightValue.length < 2) return 0;
  const leftPairs = new Map<string, number>();
  for (let index = 0; index < leftValue.length - 1; index += 1) {
    const pair = leftValue.slice(index, index + 2);
    leftPairs.set(pair, (leftPairs.get(pair) ?? 0) + 1);
  }
  let overlap = 0;
  for (let index = 0; index < rightValue.length - 1; index += 1) {
    const pair = rightValue.slice(index, index + 2);
    const count = leftPairs.get(pair) ?? 0;
    if (count > 0) {
      overlap += 1;
      leftPairs.set(pair, count - 1);
    }
  }
  return (2 * overlap) / (leftValue.length + rightValue.length - 2);
}

function parseDate(value: string | number | null): Date | null {
  if (value === null) return null;
  const text = String(value).trim();
  const match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[3]), Number(match[1]) - 1, Number(match[2])));
  return Number.isNaN(date.valueOf()) ? null : date;
}

function dateSimilarity(left: string | number | null, right: string | null): number {
  const leftDate = parseDate(left);
  const rightDate = parseDate(right);
  if (!leftDate || !rightDate) return 0;
  const days = Math.abs(leftDate.valueOf() - rightDate.valueOf()) / 86_400_000;
  if (days === 0) return 1;
  if (days <= 7) return 0.7;
  if (days <= 31) return 0.3;
  return 0;
}

function amountSimilarity(left: number | null, right: number | null): number | null {
  if (left === null || right === null) return null;
  const difference = Math.abs(left - right);
  if (difference <= 0.02) return 1;
  const proportion = difference / Math.max(Math.abs(left), Math.abs(right), 1);
  return Math.max(0, 1 - proportion * 5);
}

function amountGroupSimilarity(extraction: InvoiceExtraction, row: VatScheduleRow): number | null {
  const scores = [
    amountSimilarity(numberValue(fieldValue(extraction, "netTotal")), row.netAmount),
    amountSimilarity(numberValue(fieldValue(extraction, "vatTotal")), row.vatAmount),
    amountSimilarity(numberValue(fieldValue(extraction, "grossTotal")), row.grossAmount),
  ].filter((score): score is number => score !== null);
  if (scores.length === 0) return null;
  return scores.reduce((total, score) => total + score, 0) / scores.length;
}

function makeFeature(
  key: ReconciliationFeatureScore["key"],
  label: string,
  weight: number,
  similarity: number | null,
  detail: string,
  source: ReconciliationFeatureScore["source"] = "deterministic",
): ReconciliationFeatureScore | null {
  if (similarity === null) return null;
  return {
    key,
    label,
    earned: Number((weight * Math.max(0, Math.min(1, similarity))).toFixed(1)),
    available: weight,
    detail,
    source,
  };
}

function scoreCandidate(
  extraction: InvoiceExtraction,
  row: VatScheduleRow,
  nameSimilarity: number | null,
  nameSource: ReconciliationFeatureScore["source"],
  mode: ScheduleReconciliation["matchMode"],
): CandidateScore {
  const invoiceNumber = normaliseInvoiceNumber(fieldValue(extraction, "invoiceNumber"));
  const rowInvoiceNumber = normaliseInvoiceNumber(row.invoiceNumber);
  const invoiceTin = normaliseTin(fieldValue(extraction, "sellerVatNumber"));
  const rowTin = normaliseTin(row.supplierTin);
  const dateScore =
    parseDate(fieldValue(extraction, "invoiceDate")) && parseDate(row.invoiceDate)
      ? dateSimilarity(fieldValue(extraction, "invoiceDate"), row.invoiceDate)
      : null;
  const amountScore = amountGroupSimilarity(extraction, row);

  const features = [
    makeFeature(
      "supplierTin",
      "Supplier TIN",
      WEIGHTS.supplierTin,
      invoiceTin && rowTin ? (invoiceTin === rowTin ? 1 : 0) : null,
      invoiceTin && rowTin ? (invoiceTin === rowTin ? "Exact TIN match" : "TIN conflict") : "TIN unavailable",
    ),
    makeFeature(
      "invoiceNumber",
      "Invoice number",
      WEIGHTS.invoiceNumber,
      invoiceNumber && rowInvoiceNumber ? diceSimilarity(invoiceNumber, rowInvoiceNumber) : null,
      invoiceNumber === rowInvoiceNumber ? "Normalised serial matches" : "Serial similarity scored",
    ),
    makeFeature(
      "amounts",
      "Invoice values",
      WEIGHTS.amounts,
      amountScore,
      amountScore === 1 ? "Available amounts agree" : "Available amounts differ",
    ),
    makeFeature(
      "invoiceDate",
      "Invoice date",
      WEIGHTS.invoiceDate,
      dateScore,
      dateScore === 1 ? "Exact invoice date" : "Date proximity scored",
    ),
    makeFeature(
      "supplierName",
      "Supplier name",
      WEIGHTS.supplierName,
      nameSimilarity,
      nameSource === "qwen-embedding" ? "Qwen semantic similarity" : "Local normalised-name similarity",
      nameSource,
    ),
  ].filter((feature): feature is ReconciliationFeatureScore => feature !== null);

  const earned = features.reduce((total, feature) => total + feature.earned, 0);
  const available = features.reduce((total, feature) => total + feature.available, 0);
  let score = available > 0 ? Math.round((earned / available) * 100) : 0;

  // A known TIN conflict is a material identity conflict and must never be
  // hidden by a similar name or amount.
  if (invoiceTin && rowTin && invoiceTin !== rowTin) score = Math.min(score, 59);

  return { row, score, features, mode };
}

async function findBestCandidate(
  extraction: InvoiceExtraction,
  schedule: VatScheduleEvidence,
): Promise<CandidateScore | null> {
  if (schedule.rows.length === 0) return null;
  const invoiceName = normaliseName(fieldValue(extraction, "sellerName"));

  const localCandidates = schedule.rows.map((row) =>
    scoreCandidate(
      extraction,
      row,
      invoiceName && row.supplierName
        ? diceSimilarity(invoiceName, normaliseName(row.supplierName))
        : null,
      "deterministic",
      "LOCAL_SIMILARITY",
    ),
  );
  localCandidates.sort((left, right) => right.score - left.score);

  const shortlist = localCandidates
    .slice(0, 10)
    .filter((candidate) => invoiceName && candidate.row.supplierName);
  if (!invoiceName || shortlist.length === 0) return localCandidates[0] ?? null;

  const embedding = await embedCandidateTexts([
    invoiceName,
    ...shortlist.map((candidate) => normaliseName(candidate.row.supplierName) ?? candidate.row.supplierName ?? ""),
  ]);
  if (!embedding) return localCandidates[0] ?? null;

  const qwenCandidates = shortlist.map((candidate, index) =>
    scoreCandidate(
      extraction,
      candidate.row,
      cosineSimilarity(embedding.vectors[0], embedding.vectors[index + 1]),
      "qwen-embedding",
      "LIVE_QWEN_EMBEDDING",
    ),
  );
  qwenCandidates.sort((left, right) => right.score - left.score);
  return qwenCandidates[0] ?? localCandidates[0] ?? null;
}

function scheduleTotals(schedule: VatScheduleEvidence) {
  const sum = (field: "netAmount" | "vatAmount" | "grossAmount") => {
    const values = schedule.rows
      .map((row) => row[field])
      .filter((value): value is number => value !== null);
    return values.length > 0 ? values.reduce((total, value) => total + value, 0) : null;
  };
  return { netAmount: sum("netAmount"), vatAmount: sum("vatAmount"), grossAmount: sum("grossAmount") };
}

function compareAmount(
  variances: ReconciliationVariance[],
  matchedFields: string[],
  field: "netAmount" | "vatAmount" | "grossAmount",
  label: string,
  invoiceValue: number | null,
  scheduleValue: number | null,
) {
  if (invoiceValue === null || scheduleValue === null) return;
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

  const title = matched
    ? `Invoice matched to VAT Schedule row at ${summary.matchScore}% confidence`
    : needsInvoice
      ? "VAT Schedule uploaded; invoice extraction required"
      : summary.status === "UNMATCHED"
        ? "No credible invoice-to-schedule match was found"
        : summary.status === "NEEDS_REVIEW"
          ? `A ${summary.matchScore}% candidate match needs human confirmation`
          : `${summary.variances.length} invoice-to-schedule mismatch${summary.variances.length === 1 ? "" : "es"}`;

  return {
    id: "schedule",
    badge: "V",
    title,
    description: matched
      ? `${summary.matchedFields.join(", ")} agree; the feature-level score is visible for review.`
      : needsInvoice
        ? "Upload an invoice image so the agent can rank schedule candidates and compare the evidence."
        : firstIssues.length > 0
          ? `${firstIssues.join("; ")}.`
          : "The best candidate did not meet the product's explainable matching threshold.",
    tag: summary.matchMode === "LIVE_QWEN_EMBEDDING" ? "Qwen semantic match" : "Explainable match",
    severity: matched ? "low" : "high",
    meta: [
      `File: ${schedule.fileName}`,
      `${schedule.rows.length} candidate row${schedule.rows.length === 1 ? "" : "s"}`,
      summary.matchScore === null ? "Match score not available" : `Match score: ${summary.matchScore}/100`,
    ],
    scoreGain: 3,
    amountLkrM: Number((vatUnderReview / 1_000_000).toFixed(4)),
    confidence: summary.matchScore ?? 0,
    ruleId: "RECON-AI-001",
    graphTitle: "AI invoice-to-schedule evidence chain",
    graph: [
      { title: "Invoice extraction", detail: needsInvoice ? "Waiting for invoice image" : "Schema-validated fields" },
      { title: schedule.fileName, detail: `${schedule.rows.length} candidate rows parsed deterministically` },
      {
        title: summary.matchMode === "LIVE_QWEN_EMBEDDING" ? "Qwen semantic matcher" : "Local explainable matcher",
        detail: summary.matchScore === null ? "Not run" : `${summary.matchScore}/100 across available features`,
        status: matched ? undefined : "warning",
      },
      {
        title: "Evidence comparison",
        detail: matched ? `${summary.matchedFields.length} fields agree` : `${summary.variances.length} checks need review`,
        status: matched ? undefined : "warning",
      },
      {
        title: "Human gate",
        detail: matched ? "Evidence can continue to package review" : "Confirm, correct, or explain before approval",
        status: matched ? undefined : "action",
      },
    ],
    status: matched ? "resolved" : "open",
  };
}

async function reconcileSchedule(
  extraction: InvoiceExtraction | null,
  schedule: VatScheduleEvidence | null,
): Promise<{ summary: ScheduleReconciliation; finding: Finding | null }> {
  const emptyMatch = {
    candidateCount: schedule?.rows.length ?? 0,
    matchScore: null,
    matchMode: "NOT_RUN" as const,
    matchFeatures: [] as ReconciliationFeatureScore[],
  };
  if (!schedule) {
    return {
      summary: {
        ...emptyMatch,
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
    candidateCount: schedule.rows.length,
    warnings: schedule.warnings,
    totals: scheduleTotals(schedule),
  };
  const invoiceNumber = extraction
    ? normaliseInvoiceNumber(fieldValue(extraction, "invoiceNumber"))
    : null;
  if (!extraction || !invoiceNumber) {
    const summary: ScheduleReconciliation = {
      ...base,
      matchScore: null,
      matchMode: "NOT_RUN",
      matchFeatures: [],
      status: "NEEDS_INVOICE",
      matchedRowNumber: null,
      matchedFields: [],
      variances: [],
    };
    return { summary, finding: findingForSchedule(schedule, summary, null) };
  }

  const candidate = await findBestCandidate(extraction, schedule);
  if (!candidate || candidate.score < 60) {
    const summary: ScheduleReconciliation = {
      ...base,
      matchScore: candidate?.score ?? 0,
      matchMode: candidate?.mode ?? "LOCAL_SIMILARITY",
      matchFeatures: candidate?.features ?? [],
      status: "UNMATCHED",
      matchedRowNumber: null,
      matchedFields: [],
      variances: [
        {
          field: "invoiceNumber",
          label: "No candidate met the 60-point review threshold",
          invoiceValue: fieldValue(extraction, "invoiceNumber"),
          scheduleValue: candidate?.row.invoiceNumber ?? null,
          difference: null,
        },
      ],
    };
    return { summary, finding: findingForSchedule(schedule, summary, candidate?.row ?? null) };
  }

  const row = candidate.row;
  const variances: ReconciliationVariance[] = [];
  const matchedFields: string[] = [];
  const rowInvoice = normaliseInvoiceNumber(row.invoiceNumber);
  if (rowInvoice === invoiceNumber) matchedFields.push("Invoice number");
  else {
    variances.push({
      field: "invoiceNumber",
      label: "Invoice number needs confirmation",
      invoiceValue: fieldValue(extraction, "invoiceNumber"),
      scheduleValue: row.invoiceNumber,
      difference: null,
    });
  }

  const invoiceTin = normaliseTin(fieldValue(extraction, "sellerVatNumber"));
  const rowTin = normaliseTin(row.supplierTin);
  if (invoiceTin && rowTin && invoiceTin !== rowTin) {
    variances.push({
      field: "supplierTin",
      label: "Supplier TIN differs",
      invoiceValue: invoiceTin,
      scheduleValue: rowTin,
      difference: null,
    });
  } else if (invoiceTin && rowTin) matchedFields.push("Supplier TIN");

  const nameFeature = candidate.features.find((feature) => feature.key === "supplierName");
  if (nameFeature) {
    if (nameFeature.earned / nameFeature.available >= 0.75) matchedFields.push("Supplier name");
    else {
      variances.push({
        field: "supplierName",
        label: "Supplier name needs confirmation",
        invoiceValue: fieldValue(extraction, "sellerName"),
        scheduleValue: row.supplierName,
        difference: null,
      });
    }
  }

  const invoiceDate = fieldValue(extraction, "invoiceDate");
  const dateScore = row.invoiceDate ? dateSimilarity(invoiceDate, row.invoiceDate) : null;
  if (dateScore !== null) {
    if (dateScore >= 0.7) matchedFields.push("Invoice date");
    else {
      variances.push({
        field: "invoiceDate",
        label: "Invoice date differs materially",
        invoiceValue: invoiceDate,
        scheduleValue: row.invoiceDate,
        difference: null,
      });
    }
  }

  compareAmount(variances, matchedFields, "netAmount", "Net amount", numberValue(fieldValue(extraction, "netTotal")), row.netAmount);
  compareAmount(variances, matchedFields, "vatAmount", "VAT amount", numberValue(fieldValue(extraction, "vatTotal")), row.vatAmount);
  compareAmount(variances, matchedFields, "grossAmount", "Gross amount", numberValue(fieldValue(extraction, "grossTotal")), row.grossAmount);

  const hardMismatch = variances.some((variance) =>
    ["supplierTin", "netAmount", "vatAmount", "grossAmount"].includes(variance.field),
  );
  const status: ScheduleReconciliation["status"] =
    variances.length === 0 && candidate.score >= 85
      ? "MATCHED"
      : hardMismatch
        ? "MISMATCH"
        : "NEEDS_REVIEW";
  const summary: ScheduleReconciliation = {
    ...base,
    status,
    matchedRowNumber: row.rowNumber,
    matchScore: candidate.score,
    matchMode: candidate.mode,
    matchFeatures: candidate.features,
    matchedFields,
    variances,
  };
  return { summary, finding: findingForSchedule(schedule, summary, row) };
}

export async function analyzeReconciliation(
  extraction: InvoiceExtraction | null,
  schedule: VatScheduleEvidence | null,
  includeSyntheticContext: boolean,
): Promise<ReconciliationResult> {
  const findings: Finding[] = [];
  if (includeSyntheticContext) {
    const supplierFinding = FIXTURE_FINDINGS.find((finding) => finding.id === "supplier");
    const customsFinding = FIXTURE_FINDINGS.find((finding) => finding.id === "customs");
    if (supplierFinding) findings.push(supplierFinding);
    if (customsFinding) findings.push(customsFinding);
  }

  const { summary, finding } = await reconcileSchedule(extraction, schedule);
  if (finding) findings.push(finding);
  return { findings, schedule: summary };
}
