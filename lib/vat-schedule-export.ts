import { calculateVat, summariseVatPeriod } from "./vat-operations";
import type { BusinessProfile, VatPeriodRecord, VatScheduleCode, VatScheduleIssue, VatTransaction } from "./workspace/workspace";

export type ScheduleCode = Exclude<VatTransaction["scheduleCode"], "NONE">;

export type ScheduleDefinition = {
  code: ScheduleCode;
  name: string;
  /** Whose TIN and name the rows carry. Sales name the buyer, purchases the seller. */
  counterparty: "SUPPLIER" | "PURCHASER";
  channel: string;
};

export const SCHEDULE_DEFINITIONS: ScheduleDefinition[] = [
  { code: "01", name: "Output schedule", counterparty: "PURCHASER", channel: "Web API / CSV / e-Services" },
  { code: "02", name: "Local input schedule", counterparty: "SUPPLIER", channel: "RAMIS match / CSV / e-Services" },
  { code: "03", name: "Import input schedule", counterparty: "SUPPLIER", channel: "CSV / e-Services" },
  { code: "06", name: "Goods exports", counterparty: "PURCHASER", channel: "CSV / e-Services" },
  { code: "07", name: "Service exports", counterparty: "PURCHASER", channel: "Web API / CSV / e-Services" },
];

/**
 * Escapes one CSV field.
 *
 * Two unrelated problems meet here. Commas, quotes and newlines are quoted so
 * the row keeps its shape — these files are read back by our own schedule
 * parser, and a supplier name containing a comma would otherwise shift every
 * later column.
 *
 * A leading `=`, `+`, `-` or `@` is separately neutralised with a leading
 * apostrophe. Spreadsheets read such a value as a formula, so a counterparty
 * name captured as `=HYPERLINK(...)` becomes live code in whichever machine
 * opens the schedule — including the officer's. The text stays readable; only
 * its interpretation as a formula is removed.
 */
function csvField(value: string | number): string {
  if (typeof value === "number") return value.toFixed(2);
  const guarded = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\n\r]/.test(guarded) ? `"${guarded.replaceAll('"', '""')}"` : guarded;
}

function csvRows(rows: (string | number)[][]): string {
  // CRLF: the line ending every spreadsheet and RFC 4180 agree on.
  return rows.map((row) => row.map(csvField).join(",")).join("\r\n");
}

export const OFFICIAL_SCHEDULE_HEADERS: Record<VatScheduleCode, string[]> = {
  "01": ["Serial No", "Invoice Date", "Tax Invoice No", "Purchaser's TIN", "Name of the Purchaser", "Description", "Value of supply", "VAT Amount"],
  "02": ["Serial No", "Invoice Date", "Tax Invoice No", "Supplier's TIN", "Name of the Supplier", "Description", "Value of purchase", "VAT Amount", "Disallowed VAT Amount"],
};

/** Converts our ISO date to the date shape used by the IRD workbook. */
export function toIrdDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${match[2]}/${match[3]}/${match[1]}` : value;
}

/** IRD period code: YYQ0 for a quarter, YYQM for a month within that quarter. */
export function vatPeriodCode(period: VatPeriodRecord): string {
  const match = /^(\d{4})-(\d{2})-\d{2}$/.exec(period.startDate);
  if (!match) throw new Error("The VAT period needs a valid start date.");
  const year = match[1].slice(-2);
  const month = Number(match[2]);
  const quarter = Math.ceil(month / 3);
  const monthInQuarter = ((month - 1) % 3) + 1;
  return `${year}${quarter}${period.frequency === "QUARTERLY" ? 0 : monthInQuarter}`;
}

export function officialScheduleFileName(
  profile: BusinessProfile,
  period: VatPeriodRecord,
  code: VatScheduleCode,
  submissionDate = new Date().toISOString().slice(0, 10),
  submissionType: "ORIGINAL" | "AMENDMENT" = "ORIGINAL",
  versionNumber = 1,
): string {
  const date = submissionDate.replaceAll("-", "");
  return `${profile.tin}_VAT_SCHEDULE${code}_${vatPeriodCode(period)}_${date}_${submissionType}_V${versionNumber}.csv`;
}

/** Exact Schedule 01/02 columns from the IRD v1.8 workbooks. */
export function buildOfficialScheduleCsv(transactions: VatTransaction[], code: VatScheduleCode): string {
  const rows = transactionsForSchedule(transactions, code).map((item, index) => [
    String(index + 1),
    toIrdDate(item.invoiceDate),
    item.invoiceNumber,
    item.counterpartyTin,
    item.counterpartyName,
    item.description,
    item.netAmountLkr,
    item.vatAmountLkr,
    ...(code === "02" ? [item.disallowedInputVatLkr] : []),
  ]);
  return csvRows([OFFICIAL_SCHEDULE_HEADERS[code], ...rows]);
}

export function validateOfficialSchedule(
  transactions: VatTransaction[],
  period: VatPeriodRecord,
  code: VatScheduleCode,
): VatScheduleIssue[] {
  const scheduleRows = transactionsForSchedule(transactions, code);
  const issues: VatScheduleIssue[] = [];
  const invoiceKeys = new Set<string>();

  scheduleRows.forEach((item, index) => {
    const rowNumber = index + 1;
    const add = (severity: VatScheduleIssue["severity"], field: string, message: string) =>
      issues.push({ transactionId: item.id, rowNumber, severity, field, message });
    if (!item.invoiceNumber.trim()) add("ERROR", "Tax Invoice No", "Tax invoice number is required.");
    if (!/^\d{9}$/.test(item.counterpartyTin)) add("ERROR", code === "01" ? "Purchaser's TIN" : "Supplier's TIN", "Counterparty TIN must contain exactly nine digits.");
    if (!item.counterpartyName.trim()) add("ERROR", "Counterparty name", "Counterparty name is required.");
    if (item.invoiceDate < period.startDate || item.invoiceDate > period.endDate) add("ERROR", "Invoice Date", `Invoice date is outside ${period.label}.`);
    if (!Number.isFinite(item.netAmountLkr) || item.netAmountLkr <= 0) add("ERROR", code === "01" ? "Value of supply" : "Value of purchase", "Value must be greater than zero.");
    if (item.vatAmountLkr < 0) add("ERROR", "VAT Amount", "VAT amount cannot be negative.");
    if (code === "02" && item.disallowedInputVatLkr > item.vatAmountLkr) add("ERROR", "Disallowed VAT Amount", "Disallowed VAT cannot exceed the invoice VAT amount.");
    if (item.treatment === "STANDARD_18") {
      // Through calculateVat, not a literal rate: the standard rate is a figure
      // that moves (15% to 18% in 2024), and a second copy of it here would go
      // on warning against the old one long after the ledger had moved on.
      const expected = calculateVat(item.netAmountLkr, "STANDARD_18").vatAmountLkr;
      if (Math.abs(expected - item.vatAmountLkr) > 1) add("WARNING", "VAT Amount", `Review the VAT amount: 18% of the value is LKR ${expected.toFixed(2)}.`);
    }
    const key = `${item.counterpartyTin}|${item.invoiceNumber.trim().toUpperCase()}|${item.invoiceDate}`;
    if (invoiceKeys.has(key)) add("ERROR", "Tax Invoice No", "Possible duplicate: same TIN, invoice number and date already occur in this schedule.");
    invoiceKeys.add(key);
  });

  return issues;
}

export function scheduleDefinition(code: ScheduleCode): ScheduleDefinition {
  const definition = SCHEDULE_DEFINITIONS.find((item) => item.code === code);
  if (!definition) throw new Error(`Unknown VAT schedule code: ${code}`);
  return definition;
}

export function transactionsForSchedule(transactions: VatTransaction[], code: ScheduleCode): VatTransaction[] {
  return transactions
    .filter((item) => item.scheduleCode === code)
    .sort((a, b) => a.invoiceDate.localeCompare(b.invoiceDate) || a.invoiceNumber.localeCompare(b.invoiceNumber));
}

/**
 * Renders one IRD preparation schedule as CSV.
 *
 * The amount and identity columns are deliberately named with the headers our
 * own parser recognises, so a schedule exported here and re-uploaded as
 * evidence reconciles against itself instead of failing on column detection.
 * Extra columns beyond those are ignored by the parser and carried only for the
 * human reviewing the file before it is filed.
 *
 * A schedule with no rows still returns its header, so the reviewer sees an
 * empty schedule rather than an empty file that looks like an export failure.
 */
export function buildScheduleCsv(transactions: VatTransaction[], code: ScheduleCode): string {
  const definition = scheduleDefinition(code);
  const party = definition.counterparty === "SUPPLIER" ? "Supplier" : "Purchaser";
  const isInput = definition.counterparty === "SUPPLIER";

  const header = [
    "Invoice Number",
    "Invoice Date",
    `${party} TIN`,
    `${party} Name`,
    "Description",
    "Supply Type",
    "Treatment",
    "Net Amount",
    "VAT Rate",
    "VAT Amount",
    "Gross Amount",
    ...(isInput ? ["Disallowed Input VAT", "Claimable Input VAT"] : []),
  ];

  const rows = transactionsForSchedule(transactions, code).map((item) => [
    item.invoiceNumber,
    item.invoiceDate,
    item.counterpartyTin,
    item.counterpartyName,
    item.description,
    item.supplyType,
    item.treatment,
    item.netAmountLkr,
    // A percentage, not an amount: it goes out as "18", not "18.00".
    String(item.vatRate),
    item.vatAmountLkr,
    item.grossAmountLkr,
    ...(isInput
      ? [item.disallowedInputVatLkr, Math.max(0, item.vatAmountLkr - item.disallowedInputVatLkr)]
      : []),
  ]);

  return csvRows([header, ...rows]);
}

/**
 * Renders the period's VAT position as a two-column CSV.
 *
 * This is the reviewer's cover sheet, not a filing artefact: it states the
 * figures that must be keyed into the return and where each one came from, so
 * the person at the e-Services screen can tie every box back to a schedule
 * rather than retyping from memory.
 */
export function buildReturnSummaryCsv(
  profile: BusinessProfile,
  period: VatPeriodRecord,
  transactions: VatTransaction[],
): string {
  const summary = summariseVatPeriod(transactions);
  const rows: (string | number)[][] = [
    ["Field", "Value"],
    ["Taxpayer", profile.legalName],
    ["TIN", profile.tin],
    ["VAT registration effective date", profile.vatRegistrationEffectiveDate || "Not recorded"],
    ["Certificate / acknowledgement reference", profile.vatRegistrationCertificateRef || "Not recorded"],
    ["Period", period.label],
    ["Period start", period.startDate],
    ["Period end", period.endDate],
    ["Return due date", period.returnDueDate],
    ["Payment due date", period.paymentDueDate],
    ["Currency", "LKR"],
    ["Output VAT", summary.outputVatLkr],
    ["Input VAT", summary.inputVatLkr],
    ["Disallowed input VAT", summary.disallowedInputVatLkr],
    ["Allowable input VAT", summary.allowableInputVatLkr],
    ["VAT payable", summary.vatPayableLkr],
    ["Excess input credit", summary.excessInputCreditLkr],
    ["Total records", summary.transactionCount],
  ];

  for (const definition of SCHEDULE_DEFINITIONS) {
    const rowsForSchedule = transactionsForSchedule(transactions, definition.code);
    const vat = rowsForSchedule.reduce((sum, item) => sum + item.vatAmountLkr, 0);
    rows.push([`Schedule ${definition.code} — ${definition.name} (rows / VAT)`, `${rowsForSchedule.length} / ${vat.toFixed(2)}`]);
  }

  const unmapped = transactions.filter((item) => item.scheduleCode === "NONE").length;
  rows.push(["Records not mapped to a schedule", unmapped]);
  rows.push(["Prepared by", "ComplyPilot — preparation only, not an IRD submission"]);

  return csvRows(rows);
}

/** A stable, sortable file name that identifies the taxpayer and period at a glance. */
export function scheduleFileName(profile: BusinessProfile, period: VatPeriodRecord, suffix: string): string {
  const slug = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${slug(profile.tin || profile.displayName)}-${slug(period.label)}-${suffix}.csv`;
}
