import type { BusinessProfile } from "./workspace";

/** Client-safe readiness check. Keep this module free of Node-only dependencies. */
export function isProfileComplete(profile: BusinessProfile): boolean {
  return Boolean(
    profile.legalName.trim() &&
      profile.entityType &&
      (profile.entityType === "INDIVIDUAL_PROPRIETORSHIP" || profile.businessRegistrationNumber.trim()) &&
      /^\d{9}$/.test(profile.tin.trim()) &&
      profile.irdPinStatus === "ACTIVE" &&
      profile.vatRegistrationStatus === "ACTIVE" &&
      profile.vatRegistrationEffectiveDate &&
      profile.vatRegistrationCertificateRef.trim() &&
      profile.filingFrequency &&
      profile.address.trim() &&
      profile.contactPhone.trim() &&
      profile.financeEmail.trim() &&
      profile.authorisedReviewer.trim(),
  );
}

/**
 * Whether this profile may record VAT, issue a tax invoice, or be marked
 * onboarded to the RAMIS Web API.
 *
 * Registration status alone is not enough. The status is a field a user can
 * set, so on its own it means "someone chose ACTIVE in a dropdown" - not that
 * the Department registered anything. Operating on that would let a business
 * issue tax invoices and build a VAT return with no registration behind it.
 *
 * Evidence of the actual registration is required: the IRD effective date and
 * the certificate or acknowledgement reference the user confirmed, plus a
 * nine-digit TIN to put on the invoice.
 */
export function canOperateVat(profile: BusinessProfile): boolean {
  return Boolean(
    profile.vatRegistrationStatus === "ACTIVE" &&
      profile.vatRegistrationEffectiveDate &&
      profile.vatRegistrationCertificateRef.trim() &&
      /^\d{9}$/.test(profile.tin.trim()),
  );
}

/** Why operating is blocked, for a message the user can act on. */
export function vatOperationBlocker(profile: BusinessProfile): string | null {
  if (profile.vatRegistrationStatus !== "ACTIVE") {
    return "Confirm the VAT registration before recording VAT, issuing invoices, or onboarding to the Web API.";
  }
  if (!profile.vatRegistrationEffectiveDate || !profile.vatRegistrationCertificateRef.trim()) {
    return "Record the IRD effective date and the certificate or acknowledgement reference from your VAT registration before operating on this profile.";
  }
  if (!/^\d{9}$/.test(profile.tin.trim())) {
    return "A nine-digit TIN is required before a tax invoice can carry this business's details.";
  }
  return null;
}
