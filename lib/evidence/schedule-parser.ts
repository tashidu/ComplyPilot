import type { VatScheduleEvidence, VatScheduleRow } from "../types";

const MAX_ROWS = 2_000;

export class ScheduleParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScheduleParseError";
  }
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === "," && !quoted) {
      row.push(field.trim());
      field = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(field.trim());
      field = "";
      if (row.some(Boolean)) rows.push(row);
      row = [];
    } else {
      field += char;
    }
  }

  if (quoted) throw new ScheduleParseError("The CSV contains an unclosed quoted value.");
  row.push(field.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function normaliseHeader(value: string): string {
  return value.replace(/^\uFEFF/, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

const ALIASES = {
  invoiceNumber: ["invoicenumber", "invoiceno", "taxinvoicenumber", "taxinvoiceno", "invoiceid"],
  supplierTin: ["suppliertin", "sellertin", "tin", "vatregistrationnumber", "suppliervatnumber"],
  netAmount: ["netamount", "netvalue", "valueofsupply", "amountexcludingvat", "taxablevalue"],
  vatAmount: ["vatamount", "inputvat", "outputvat", "vatvalue", "taxamount", "vat"],
  grossAmount: ["grossamount", "totalamount", "amountincludingvat", "invoiceamount", "total"],
} as const;

function columnIndex(headers: string[], aliases: readonly string[]): number {
  return headers.findIndex((header) => aliases.includes(header));
}

function textValue(row: string[], index: number): string | null {
  if (index < 0) return null;
  const value = row[index]?.trim();
  return value ? value : null;
}

function numberValue(row: string[], index: number): number | null {
  const value = textValue(row, index);
  if (value === null) return null;
  const cleaned = value.replace(/\(([^)]+)\)/, "-$1").replace(/[^0-9.-]/g, "");
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseVatScheduleCsv(
  text: string,
  fileName: string,
  uploadedAt = new Date().toISOString(),
): VatScheduleEvidence {
  const cells = parseCsv(text);
  if (cells.length < 2) {
    throw new ScheduleParseError("The VAT Schedule CSV must contain a header row and at least one data row.");
  }
  if (cells.length - 1 > MAX_ROWS) {
    throw new ScheduleParseError(`The MVP accepts up to ${MAX_ROWS.toLocaleString()} schedule rows per file.`);
  }

  const originalHeaders = cells[0].map((header) => header.replace(/^\uFEFF/, "").trim());
  const headers = originalHeaders.map(normaliseHeader);
  const indices = {
    invoiceNumber: columnIndex(headers, ALIASES.invoiceNumber),
    supplierTin: columnIndex(headers, ALIASES.supplierTin),
    netAmount: columnIndex(headers, ALIASES.netAmount),
    vatAmount: columnIndex(headers, ALIASES.vatAmount),
    grossAmount: columnIndex(headers, ALIASES.grossAmount),
  };

  if (indices.invoiceNumber < 0) {
    throw new ScheduleParseError(
      "No invoice-number column was found. Use a header such as Invoice Number, Invoice No or Tax Invoice No.",
    );
  }
  if (indices.vatAmount < 0 && indices.netAmount < 0 && indices.grossAmount < 0) {
    throw new ScheduleParseError(
      "No amount column was found. Include VAT Amount, Net Amount or Gross Amount.",
    );
  }

  const rows: VatScheduleRow[] = cells.slice(1).map((row, index) => ({
    rowNumber: index + 2,
    invoiceNumber: textValue(row, indices.invoiceNumber),
    supplierTin: textValue(row, indices.supplierTin)?.replace(/\D/g, "") || null,
    netAmount: numberValue(row, indices.netAmount),
    vatAmount: numberValue(row, indices.vatAmount),
    grossAmount: numberValue(row, indices.grossAmount),
  })).filter((row) => row.invoiceNumber !== null);

  if (rows.length === 0) {
    throw new ScheduleParseError("The schedule contains no data rows with an invoice number.");
  }

  const warnings: string[] = [];
  if (indices.supplierTin < 0) warnings.push("Supplier TIN column was not found.");
  if (indices.netAmount < 0) warnings.push("Net Amount column was not found.");
  if (indices.vatAmount < 0) warnings.push("VAT Amount column was not found.");
  if (indices.grossAmount < 0) warnings.push("Gross Amount column was not found.");

  return { fileName, uploadedAt, headers: originalHeaders, rows, warnings };
}
