import governmentSourcesData from "@/data/government-sources.json";
import vatInvoiceRulePackData from "@/data/rules/vat-invoice-2026.json";
import vatRatesData from "@/data/rules/vat-rates.json";
import refundRiskRulesData from "@/data/rules/refund-risk-rules.json";
import vatSchedulesData from "@/data/schedules/vat-schedule-schemas.json";
import inactiveVatSnapshotData from "@/data/snapshots/inactive-vat-2025-11-18.json";
import customsReferenceData from "@/data/customs/customs-reference.json";

export type GovernmentSource = {
  id: string;
  authority: string;
  title: string;
  category: string;
  url: string;
  publicationDate: string | null;
  effectiveFrom: string | null;
  lastVerifiedAt: string;
  freshness: "current" | "snapshot" | "reference";
  legalWeight: "binding" | "official-guidance" | "informational";
  note: string;
};

export type InvoiceFieldRule = {
  key: string;
  label: string;
  extractionPath: string;
  required: boolean;
  validation: "present" | "tin" | "invoice-serial" | "date" | "lkr" | "tax-invoice-title";
};

type VatInvoiceRulePack = Omit<typeof vatInvoiceRulePackData, "fields"> & {
  fields: InvoiceFieldRule[];
};

export const governmentSources = governmentSourcesData as GovernmentSource[];
export const vatInvoiceRulePack = vatInvoiceRulePackData as VatInvoiceRulePack;
export const vatRates = vatRatesData;
export const refundRiskRules = refundRiskRulesData;
export const vatSchedules = vatSchedulesData;
export const inactiveVatSnapshot = inactiveVatSnapshotData;
export const customsReference = customsReferenceData;

export const governmentDataSummary = {
  sourceCount: governmentSources.length,
  bindingSourceCount: governmentSources.filter((source) => source.legalWeight === "binding").length,
  scheduleCount: vatSchedules.schedules.length,
  invoiceFieldCount: vatInvoiceRulePack.fields.length,
  mandatoryInvoiceFieldCount: vatInvoiceRulePack.fields.filter((field) => field.required).length,
  lastVerifiedAt: governmentSources
    .map((source) => source.lastVerifiedAt)
    .sort()
    .at(-1),
};
