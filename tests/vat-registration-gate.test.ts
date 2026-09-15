import { describe, expect, it } from "vitest";
import {
  canOperateVat,
  isProfileComplete,
  vatOperationBlocker,
} from "../lib/workspace/profile-readiness";
import type { BusinessProfile } from "../lib/workspace/workspace";

/**
 * Issuing a tax invoice and building a VAT return are things only a registered
 * business may do. The registration status is a field a user can set, so it is
 * a claim, not proof - these tests pin that operating requires the evidence
 * behind the claim.
 */

const profile = (over: Partial<BusinessProfile> = {}): BusinessProfile =>
  ({
    legalName: "Acme Trading",
    displayName: "Acme",
    entityType: "COMPANY",
    businessRegistrationNumber: "PV12345",
    incorporationDate: "2020-01-01",
    tin: "134857291",
    irdPinStatus: "ACTIVE",
    vatRegistrationStatus: "ACTIVE",
    vatRegistrationEffectiveDate: "2026-01-01",
    vatRegistrationCertificateRef: "VAT/2026/00123",
    filingFrequency: "MONTHLY",
    industry: "Trade",
    address: "Colombo",
    postalCode: "00100",
    contactPhone: "0112345678",
    financeEmail: "finance@acme.lk",
    accountingSystem: "Xero",
    authorisedReviewer: "R Silva",
    ramisConnection: "NOT_CONNECTED",
    ...over,
  }) as unknown as BusinessProfile;

describe("a confirmed registration", () => {
  it("may record VAT, invoice, and be onboarded", () => {
    expect(canOperateVat(profile())).toBe(true);
    expect(vatOperationBlocker(profile())).toBeNull();
  });
});

describe("a status set without the evidence behind it", () => {
  // Setting the dropdown to ACTIVE is a claim that the Department registered
  // this business. On its own it unlocked invoicing and a VAT return.
  const forged = profile({
    vatRegistrationEffectiveDate: "",
    vatRegistrationCertificateRef: "",
  });

  it("is refused", () => {
    expect(canOperateVat(forged)).toBe(false);
  });

  it("says what is missing instead of failing silently", () => {
    expect(vatOperationBlocker(forged)).toMatch(/effective date and the certificate/i);
  });

  it("was already known to be incomplete - the guard just was not asking", () => {
    expect(isProfileComplete(forged)).toBe(false);
  });
});

describe("each piece of evidence is required on its own", () => {
  it("refuses a missing effective date", () => {
    expect(canOperateVat(profile({ vatRegistrationEffectiveDate: "" }))).toBe(false);
  });

  it("refuses a missing certificate reference", () => {
    expect(canOperateVat(profile({ vatRegistrationCertificateRef: "" }))).toBe(false);
  });

  it("refuses a whitespace-only certificate reference", () => {
    expect(canOperateVat(profile({ vatRegistrationCertificateRef: "   " }))).toBe(false);
  });

  it("refuses a TIN that is not nine digits, since the invoice must carry it", () => {
    expect(canOperateVat(profile({ tin: "1234" }))).toBe(false);
    expect(vatOperationBlocker(profile({ tin: "1234" }))).toMatch(/nine-digit TIN/i);
  });
});

describe("a registration that is not active", () => {
  for (const status of ["PENDING", "NOT_SET"] as const) {
    it(`refuses ${status}, even with a certificate on file`, () => {
      expect(canOperateVat(profile({ vatRegistrationStatus: status }))).toBe(false);
      expect(vatOperationBlocker(profile({ vatRegistrationStatus: status }))).toMatch(
        /Confirm the VAT registration/i,
      );
    });
  }
});
