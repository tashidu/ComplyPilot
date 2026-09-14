/**
 * Decides which side of an invoice the registered entity is on.
 *
 * Nothing on a tax invoice says "this is a sale" or "this is a purchase" - the
 * same document is both, depending on who is reading it. The direction follows
 * from whose TIN sits in the seller field and whose sits in the buyer field,
 * compared against the entity's own registration.
 *
 * Almost everything downstream depends on getting this right:
 *
 *   - A sales invoice carries OUTPUT VAT and belongs in Schedule 01.
 *     A purchase invoice carries INPUT VAT, is what a refund is claimed on,
 *     and belongs in the input schedule.
 *   - The entity may correct and reissue an invoice it issued. It may NOT
 *     rewrite one its supplier issued: that is the supplier's legal document,
 *     and the only honest remedy is to request a corrected one.
 *   - The input tax window runs from the tax invoice date for local purchases
 *     and from the CUSDEC date for imports. It has no meaning for a sale.
 *
 * An invoice where neither party is the entity is not a category to file
 * quietly under "other" - it is a finding. Either the wrong document was
 * uploaded, or someone is about to claim input VAT on a purchase that is not
 * theirs.
 */

export type InvoiceDirection =
  /** The entity issued this invoice. Output VAT. */
  | "SALES"
  /** A supplier issued this to the entity. Input VAT, and refundable. */
  | "PURCHASE"
  /** Neither party is the entity. */
  | "UNRELATED"
  /** The deciding TIN is missing or unreadable. */
  | "UNKNOWN";

export type DirectionVerdict = {
  direction: InvoiceDirection;
  /** Why, in words a reviewer can check against the document. */
  reason: string;
  /** Whether a person must confirm before this invoice is used. */
  needsHuman: boolean;
  /** The IRD schedule this invoice belongs in, once the direction is known. */
  schedule: "OUTPUT" | "INPUT" | null;
  /** Whether the entity may draft a corrected invoice itself. */
  canDraftCorrection: boolean;
  /** Whether input VAT may be claimed from this document. */
  claimsInputVat: boolean;
  /** The counterparty's role, for UI labelling. */
  counterparty: "CUSTOMER" | "SUPPLIER" | null;
};

/**
 * Sri Lankan TINs are nine digits and are often printed with a branch or unit
 * suffix (134857291-7000) or with spaces. Only the nine-digit core identifies
 * the taxpayer, so that is what is compared.
 */
export function normaliseTin(value: string | null | undefined): string | null {
  if (!value) return null;
  const digits = String(value).replace(/\D/g, "");
  if (digits.length < 9) return null;
  return digits.slice(0, 9);
}

export function resolveInvoiceDirection(
  sellerTin: string | null | undefined,
  buyerTin: string | null | undefined,
  entityTin: string | null | undefined,
): DirectionVerdict {
  const seller = normaliseTin(sellerTin);
  const buyer = normaliseTin(buyerTin);
  const entity = normaliseTin(entityTin);

  const unknown = (reason: string): DirectionVerdict => ({
    direction: "UNKNOWN",
    reason,
    needsHuman: true,
    schedule: null,
    canDraftCorrection: false,
    claimsInputVat: false,
    counterparty: null,
  });

  if (!entity) {
    return unknown(
      "The business profile has no readable nine-digit TIN, so this invoice cannot be assigned to a side. Complete the VAT registration details first.",
    );
  }

  const isSeller = seller === entity;
  const isBuyer = buyer === entity;

  if (isSeller && isBuyer) {
    // Self-billing exists, but on a normal invoice this is a transcription
    // error, and treating it as a sale or a purchase would be a guess.
    return unknown(
      "The same TIN appears as both supplier and purchaser. A person must confirm which side this entity is on.",
    );
  }

  if (isSeller) {
    return {
      direction: "SALES",
      reason: `The supplier TIN matches this entity (${entity}), so this is an invoice it issued. The VAT on it is output tax.`,
      needsHuman: false,
      schedule: "OUTPUT",
      // Its own document, so it may be corrected and reissued by an authorised
      // person here.
      canDraftCorrection: true,
      claimsInputVat: false,
      counterparty: "CUSTOMER",
    };
  }

  if (isBuyer) {
    return {
      direction: "PURCHASE",
      reason: `The purchaser TIN matches this entity (${entity}), so a supplier issued this to it. The VAT on it is input tax and may be claimable.`,
      needsHuman: false,
      schedule: "INPUT",
      // The supplier's legal document. It can be asked for a corrected one; it
      // cannot be rewritten here.
      canDraftCorrection: false,
      claimsInputVat: true,
      counterparty: "SUPPLIER",
    };
  }

  if (!seller && !buyer) {
    return unknown(
      "Neither the supplier nor the purchaser TIN could be read from this invoice, so its side cannot be determined.",
    );
  }

  if (!seller || !buyer) {
    const missing = seller ? "purchaser" : "supplier";
    return unknown(
      `The ${missing} TIN is missing, and the TIN that was read does not match this entity. A person must confirm whether this invoice belongs to this business.`,
    );
  }

  return {
    direction: "UNRELATED",
    reason: `Neither the supplier (${seller}) nor the purchaser (${buyer}) is this entity (${entity}). This invoice does not belong to this business, so no input VAT may be claimed on it.`,
    needsHuman: true,
    schedule: null,
    canDraftCorrection: false,
    claimsInputVat: false,
    counterparty: null,
  };
}

/** How the UI should name the document once the direction is known. */
export function directionLabel(direction: InvoiceDirection): string {
  return {
    SALES: "Sales invoice — you issued this",
    PURCHASE: "Purchase invoice — your supplier issued this",
    UNRELATED: "Not this business's invoice",
    UNKNOWN: "Side not yet confirmed",
  }[direction];
}
