import { describe, expect, it } from "vitest";
import {
  normaliseTin,
  resolveInvoiceDirection,
} from "../lib/rules/invoice-direction";

const ENTITY = "134857291";

describe("TIN normalisation", () => {
  it("keeps the nine-digit core, ignoring a branch suffix", () => {
    expect(normaliseTin("134857291-7000")).toBe(ENTITY);
    expect(normaliseTin("134 857 291")).toBe(ENTITY);
    expect(normaliseTin("134857291")).toBe(ENTITY);
  });

  it("rejects anything shorter than a TIN rather than guessing", () => {
    expect(normaliseTin("1234")).toBeNull();
    expect(normaliseTin("")).toBeNull();
    expect(normaliseTin(null)).toBeNull();
  });
});

describe("an invoice the business issued", () => {
  const verdict = resolveInvoiceDirection(ENTITY, "987654321", ENTITY);

  it("is a sale carrying output VAT", () => {
    expect(verdict.direction).toBe("SALES");
    expect(verdict.schedule).toBe("OUTPUT");
    expect(verdict.claimsInputVat).toBe(false);
    expect(verdict.counterparty).toBe("CUSTOMER");
  });

  it("may be corrected here, because it is the entity's own document", () => {
    expect(verdict.canDraftCorrection).toBe(true);
  });

  it("matches even when the invoice prints a branch suffix", () => {
    expect(resolveInvoiceDirection("134857291-7000", "987654321", ENTITY).direction).toBe(
      "SALES",
    );
  });
});

describe("an invoice a supplier issued to the business", () => {
  const verdict = resolveInvoiceDirection("987654321", ENTITY, ENTITY);

  it("is a purchase carrying claimable input VAT", () => {
    expect(verdict.direction).toBe("PURCHASE");
    expect(verdict.schedule).toBe("INPUT");
    expect(verdict.claimsInputVat).toBe(true);
    expect(verdict.counterparty).toBe("SUPPLIER");
  });

  it("must never be rewritten here - the supplier owns that document", () => {
    // Correcting a supplier's legally issued invoice on their behalf is the
    // single most damaging thing this product could get wrong.
    expect(verdict.canDraftCorrection).toBe(false);
  });
});

describe("an invoice that belongs to neither side", () => {
  const verdict = resolveInvoiceDirection("111111111", "222222222", ENTITY);

  it("is reported rather than filed quietly as other", () => {
    expect(verdict.direction).toBe("UNRELATED");
    expect(verdict.needsHuman).toBe(true);
  });

  it("can never be used to claim input VAT", () => {
    expect(verdict.claimsInputVat).toBe(false);
    expect(verdict.schedule).toBeNull();
    expect(verdict.reason).toMatch(/no input VAT may be claimed/i);
  });
});

describe("cases a person has to settle", () => {
  it("stops when the same TIN is on both sides", () => {
    const verdict = resolveInvoiceDirection(ENTITY, ENTITY, ENTITY);
    expect(verdict.direction).toBe("UNKNOWN");
    expect(verdict.needsHuman).toBe(true);
  });

  it("stops when neither TIN could be read", () => {
    expect(resolveInvoiceDirection(null, null, ENTITY).direction).toBe("UNKNOWN");
  });

  it("stops when the one readable TIN is not this entity", () => {
    // Could be a purchase whose buyer TIN was missed by extraction, or a
    // document that is not theirs. Guessing either way is wrong.
    const verdict = resolveInvoiceDirection("987654321", null, ENTITY);
    expect(verdict.direction).toBe("UNKNOWN");
    expect(verdict.reason).toMatch(/purchaser TIN is missing/i);
  });

  it("stops when the business profile has no TIN yet", () => {
    const verdict = resolveInvoiceDirection(ENTITY, "987654321", null);
    expect(verdict.direction).toBe("UNKNOWN");
    expect(verdict.reason).toMatch(/business profile has no readable/i);
  });

  it("never claims input VAT on anything unconfirmed", () => {
    const unconfirmed = [
      resolveInvoiceDirection(ENTITY, ENTITY, ENTITY),
      resolveInvoiceDirection(null, null, ENTITY),
      resolveInvoiceDirection("987654321", null, ENTITY),
      resolveInvoiceDirection(ENTITY, "987654321", null),
    ];
    expect(unconfirmed.every((v) => v.claimsInputVat === false)).toBe(true);
    expect(unconfirmed.every((v) => v.canDraftCorrection === false)).toBe(true);
  });
});
