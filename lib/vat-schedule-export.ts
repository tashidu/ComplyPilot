import { summariseVatPeriod } from "./vat-operations";
import type { BusinessProfile, VatPeriodRecord, VatTransaction } from "./workspace/workspace";

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
