import type { BusinessEntityType, BusinessProfile, VatRegistrationApplication, VatRegistrationBasis, VatRegistrationDocument } from "./workspace/workspace";

export const VAT_REGISTRATION_THRESHOLDS = {
  quarterLkr: 15_000_000,
  twelveMonthsLkr: 60_000_000,
  effectiveFrom: "2024-01-01",
  sourceId: "IRD-VAT-RATES",
} as const;

export const VAT_REGISTRATION_SOURCES = {
  guideline: "https://www.ird.gov.lk/en/Downloads/SiteAssets/TPR_Guidelines_2026_E.pdf",
  taxTypeForm: "https://www.ird.gov.lk/en/Downloads/TaxpayerRegistrationDocs/TPR_005_E.pdf",
  registration: "https://www.ird.gov.lk/en/eservices/sitepages/registration.aspx",
  eServices: "https://www.ird.gov.lk/en/eServices/SitePages/Access%20To%20e-Services.aspx",
} as const;

type DocumentTemplate = Pick<VatRegistrationDocument, "key" | "label" | "required">;

const COMMON: DocumentTemplate[] = [
  { key: "request-letter", label: "Formal request letter explaining the VAT registration basis and business activity", required: true },
  { key: "authorisation", label: "Company authorisation letter and NIC/passport of the authorised signatory", required: true },
  { key: "business-registration", label: "Business Registration certificate / Certificate of Incorporation", required: true },
  { key: "entity-forms", label: "Applicable entity forms (such as Form 01/40, 20 or 13 where relevant)", required: true },
  { key: "address-proof", label: "Premises proof: deed or lease/rent agreement, NOC where relevant, and utility evidence", required: true },
];

const BASIS_DOCUMENTS: Record<VatRegistrationBasis, DocumentTemplate[]> = {
  TURNOVER: [
    { key: "director-ids", label: "NIC/passport copies of all directors or responsible partners", required: true },
    { key: "bank-statements", label: "Business bank statements for the latest three months", required: true },
    { key: "sales-schedule", label: "Certified sales schedule for the latest three months showing the quarterly threshold", required: true },
    { key: "latest-sales-invoice", label: "Latest sales invoice", required: true },
  ],
  VOLUNTARY: [
    { key: "director-ids", label: "NIC/passport copies of all directors or responsible partners", required: true },
    { key: "bank-statements", label: "Business bank statements for the latest three months", required: true },
    { key: "sales-schedule", label: "Certified sales schedule for the latest three months", required: true },
    { key: "latest-sales-invoice", label: "Latest sales invoice", required: true },
    { key: "voluntary-affidavit", label: "Affidavit covering expected turnover and the minimum registration commitment", required: true },
  ],
  IMPORT_EXPORT: [
    { key: "commercial-document", label: "Commercial invoice and bill of lading for imports, or pro-forma invoice for exports", required: true },
    { key: "gs02", label: "GS 02 certificate / location confirmation where requested", required: true },
    { key: "sector-licence", label: "Applicable sector licence (for example gem-trade licence) or an explanation that it is not applicable", required: false },
  ],
  SECTION_10C_NEW_BUSINESS: [
    { key: "director-ids", label: "NIC/passport copies of all directors or responsible partners", required: true },
    { key: "bank-statements", label: "Available business bank statements", required: true },
    { key: "future-contracts", label: "Purchase orders, sales agreements or contracts supporting expected supplies above the threshold", required: true },
    { key: "new-business-affidavit", label: "Affidavit supporting the expected taxable supplies of the new business", required: true },
  ],
  TEMPORARY: [
    { key: "purpose-letter", label: "Letter explaining the purpose of the temporary VAT registration", required: true },
    { key: "commercial-invoice", label: "Commercial invoice and shipping/import document", required: true },
    { key: "payment-proof", label: "Proof of payment for the relevant transaction", required: true },
    { key: "tax-returns", label: "Evidence that applicable tax returns are up to date", required: true },
  ],
};

export function buildVatDocumentChecklist(
  basis: VatRegistrationBasis,
  entityType: BusinessEntityType,
  existing: VatRegistrationDocument[] = [],
): VatRegistrationDocument[] {
  const entitySpecific: DocumentTemplate[] = entityType === "INDIVIDUAL_PROPRIETORSHIP"
    ? [{ key: "owner-id", label: "NIC/passport of the proprietor", required: true }]
    : [];
  return [...COMMON, ...entitySpecific, ...BASIS_DOCUMENTS[basis]].map((template) => {
    const prior = existing.find((item) => item.key === template.key);
    return {
      ...template,
      status: prior?.status ?? "MISSING",
      note: prior?.note ?? "",
    };
  });
}

export function createVatRegistrationDraft(profile: BusinessProfile): VatRegistrationApplication {
  const now = new Date().toISOString();
  const basis: VatRegistrationBasis = "TURNOVER";
  return {
    id: "VATREG-DRAFT",
    profileId: profile.id,
    status: "NOT_STARTED",
    basis,
    premisesNo: "",
    unitNo: "",
    taxTypeAddress: profile.address,
    postalCode: profile.postalCode,
    businessActivity: profile.industry,
    activityCode: "",
    requestedEffectiveDate: "",
    firstTransactionDate: "",
    estimatedTaxableSupplyDate: "",
    taxableSuppliesLastQuarterLkr: 0,
    taxableSuppliesToDateLkr: 0,
    estimatedTaxableSuppliesNext12MonthsLkr: 0,
    operationAddress: profile.address,
    cashBasisRequested: false,
    reason: "",
    signatoryName: profile.authorisedReviewer,
    signatoryNic: "",
    documents: buildVatDocumentChecklist(basis, profile.entityType),
    updatedAt: now,
  };
}

export function registrationReadiness(application: VatRegistrationApplication, profile: BusinessProfile) {
  const checks = [
    { label: "Nine-digit TIN is available", passed: /^\d{9}$/.test(profile.tin) },
    { label: "IRD e-Services PIN/SSID is active", passed: profile.irdPinStatus === "ACTIVE" },
    { label: "Business identity and contact details are complete", passed: Boolean(profile.legalName && profile.entityType && profile.address && profile.contactPhone && profile.financeEmail) },
    { label: "Registration basis and reason are recorded", passed: Boolean(application.basis && application.reason.trim()) },
    { label: "Business activity is recorded", passed: Boolean(application.businessActivity.trim()) },
    { label: "Requested effective date is recorded", passed: Boolean(application.requestedEffectiveDate) },
    { label: "Tax-type and operating addresses are recorded", passed: Boolean(application.taxTypeAddress.trim() && application.operationAddress.trim()) },
    { label: "Authorised signatory details are recorded", passed: Boolean(application.signatoryName.trim() && application.signatoryNic.trim()) },
    { label: "All required evidence is marked ready", passed: application.documents.filter((item) => item.required).every((item) => item.status === "READY") },
  ];
  const completed = checks.filter((check) => check.passed).length;
  return {
    checks,
    completed,
    total: checks.length,
    percentage: Math.round((completed / checks.length) * 100),
    ready: checks.every((check) => check.passed),
  };
}

export function turnoverAssessment(quarterLkr: number, twelveMonthsLkr: number) {
  return {
    mandatory: quarterLkr > VAT_REGISTRATION_THRESHOLDS.quarterLkr || twelveMonthsLkr > VAT_REGISTRATION_THRESHOLDS.twelveMonthsLkr,
    quarterExceeded: quarterLkr > VAT_REGISTRATION_THRESHOLDS.quarterLkr,
    twelveMonthsExceeded: twelveMonthsLkr > VAT_REGISTRATION_THRESHOLDS.twelveMonthsLkr,
  };
}
