import { describe, expect, it } from "vitest";
import { activeProfile, createDefaultWorkspace } from "../lib/workspace/workspace";
import { buildVatDocumentChecklist, createVatRegistrationDraft, registrationReadiness, turnoverAssessment } from "../lib/vat-registration";

describe("Sri Lanka VAT registration assistant", () => {
  it("uses the current official turnover thresholds", () => {
    expect(turnoverAssessment(15_000_000, 60_000_000).mandatory).toBe(false);
    expect(turnoverAssessment(15_000_001, 1).mandatory).toBe(true);
    expect(turnoverAssessment(1, 60_000_001).mandatory).toBe(true);
  });

  it("holds financial services to their own, much lower thresholds", () => {
    // 4m in a quarter is comfortably under the general 15m but over the 3m a
    // financial-services supplier is liable at. Judging it by the general
    // figure would tell a liable business it is not yet liable.
    expect(turnoverAssessment(4_000_000, 1).mandatory).toBe(false);
    expect(turnoverAssessment(4_000_000, 1, "FINANCIAL_SERVICES").mandatory).toBe(true);
    expect(turnoverAssessment(1, 13_000_000, "FINANCIAL_SERVICES").twelveMonthsExceeded).toBe(true);
  });

  it("is not liable exactly at the threshold — liability is on exceeding it", () => {
    expect(turnoverAssessment(3_000_000, 12_000_000, "FINANCIAL_SERVICES").mandatory).toBe(false);
    expect(turnoverAssessment(3_000_001, 1, "FINANCIAL_SERVICES").mandatory).toBe(true);
  });

  it("reports the thresholds it judged against, so the UI can state them", () => {
    expect(turnoverAssessment(0, 0).thresholds).toEqual({ quarterLkr: 15_000_000, twelveMonthsLkr: 60_000_000 });
    expect(turnoverAssessment(0, 0, "FINANCIAL_SERVICES").thresholds).toEqual({ quarterLkr: 3_000_000, twelveMonthsLkr: 12_000_000 });
  });

  it("adapts evidence to the chosen registration route", () => {
    const turnover = buildVatDocumentChecklist("TURNOVER", "COMPANY");
    const voluntary = buildVatDocumentChecklist("VOLUNTARY", "COMPANY");
    const temporary = buildVatDocumentChecklist("TEMPORARY", "COMPANY");

    expect(turnover.some((item) => item.key === "sales-schedule")).toBe(true);
    expect(voluntary.some((item) => item.key === "voluntary-affidavit")).toBe(true);
    expect(temporary.some((item) => item.key === "payment-proof")).toBe(true);
  });

  it("does not call a draft ready until identity, form fields and evidence are complete", () => {
    const profile = activeProfile(createDefaultWorkspace());
    const draft = createVatRegistrationDraft(profile);
    expect(registrationReadiness(draft, profile).ready).toBe(false);

    const complete = {
      ...draft,
      reason: "Taxable supplies exceeded the quarterly registration threshold.",
      requestedEffectiveDate: "2026-09-15",
      taxTypeAddress: profile.address,
      operationAddress: profile.address,
      businessActivity: profile.industry,
      signatoryName: "N. Perera",
      signatoryNic: "901234567V",
      documents: draft.documents.map((item) => ({ ...item, status: item.required ? "READY" as const : item.status })),
    };
    expect(registrationReadiness(complete, profile).ready).toBe(true);
  });
});
