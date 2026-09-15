import type { VatScheduleCode, VatTransaction } from "./workspace/workspace";

/**
 * The column layout of each IRD VAT schedule, and where each column's value
 * comes from.
 *
 * These names are not transcribed from a summary. They were read out of the
 * string table of IRD's own Schedule File Verifier (V5.20) - the program that
 * rejects a badly shaped file - so they are the names that program looks for,
 * in its spelling, punctuation and order.
 *
 * A column is one of two things. Either the ledger already knows it, in which
 * case it is derived, or it is a fact a VAT ledger has no reason to hold - a
 * CUSDEC office id, a net mass in kilograms, the exchange rate on an export
 * invoice - in which case it is collected from the user when the schedule is
 * built, and only for the rows that need it.
 *
 * Collecting them up front would mean asking every business for customs fields
 * it may never use. Asking at build time means the question is only ever put
 * about a row that is going into a schedule that actually needs it.
 */

/** A column the ledger can already answer. */
export type DerivedField = {
  header: string;
  kind: "derived";
  /** Serial numbers are positional, so the row index supplies them. */
  from: "serial" | keyof VatTransaction;
  format?: "ird-date" | "money" | "text";
};

/** A column only the user can answer, asked for when the schedule is built. */
export type CollectedField = {
  header: string;
  kind: "collected";
  key: string;
  input: "text" | "date" | "number";
  /** What to ask, in words someone holding the source document can act on. */
  hint: string;
  required: boolean;
};

export type ScheduleField = DerivedField | CollectedField;

export type ScheduleSpec = {
  code: VatScheduleCode;
  name: string;
  covers: string;
  /**
   * Whether the ledger models this schedule's subject at all. Credit notes and
   * deemed input credit have their columns recorded so the gap is precise, but
   * there are no rows to put under them yet.
   */
  supported: boolean;
  fields: ScheduleField[];
};

const serial: DerivedField = { header: "Serial No", kind: "derived", from: "serial" };

export const SCHEDULE_SPECS: Record<VatScheduleCode, ScheduleSpec> = {
  "01": {
    code: "01",
    name: "Output schedule",
    covers: "Tax invoices this business issued.",
    supported: true,
    fields: [
      serial,
      { header: "Invoice Date", kind: "derived", from: "invoiceDate", format: "ird-date" },
      { header: "Tax Invoice No", kind: "derived", from: "invoiceNumber" },
      { header: "Purchaser's TIN", kind: "derived", from: "counterpartyTin" },
      { header: "Name of the Purchaser", kind: "derived", from: "counterpartyName" },
      { header: "Description", kind: "derived", from: "description" },
      { header: "Value of supply", kind: "derived", from: "netAmountLkr", format: "money" },
      { header: "VAT Amount", kind: "derived", from: "vatAmountLkr", format: "money" },
    ],
  },
  "02": {
    code: "02",
    name: "Local input schedule",
    covers: "Local purchase invoices input VAT is claimed on.",
    supported: true,
    fields: [
      serial,
      { header: "Invoice Date", kind: "derived", from: "invoiceDate", format: "ird-date" },
      { header: "Tax Invoice No", kind: "derived", from: "invoiceNumber" },
      { header: "Supplier's TIN", kind: "derived", from: "counterpartyTin" },
      { header: "Name of the Supplier", kind: "derived", from: "counterpartyName" },
      { header: "Description", kind: "derived", from: "description" },
      { header: "Value of purchase", kind: "derived", from: "netAmountLkr", format: "money" },
      { header: "VAT Amount", kind: "derived", from: "vatAmountLkr", format: "money" },
      { header: "Disallowed VAT Amount", kind: "derived", from: "disallowedInputVatLkr", format: "money" },
    ],
  },
  "03": {
    code: "03",
    name: "Import input schedule",
    covers: "Imports, identified by their Customs declaration rather than a tax invoice.",
    supported: true,
    fields: [
      serial,
      { header: "Cusdec Date", kind: "collected", key: "cusdecDate", input: "date", hint: "Date on the CUSDEC, not the supplier invoice date.", required: true },
      { header: "Cusdec No", kind: "collected", key: "cusdecNo", input: "text", hint: "Customs declaration number.", required: true },
      // Deferred and upfront are separate boxes on the return, and the split is
      // a fact about how the import was cleared. The ledger's single VAT figure
      // cannot be divided between them by guessing.
      { header: "VAT Deferred", kind: "collected", key: "vatDeferred", input: "number", hint: "VAT deferred at import. Enter 0 if none was deferred.", required: true },
      { header: "VAT Upfront", kind: "collected", key: "vatUpfront", input: "number", hint: "VAT paid upfront at import. Enter 0 if none was paid upfront.", required: true },
      { header: "Disallowed VAT", kind: "derived", from: "disallowedInputVatLkr", format: "money" },
      { header: "Cusdec Serial ID", kind: "collected", key: "cusdecSerialId", input: "text", hint: "Serial ID printed on the CUSDEC.", required: true },
      { header: "Cusdec Office ID", kind: "collected", key: "cusdecOfficeId", input: "text", hint: "Customs office ID on the CUSDEC.", required: true },
      { header: "Cusdec Reg Date", kind: "collected", key: "cusdecRegDate", input: "date", hint: "CUSDEC registration date.", required: true },
    ],
  },
  "04": {
    code: "04",
    name: "Credit and debit notes",
    covers: "Credit and debit notes issued or received against earlier invoices.",
    supported: false,
    fields: [
      { header: "TIN No", kind: "derived", from: "counterpartyTin" },
      { header: "Invoice No", kind: "derived", from: "invoiceNumber" },
      { header: "Tax Credit / Tax Debit Note", kind: "collected", key: "noteType", input: "text", hint: "Credit or Debit.", required: true },
      { header: "Date of Tax Credit / Tax Debit Note", kind: "collected", key: "noteDate", input: "date", hint: "Date on the note.", required: true },
      { header: "Tax Credit No. / Tax Debit Note No.", kind: "collected", key: "noteNumber", input: "text", hint: "The note's own number.", required: true },
      { header: "Value of Tax Credit Note / Tax Debit Note", kind: "collected", key: "noteValue", input: "number", hint: "Value of the note in LKR.", required: true },
      { header: "Issued By Me", kind: "collected", key: "issuedByMe", input: "text", hint: "Yes if this business issued the note, No if it received one.", required: true },
    ],
  },
  "05": {
    code: "05",
    name: "Deemed input credit",
    covers: "Purchases from suppliers who are not VAT registered, where a deemed credit is claimed.",
    supported: false,
    fields: [
      { header: "Serial No.", kind: "derived", from: "serial" },
      { header: "Invoice No.", kind: "derived", from: "invoiceNumber" },
      { header: "NIC No. of the Supplier", kind: "collected", key: "supplierNic", input: "text", hint: "Supplier's NIC number.", required: true },
      { header: "BRC No. / PSV No. of the Supplier", kind: "collected", key: "supplierBrc", input: "text", hint: "Business registration or PSV number.", required: false },
      { header: "Income Tax file No. If any", kind: "collected", key: "supplierItFile", input: "text", hint: "Supplier's income tax file number, if they have one.", required: false },
      { header: "Cost of Purchases made during the taxable period - VAT liable(A) (Rs.)", kind: "collected", key: "costVatLiable", input: "number", hint: "Cost of VAT-liable purchases in the period.", required: true },
      { header: "Cost of Purchases made during the taxable period - VAT non-liable (B) (Rs.)", kind: "collected", key: "costVatNonLiable", input: "number", hint: "Cost of non-VAT-liable purchases in the period.", required: true },
      { header: "Deemed Input Credit = A x (Tax Rate / 1 + Tax Rate)", kind: "collected", key: "deemedInputCredit", input: "number", hint: "Deemed credit computed from the VAT-liable cost.", required: true },
      { header: "Disallowed Deemed Input Credit Amount", kind: "collected", key: "disallowedDeemed", input: "number", hint: "Any part of the deemed credit that is not claimable.", required: true },
    ],
  },
  "06": {
    code: "06",
    name: "Goods exports",
    covers: "Exported goods, evidenced by the Customs declaration.",
    supported: true,
    fields: [
      // A leading Serial No. follows every other VAT schedule in the verifier;
      // the extracted run for 06 itself begins at Date of exportation.
      serial,
      { header: "Date of exportation", kind: "collected", key: "exportDate", input: "date", hint: "Date the goods were exported.", required: true },
      { header: "CUSDEC Number", kind: "collected", key: "cusdecNo", input: "text", hint: "Customs declaration number for the export.", required: true },
      { header: "Office ID", kind: "collected", key: "cusdecOfficeId", input: "text", hint: "Customs office ID.", required: true },
      { header: "Serial ID", kind: "collected", key: "cusdecSerialId", input: "text", hint: "Serial ID on the CUSDEC.", required: true },
      { header: "Payment Date (Received/Receivable)", kind: "collected", key: "paymentDate", input: "date", hint: "Date payment was received, or is receivable.", required: true },
      { header: "Net Mass (Kg.)", kind: "collected", key: "netMassKg", input: "number", hint: "Net mass of the shipment in kilograms, from the CUSDEC.", required: true },
      { header: "FOB/CIF Value (Rs.)", kind: "collected", key: "fobCifValue", input: "number", hint: "FOB or CIF value in rupees.", required: true },
      { header: "NRFC Account Number", kind: "collected", key: "nrfcAccount", input: "text", hint: "Non-Resident Foreign Currency account the proceeds came into.", required: false },
    ],
  },
  "07": {
    code: "07",
    name: "Service exports",
    covers: "Services supplied to a recipient outside Sri Lanka.",
    supported: true,
    fields: [
      serial,
      { header: "Invoice date", kind: "derived", from: "invoiceDate", format: "ird-date" },
      { header: "Description of Service", kind: "derived", from: "description" },
      // The ledger records LKR. The foreign figure and the rate that produced
      // it are on the invoice, and are what IRD reconciles the rupee value
      // against, so neither can be back-computed from the rupee amount.
      { header: "Invoice Value (Foreign currency value)", kind: "collected", key: "foreignValue", input: "number", hint: "Invoice value in the currency it was issued in.", required: true },
      { header: "Exchange rate", kind: "collected", key: "exchangeRate", input: "number", hint: "Rate used to convert to rupees.", required: true },
      { header: "Rupee Value (Rs.)", kind: "derived", from: "netAmountLkr", format: "money" },
    ],
  },
};

export const SCHEDULE_CODES = Object.keys(SCHEDULE_SPECS) as VatScheduleCode[];

export function scheduleSpec(code: VatScheduleCode): ScheduleSpec {
  const spec = SCHEDULE_SPECS[code];
  if (!spec) throw new Error(`Unknown VAT schedule code: ${code}`);
  return spec;
}

export function collectedFields(code: VatScheduleCode): CollectedField[] {
  return scheduleSpec(code).fields.filter((field): field is CollectedField => field.kind === "collected");
}

export function scheduleHeaders(code: VatScheduleCode): string[] {
  return scheduleSpec(code).fields.map((field) => field.header);
}

/**
 * Why a supplied value is not usable, or null when it is.
 *
 * A non-empty box is not the same as an answered question. A date typed as
 * free text or an amount typed as a word passes an "is it blank" check, builds
 * a schedule that looks ready, and is rejected by IRD - which earns a Notice 2,
 * and a Notice 2 restarts the 45-day refund clock. So the shape is checked
 * where the value enters, not where it is written out.
 */
export function detailValueProblem(field: CollectedField, raw: string): string | null {
  const value = raw.trim();
  if (!value) return field.required ? `${field.header} is required.` : null;

  if (field.input === "date") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return `${field.header} must be a date in YYYY-MM-DD form.`;
    const parsed = new Date(`${value}T00:00:00Z`);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
      return `${field.header} is not a real date.`;
    }
    return null;
  }

  if (field.input === "number") {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return `${field.header} must be a number.`;
    // Every collected number here is a quantity, a value or a rate. None of
    // them is meaningfully negative, and a minus sign is far more likely to be
    // a typo than an intent.
    if (parsed < 0) return `${field.header} cannot be negative.`;
    return null;
  }

  return null;
}
