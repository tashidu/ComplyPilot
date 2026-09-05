import { z } from "zod";

export const FieldSchema = z.object({
  value: z.string().or(z.number()).nullable(),
  confidence: z.number().min(0).max(100),
  source: z.string().nullable(),
});

export const InvoiceExtractionSchema = z.object({
  sellerName: FieldSchema,
  sellerVatNumber: FieldSchema,
  buyerName: FieldSchema,
  invoiceNumber: FieldSchema,
  invoiceDate: FieldSchema,
  currency: FieldSchema,
  netTotal: FieldSchema,
  vatTotal: FieldSchema,
  grossTotal: FieldSchema,
  lineItems: z.array(
    z.object({
      description: FieldSchema,
      quantity: FieldSchema,
      unitPrice: FieldSchema,
      amount: FieldSchema,
      vatRate: FieldSchema,
    })
  ).optional(),
});

export type InvoiceExtraction = z.infer<typeof InvoiceExtractionSchema>;
