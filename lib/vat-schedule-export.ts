import { calculateVat, summariseVatPeriod } from "./vat-operations";
import { collectedFields, detailValueProblem, scheduleHeaders, scheduleSpec } from "./vat-schedule-fields";
import type { BusinessProfile, VatPeriodRecord, VatScheduleCode, VatScheduleDetail, VatScheduleIssue, VatTransaction } from "./workspace/workspace";

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

/** Kept for callers that only want the header row; the spec is the source. */
export const OFFICIAL_SCHEDULE_HEADERS: Record<VatScheduleCode, string[]> = Object.fromEntries(
  (["01", "02", "03", "04", "05", "06", "07"] as VatScheduleCode[]).map((code) => [code, scheduleHeaders(code)]),
) as Record<VatScheduleCode, string[]>;

/** The extra facts one row still needs before its schedule can be built. */
export type ScheduleRowGap = {
  transactionId: string;
  rowNumber: number;
  invoiceNumber: string;
  invoiceDate: string;
  counterpartyName: string;
  missing: { key: string; header: string; input: "text" | "date" | "number"; hint: string; problem: string }[];
};

function detailsFor(details: VatScheduleDetail[], transactionId: string, code: VatScheduleCode) {
  return details.find((item) => item.transactionId === transactionId && item.code === code)?.values ?? {};
}

/**
 * What the user still has to supply before this schedule can be produced.
 *
 * Only required columns count as a gap. An optional one - an NRFC account on an
 * export that was not settled through one - is left blank rather than standing
 * between the business and its filing.
 */
export function scheduleRowGaps(
  transactions: VatTransaction[],
  code: VatScheduleCode,
  details: VatScheduleDetail[] = [],
): ScheduleRowGap[] {
  // Optional fields are checked too: an optional value that was supplied badly
  // is still a value that will be written into the file.
  const fields = collectedFields(code);
  if (!fields.length) return [];
  return transactionsForSchedule(transactions, code)
    .map((item, index) => {
      const values = detailsFor(details, item.id, code);
      const missing = fields
        .map((field) => ({ field, problem: detailValueProblem(field, String(values[field.key] ?? "")) }))
        .filter((entry): entry is { field: typeof entry.field; problem: string } => entry.problem !== null)
        .map(({ field, problem }) => ({ key: field.key, header: field.header, input: field.input, hint: field.hint, problem }));
      return {
        transactionId: item.id,
        rowNumber: index + 1,
        invoiceNumber: item.invoiceNumber,
        invoiceDate: item.invoiceDate,
        counterpartyName: item.counterpartyName,
        missing,
      };
    })
    .filter((row) => row.missing.length > 0);
}

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

/**
 * The schedule, in the column order IRD's verifier expects.
 *
 * Driven by the spec rather than written out per schedule, so a column only
 * ever has one definition and 03 through 07 cannot drift from 01 and 02.
 * A collected value that is absent is written blank; scheduleRowGaps is what
 * stops a schedule being built in that state.
 */
/**
 * One schedule row's cells, in column order.
 *
 * Shared by the CSV writer and the on-screen preview so the table a reviewer
 * approves is built from the same code as the file they then upload. Two
 * renderings of the same row are two chances to disagree.
 */
export function scheduleRowCells(
  item: VatTransaction,
  index: number,
  code: VatScheduleCode,
  details: VatScheduleDetail[] = [],
): (string | number)[] {
  const values = detailsFor(details, item.id, code);
  return scheduleSpec(code).fields.map((field) => {
    if (field.kind === "collected") {
      const value = String(values[field.key] ?? "").trim();
      if (!value) return "";
      if (field.input === "date") return toIrdDate(value);
      // Written as the user entered it, not reformatted. These are figures read
      // off a CUSDEC or an export invoice - an exchange rate carries four
      // decimals, a net mass is kilograms, neither is money - and rounding them
      // to two places would change what the document said.
      return value;
    }
    if (field.from === "serial") return String(index + 1);
    const raw = item[field.from];
    if (field.format === "ird-date") return toIrdDate(String(raw ?? ""));
    if (field.format === "money") return typeof raw === "number" ? raw : 0;
    return raw === null || raw === undefined ? "" : String(raw);
  });
}

export function buildOfficialScheduleCsv(
  transactions: VatTransaction[],
  code: VatScheduleCode,
  details: VatScheduleDetail[] = [],
): string {
  const rows = transactionsForSchedule(transactions, code).map((item, index) =>
    scheduleRowCells(item, index, code, details),
  );
  return csvRows([scheduleHeaders(code), ...rows]);
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

/**
 * The rows that belong in one schedule.
 *
 * Accepts every schedule code, including 04 and 05, which no transaction is
 * ever mapped to: those cover credit notes and deemed input credit, which the
 * ledger does not model. They return empty rather than being a type error, so
 * callers can walk all seven schedules uniformly.
 */
export function transactionsForSchedule(transactions: VatTransaction[], code: VatScheduleCode): VatTransaction[] {
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
