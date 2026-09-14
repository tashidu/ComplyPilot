import { describe, expect, it } from "vitest";
import { activeProfile, createDefaultWorkspace } from "../lib/workspace/workspace";
import { buildVatDocumentChecklist, createVatRegistrationDraft, registrationReadiness, turnoverAssessment } from "../lib/vat-registration";

describe("Sri Lanka VAT registration assistant", () => {
  it("uses the current official turnover thresholds", () => {
    expect(turnoverAssessment(15_000_000, 60_000_000).mandatory).toBe(false);
    expect(turnoverAssessment(15_000_001, 1).mandatory).toBe(true);
    expect(turnoverAssessment(1, 60_000_001).mandatory).toBe(true);
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
