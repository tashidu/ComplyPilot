import { roundMoney } from "./vat-operations";
import type { GeneratedVatInvoice, VatInvoiceStatus, VatPeriodRecord } from "./workspace/workspace";

export const INVOICE_STATUS_LABELS: Record<VatInvoiceStatus, string> = {
  DRAFT: "Draft",
  ISSUED: "Issued",
  VOID: "Void",
};

/** A closed period is a filed position; its invoices are no longer the business's to change. */
function periodLocked(period: VatPeriodRecord | undefined): boolean {
  return period?.status === "APPROVED" || period?.status === "SUBMITTED";
}

/**
 * Why this invoice cannot be issued, or null when it can be.
 *
 * Issuing is the point at which the document becomes the purchaser's evidence
 * for their own input claim, so it is deliberately one-way: there is no
 * un-issue, only a void.
 */
export function issueBlocker(invoice: GeneratedVatInvoice, period: VatPeriodRecord | undefined): string | null {
  if (invoice.status === "ISSUED") return "This invoice has already been issued.";
  if (invoice.status === "VOID") return "A voided invoice cannot be issued. Create a replacement instead.";
  if (periodLocked(period)) return "This VAT period is closed, so its invoices can no longer be changed.";
  return null;
}

/**
 * Why this invoice cannot be voided, or null when it can be.
 *
 * Both drafts and issued invoices can be voided — withdrawing an issued one is
 * exactly what voiding is for. What cannot be touched is an invoice inside a
 * period that has already been approved or filed: the return has gone out
 * stating that output VAT, and quietly removing it here would leave our figures
 * disagreeing with the ones IRD holds.
 */
export function voidBlocker(invoice: GeneratedVatInvoice, period: VatPeriodRecord | undefined): string | null {
  if (invoice.status === "VOID") return "This invoice is already void.";
  if (periodLocked(period)) return "This VAT period is closed. Correct a filed invoice through an amendment, not a void.";
  return null;
}

export function filterInvoices(
  invoices: GeneratedVatInvoice[],
  filters: { query?: string; status?: VatInvoiceStatus | "ALL" } = {},
): GeneratedVatInvoice[] {
  const query = (filters.query ?? "").trim().toLowerCase();
  const status = filters.status ?? "ALL";
  return invoices
    .filter((invoice) => status === "ALL" || invoice.status === status)
    .filter((invoice) =>
      !query ||
      [invoice.invoiceNumber, invoice.purchaserName, invoice.purchaserTin, invoice.classificationCode]
        .some((field) => field.toLowerCase().includes(query)),
    )
    .sort((a, b) => b.invoiceDate.localeCompare(a.invoiceDate) || b.createdAt.localeCompare(a.createdAt));
}

/**
 * Totals the register by status.
 *
 * Void invoices are counted but contribute nothing to any money figure. They
 * stay visible because a gap in an invoice sequence is the first thing an
 * auditor asks about, and "voided on this date for this reason" is the answer;
 * deleting the record would leave only the gap.
 */
export function summariseInvoices(invoices: GeneratedVatInvoice[]) {
  const live = invoices.filter((invoice) => invoice.status !== "VOID");
  const issued = invoices.filter((invoice) => invoice.status === "ISSUED");
  return {
    total: invoices.length,
    draftCount: invoices.filter((invoice) => invoice.status === "DRAFT").length,
    issuedCount: issued.length,
    voidCount: invoices.filter((invoice) => invoice.status === "VOID").length,
    netTotalLkr: roundMoney(live.reduce((sum, invoice) => sum + invoice.netTotalLkr, 0)),
    vatTotalLkr: roundMoney(live.reduce((sum, invoice) => sum + invoice.vatTotalLkr, 0)),
    grossTotalLkr: roundMoney(live.reduce((sum, invoice) => sum + invoice.grossTotalLkr, 0)),
    issuedVatTotalLkr: roundMoney(issued.reduce((sum, invoice) => sum + invoice.vatTotalLkr, 0)),
  };
}

/**
 * The gaps in an issued invoice sequence, per classification code and month.
 *
 * A serial that jumps from _3 to _5 is the shape of a missing sale, and it is
 * the business that should find it rather than an officer. Voided numbers are
 * treated as present: the number was used, and the void record accounts for it.
 */
export function sequenceGaps(invoices: GeneratedVatInvoice[]): string[] {
  const groups = new Map<string, { prefix: string; numbers: number[] }>();
  for (const invoice of invoices) {
    const match = /^(.*)_(\d+)$/.exec(invoice.invoiceNumber);
    if (!match) continue;
    const [, prefix, sequence] = match;
    const group = groups.get(prefix) ?? { prefix, numbers: [] };
    group.numbers.push(Number(sequence));
    groups.set(prefix, group);
  }

  const gaps: string[] = [];
  for (const { prefix, numbers } of groups.values()) {
    const present = new Set(numbers);
    for (let sequence = 1; sequence < Math.max(...numbers); sequence += 1) {
      if (!present.has(sequence)) gaps.push(`${prefix}_${sequence}`);
    }
  }
  return gaps.sort();
}
