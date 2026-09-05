import { z } from "zod";

export const FieldSchema = z.object({
  value: z.string().or(z.number()).nullable(),
  confidence: z.number().min(0).max(100),
  source: z.string().nullable(),
});

export const InvoiceExtractionSchema = z.object({
  invoiceTitle: FieldSchema,
  sellerName: FieldSchema,
  sellerVatNumber: FieldSchema,
  sellerAddress: FieldSchema,
  sellerTelephone: FieldSchema,
  buyerName: FieldSchema,
  buyerTin: FieldSchema,
  buyerAddress: FieldSchema,
  buyerTelephone: FieldSchema,
  invoiceNumber: FieldSchema,
  invoiceDate: FieldSchema,
  supplyDate: FieldSchema,
  placeOfSupply: FieldSchema,
  currency: FieldSchema,
  netTotal: FieldSchema,
  vatTotal: FieldSchema,
  grossTotal: FieldSchema,
  totalInWords: FieldSchema,
  paymentMode: FieldSchema,
  lineItems: z.array(
    z.object({
      description: FieldSchema,
      quantity: FieldSchema,
      unitPrice: FieldSchema,
      amount: FieldSchema,
      vatRate: FieldSchema,
    })
  ),
});

export type InvoiceExtraction = z.infer<typeof InvoiceExtractionSchema>;
