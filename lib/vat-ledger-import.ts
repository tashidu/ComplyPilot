import type { InvoiceExtraction } from "./ai/extraction-schema";
import { normaliseTin, resolveInvoiceDirection, type DirectionVerdict } from "./rules/invoice-direction";
import { roundMoney, STANDARD_VAT_RATE } from "./vat-operations";
import type { BusinessProfile, VatSupplyType, VatTransactionKind, VatTreatment } from "./workspace/workspace";

/**
 * Below this, a field goes to a human before it is used.
 *
 * The model returns a confidence per field, and a low one is not noise to be
 * averaged away - it is the model saying it could not read that box. A TIN or
 * an amount transcribed at 40% belongs in front of a person, not in a VAT
 * return, so it is surfaced rather than quietly accepted.
 */
export const REVIEW_CONFIDENCE_THRESHOLD = 80;

export type ExtractedFieldView = {
  key: string;
  label: string;
  value: string | number | null;
  confidence: number;
  /** The text on the document the model says it read this from. */
  source: string | null;
  needsReview: boolean;
  reason: string | null;
};

export type LedgerImportDraft = {
  kind: VatTransactionKind;
  treatment: VatTreatment;
  supplyType: VatSupplyType;
  invoiceNumber: string;
  invoiceDate: string;
  counterpartyName: string;
  counterpartyTin: string;
  description: string;
  netAmountLkr: number;
  statedVatAmountLkr: number | null;
  disallowedInputVatLkr: number;
};

export type LedgerProposal = {
  direction: DirectionVerdict;
  /** Filled only when the proposal is usable. Null when a blocker stands. */
  draft: LedgerImportDraft | null;
  fields: ExtractedFieldView[];
  /** Reasons the entry cannot be prepared at all. */
  blockers: string[];
  /** Field labels a person must confirm before saving. */
  reviewRequired: string[];
  /** The mean confidence across the fields that matter to a ledger entry. */
  overallConfidence: number;
};

function text(field: { value: string | number | null } | undefined): string {
  const value = field?.value;
  return value === null || value === undefined ? "" : String(value).trim();
}

function amount(field: { value: string | number | null } | undefined): number | null {
  const value = field?.value;
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(String(value).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? roundMoney(parsed) : null;
}

/**
 * Converts the extracted invoice date to the ISO form the ledger stores.
 *
 * The rule pack prescribes MM/DD/YYYY, so that is what is read. When both parts
 * are twelve or under the value is genuinely ambiguous - 10/12/2026 is either
 * October or December depending on who typed it - and that ambiguity is
 * reported rather than resolved by assumption, because the wrong month can put
 * the supply in the wrong VAT period.
 */
export function parseExtractedDate(value: string): { iso: string | null; ambiguous: boolean } {
  const trimmed = value.trim();
  if (!trimmed) return { iso: null, ambiguous: false };

  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (iso) return { iso: trimmed, ambiguous: false };

  const slashed = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(trimmed);
  if (!slashed) return { iso: null, ambiguous: false };

  const [, first, second, year] = slashed;
  const month = Number(first);
  const day = Number(second);
  if (month < 1 || month > 12 || day < 1 || day > 31) return { iso: null, ambiguous: false };

  const padded = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const parsed = new Date(`${padded}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.getUTCDate() !== day) return { iso: null, ambiguous: false };

  return { iso: padded, ambiguous: day <= 12 && day !== month };
}

/**
 * Infers the VAT treatment from the amounts on the document.
 *
 * Only the standard rate can be concluded from arithmetic. A zero VAT figure is
 * not evidence of a zero-rated supply - exempt and out-of-scope supplies also
 * show zero, and they are claimed differently - so that case is proposed as
 * zero-rated but marked for a person to confirm.
 */
export function inferTreatment(netAmountLkr: number | null, vatAmountLkr: number | null): { treatment: VatTreatment; confident: boolean; reason: string | null } {
  if (!netAmountLkr || vatAmountLkr === null) {
    return { treatment: "STANDARD_18", confident: false, reason: "Net or VAT could not be read, so the treatment is a guess." };
  }
  if (vatAmountLkr === 0) {
    return { treatment: "ZERO_RATED", confident: false, reason: "No VAT is shown. Zero-rated, exempt and out-of-scope supplies all look like this — confirm which applies." };
  }
  const impliedRate = (vatAmountLkr / netAmountLkr) * 100;
  if (Math.abs(impliedRate - STANDARD_VAT_RATE) <= 0.5) {
    return { treatment: "STANDARD_18", confident: true, reason: null };
  }
  return {
    treatment: "STANDARD_18",
    confident: false,
    reason: `The VAT shown is ${impliedRate.toFixed(1)}% of the net, not ${STANDARD_VAT_RATE}%. Confirm the treatment and the figures against the document.`,
  };
}

/**
 * Lets a person settle a side the model could not.
 *
 * An unreadable or missing TIN leaves the direction UNKNOWN, and which side the
 * business is on is then a source fact - exactly the kind the agents are barred
 * from inventing. A human supplying it is the documented remedy, so the
 * confirmation is accepted and recorded as theirs.
 *
 * UNRELATED is deliberately not overridable. There both TINs were read and
 * neither is this business: that is not a gap to be filled in but a finding,
 * and letting it be clicked away is how input VAT gets claimed on somebody
 * else's purchase.
 */
function applyConfirmedDirection(
  verdict: DirectionVerdict,
  confirmed: "SALES" | "PURCHASE" | undefined,
): DirectionVerdict {
  if (!confirmed || verdict.direction !== "UNKNOWN") return verdict;
  const isSale = confirmed === "SALES";
  return {
    direction: confirmed,
    reason: `${verdict.reason} An authorised user confirmed this is ${isSale ? "an invoice this business issued" : "a purchase from a supplier"}.`,
    needsHuman: false,
    schedule: isSale ? "OUTPUT" : "INPUT",
    canDraftCorrection: isSale,
    claimsInputVat: !isSale,
    counterparty: isSale ? "CUSTOMER" : "SUPPLIER",
  };
}

/**
 * Turns one extracted invoice into a proposed ledger entry.
 *
 * Nothing here writes anything. The output is a proposal: the direction the
 * document takes, the fields the model read with the confidence it had in each,
 * and the list of things a person must look at first. The same review and the
 * same save button then apply as for an entry typed by hand — an extraction is
 * a faster way to fill the form, never a way around it.
 */
export function proposeLedgerEntry(
  extraction: InvoiceExtraction,
  profile: BusinessProfile,
  options: { confirmedDirection?: "SALES" | "PURCHASE" } = {},
): LedgerProposal {
  const sellerTin = text(extraction.sellerVatNumber);
  const buyerTin = text(extraction.buyerTin);
  const direction = applyConfirmedDirection(
    resolveInvoiceDirection(sellerTin, buyerTin, profile.tin),
    options.confirmedDirection,
  );

  const netAmountLkr = amount(extraction.netTotal);
  const vatAmountLkr = amount(extraction.vatTotal);
  const invoiceNumber = text(extraction.invoiceNumber);
  const invoiceDateRaw = text(extraction.invoiceDate);
  const date = parseExtractedDate(invoiceDateRaw);
  const treatment = inferTreatment(netAmountLkr, vatAmountLkr);
  const currency = text(extraction.currency);

  const isSale = direction.direction === "SALES";
  const counterpartyField = isSale ? extraction.buyerName : extraction.sellerName;
  const counterpartyTinField = isSale ? extraction.buyerTin : extraction.sellerVatNumber;

  const fields: ExtractedFieldView[] = [
    view("invoiceNumber", "Invoice number", extraction.invoiceNumber, invoiceNumber ? null : "No invoice number was read."),
    view("invoiceDate", "Invoice date", extraction.invoiceDate, date.iso ? (date.ambiguous ? `${invoiceDateRaw} was read as MM/DD/YYYY (${date.iso}). Both parts are 12 or under, so confirm the month.` : null) : "The invoice date could not be read in a usable form."),
    view("counterpartyName", isSale ? "Purchaser name" : "Supplier name", counterpartyField, text(counterpartyField) ? null : "The counterparty name was not read."),
    view("counterpartyTin", isSale ? "Purchaser TIN" : "Supplier TIN", counterpartyTinField, normaliseTin(text(counterpartyTinField)) ? null : "No nine-digit TIN was read for the counterparty."),
    view("netTotal", "Net amount", extraction.netTotal, netAmountLkr && netAmountLkr > 0 ? null : "The net amount could not be read."),
    view("vatTotal", "VAT amount", extraction.vatTotal, vatAmountLkr === null ? "The VAT amount could not be read." : treatment.reason),
    view("currency", "Currency", extraction.currency, !currency || currency.toUpperCase() === "LKR" ? null : `The document is in ${currency}. The ledger records LKR — convert before saving.`),
  ];

  const blockers: string[] = [];
  if (direction.direction === "UNRELATED") blockers.push(direction.reason);
  if (direction.direction === "UNKNOWN") blockers.push(direction.reason);
  if (!netAmountLkr || netAmountLkr <= 0) blockers.push("A net amount above zero is required before this can be recorded.");
  if (!date.iso) blockers.push("A readable invoice date is required before this can be recorded.");
  if (!invoiceNumber) blockers.push("An invoice number is required before this can be recorded.");

  const reviewRequired = fields.filter((field) => field.needsReview).map((field) => field.label);
  const scored = fields.filter((field) => field.value !== null);
  const overallConfidence = scored.length
    ? Math.round(scored.reduce((sum, field) => sum + field.confidence, 0) / scored.length)
    : 0;

  if (blockers.length) {
    return { direction, draft: null, fields, blockers, reviewRequired, overallConfidence };
  }

  const kind: VatTransactionKind = isSale ? "OUTPUT" : "INPUT_LOCAL";
  const draft: LedgerImportDraft = {
    kind,
    treatment: treatment.treatment,
    supplyType: "GOODS",
    invoiceNumber,
    invoiceDate: date.iso!,
    counterpartyName: text(counterpartyField),
    counterpartyTin: normaliseTin(text(counterpartyTinField)) ?? "",
    description: text(extraction.lineItems[0]?.description) || "Supply read from the uploaded tax invoice",
    netAmountLkr: netAmountLkr!,
    // On a purchase the claim follows the document, so the extracted VAT is
    // carried as the supplier's stated amount rather than recomputed. On a sale
    // the business computes its own output tax and the field does not apply.
    statedVatAmountLkr: kind === "OUTPUT" ? null : vatAmountLkr,
    disallowedInputVatLkr: 0,
  };

  return { direction, draft, fields, blockers, reviewRequired, overallConfidence };
}

function view(
  key: string,
  label: string,
  field: { value: string | number | null; confidence: number; source: string | null } | undefined,
  reason: string | null,
): ExtractedFieldView {
  const confidence = Math.round(field?.confidence ?? 0);
  const value = field?.value ?? null;
  return {
    key,
    label,
    value,
    confidence,
    source: field?.source ?? null,
    // Either the model was unsure, or the value did not survive our own checks.
    needsReview: Boolean(reason) || confidence < REVIEW_CONFIDENCE_THRESHOLD,
    reason: reason ?? (confidence < REVIEW_CONFIDENCE_THRESHOLD ? `The model read this at ${confidence}% confidence.` : null),
  };
}
