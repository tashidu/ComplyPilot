import type { GeneratedVatInvoice, VatInvoiceLine, VatSupplyType, VatTransaction, VatTransactionKind, VatTreatment } from "./workspace/workspace";

export const STANDARD_VAT_RATE = 18;

/**
 * Rounds to whole cents.
 *
 * Every LKR figure that is stored, printed or compared goes through here.
 * Adding IEEE-754 doubles drifts - three hundred lines of 0.10 sum to
 * 30.000000000000156, not 30.00 - and currency formatting hides that on screen
 * while the wrong number is still what gets saved and later reconciled against
 * a schedule row. A phantom one-cent variance in our own reconciliation is a
 * self-inflicted finding.
 */
export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Totals an invoice so that it foots.
 *
 * VAT is taken on the rounded net total, not by adding up the per-line VAT.
 * Those two disagree: two lines of 0.01 and 0.02 each round to 0.00 VAT, so
 * the summed figure is 0.00 while 18% of the 0.03 net is 0.01. A reviewer
 * recomputes tax on the taxable amount, and an invoice whose stated VAT does
 * not match that is one they will query.
 *
 * Per-line VAT stays available for display; this total is the authoritative
 * one, and net + VAT === gross always holds.
 */
export function totalInvoiceLines(
  lines: { netAmountLkr: number; vatAmountLkr: number }[],
  treatment: VatTreatment,
): { netTotalLkr: number; vatTotalLkr: number; grossTotalLkr: number } {
  const netTotalLkr = roundMoney(lines.reduce((sum, line) => sum + line.netAmountLkr, 0));
  const vatTotalLkr = calculateVat(netTotalLkr, treatment).vatAmountLkr;
  return { netTotalLkr, vatTotalLkr, grossTotalLkr: roundMoney(netTotalLkr + vatTotalLkr) };
}

export function calculateVat(netAmountLkr: number, treatment: VatTreatment) {
  const net = roundMoney(Math.max(0, netAmountLkr));
  const vatRate = treatment === "STANDARD_18" ? STANDARD_VAT_RATE : 0;
  const vatAmountLkr = Math.round(net * vatRate + Number.EPSILON) / 100;
  return { netAmountLkr: net, vatRate, vatAmountLkr, grossAmountLkr: roundMoney(net + vatAmountLkr) };
}

export function scheduleFor(kind: VatTransactionKind, treatment: VatTreatment, supplyType: VatSupplyType): VatTransaction["scheduleCode"] {
  if (kind === "INPUT_LOCAL") return "02";
  if (kind === "INPUT_IMPORT") return "03";
  if (treatment === "ZERO_RATED") return supplyType === "GOODS" ? "06" : "07";
  if (kind === "OUTPUT") return "01";
  return "NONE";
}

export function summariseVatPeriod(transactions: VatTransaction[]) {
  // Each total is rounded once, here, so a return figure is never a drifted
  // double. Without this, three hundred small lines leave 5.99999999999996 in
  // a field that is meant to read 6.00.
  const outputVatLkr = roundMoney(
    transactions.filter((item) => item.kind === "OUTPUT").reduce((sum, item) => sum + item.vatAmountLkr, 0),
  );
  const inputVatLkr = roundMoney(
    transactions.filter((item) => item.kind !== "OUTPUT").reduce((sum, item) => sum + item.vatAmountLkr, 0),
  );
  const disallowedInputVatLkr = roundMoney(
    transactions
      .filter((item) => item.kind !== "OUTPUT")
      .reduce((sum, item) => sum + Math.min(item.vatAmountLkr, item.disallowedInputVatLkr || 0), 0),
  );
  const allowableInputVatLkr = Math.max(0, roundMoney(inputVatLkr - disallowedInputVatLkr));
  const balance = roundMoney(outputVatLkr - allowableInputVatLkr);
  return {
    outputVatLkr,
    inputVatLkr,
    disallowedInputVatLkr,
    allowableInputVatLkr,
    vatPayableLkr: Math.max(0, balance),
    excessInputCreditLkr: Math.max(0, -balance),
    transactionCount: transactions.length,
  };
}

export function invoiceSerial(invoiceDate: string, classificationCode: string, sequence: number) {
  const date = new Date(`${invoiceDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) throw new Error("A valid invoice date is required.");
  const year = String(date.getUTCFullYear()).slice(-2);
  const month = date.toLocaleString("en", { month: "short", timeZone: "UTC" }).toUpperCase();
  const code = classificationCode.trim().replace(/[^A-Za-z0-9]/g, "").slice(0, 15);
  if (!code) throw new Error("A 1–15 character invoice classification code is required.");
  const serial = `${year}${month}_${code}_${Math.max(1, Math.trunc(sequence))}`;
  if (serial.length > 40) throw new Error("The generated invoice number exceeds 40 characters.");
  return serial;
}

export function calculateInvoiceLine(input: { description: string; quantity: number; unitPriceLkr: number }, treatment: GeneratedVatInvoice["treatment"]): VatInvoiceLine {
  const amount = calculateVat(input.quantity * input.unitPriceLkr, treatment);
  return { description: input.description.trim(), quantity: input.quantity, unitPriceLkr: input.unitPriceLkr, ...amount };
}

export const VAT_TREATMENT_LABELS: Record<VatTreatment, string> = {
  STANDARD_18: "Standard-rated (18%)",
  ZERO_RATED: "Zero-rated (0%)",
  EXEMPT: "Exempt supply",
  OUT_OF_SCOPE: "Outside the scope of VAT",
};
