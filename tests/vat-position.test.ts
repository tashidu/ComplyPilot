import { describe, expect, it } from "vitest";
import { calculateVat, resolveTransactionVat, scheduleFor, summariseVatPeriod } from "../lib/vat-operations";

/**
 * The period position: output VAT less allowable input VAT.
 *
 * These are the figures that become a VAT return, so each one is written the
 * way a reviewer would check it by hand.
 */

const txn = (
  kind: "OUTPUT" | "INPUT_LOCAL" | "INPUT_IMPORT",
  net: number,
  treatment: "STANDARD_18" | "ZERO_RATED" | "EXEMPT" | "OUT_OF_SCOPE" = "STANDARD_18",
  disallowed = 0,
) => ({ kind, ...calculateVat(net, treatment), disallowedInputVatLkr: disallowed }) as never;

describe("a trader who owes VAT", () => {
  it("pays the difference between what it charged and what it was charged", () => {
    // Sold 1,000,000 + VAT; bought 600,000 + VAT.
    const s = summariseVatPeriod([txn("OUTPUT", 1_000_000), txn("INPUT_LOCAL", 600_000)]);
    expect(s.outputVatLkr).toBe(180_000);
    expect(s.inputVatLkr).toBe(108_000);
    expect(s.vatPayableLkr).toBe(72_000);
    expect(s.excessInputCreditLkr).toBe(0);
  });
});

describe("a business whose sales are zero-rated", () => {
  it("charges no output VAT but still recovers its input VAT - the refund case", () => {
    // This is the whole reason the product exists: exports carry 0% output
    // VAT, the business still pays 18% on what it buys, and the difference
    // comes back as a refund.
    const s = summariseVatPeriod([
      txn("OUTPUT", 5_000_000, "ZERO_RATED"),
      txn("INPUT_LOCAL", 3_000_000),
    ]);
    expect(s.outputVatLkr).toBe(0);
    expect(s.inputVatLkr).toBe(540_000);
    expect(s.vatPayableLkr).toBe(0);
    expect(s.excessInputCreditLkr).toBe(540_000);
  });
});

describe("input VAT that cannot be claimed", () => {
  it("is removed from the claim before the position is struck", () => {
    // Input VAT attributable to exempt supplies, or otherwise disallowed, is
    // apportioned out by the preparer.
    const s = summariseVatPeriod([
      txn("OUTPUT", 1_000_000),
      txn("INPUT_LOCAL", 600_000, "STANDARD_18", 40_000),
    ]);
    expect(s.inputVatLkr).toBe(108_000);
    expect(s.disallowedInputVatLkr).toBe(40_000);
    expect(s.allowableInputVatLkr).toBe(68_000);
    expect(s.vatPayableLkr).toBe(112_000);
  });

  it("cannot exceed the VAT on the line it belongs to", () => {
    const s = summariseVatPeriod([txn("INPUT_LOCAL", 100_000, "STANDARD_18", 999_999)]);
    expect(s.disallowedInputVatLkr).toBe(18_000);
    expect(s.allowableInputVatLkr).toBe(0);
  });
});

describe("purchases that carry no VAT", () => {
  it("add nothing to the claim", () => {
    for (const treatment of ["ZERO_RATED", "EXEMPT", "OUT_OF_SCOPE"] as const) {
      const s = summariseVatPeriod([txn("OUTPUT", 100_000), txn("INPUT_LOCAL", 50_000, treatment)]);
      expect(s.inputVatLkr).toBe(0);
      expect(s.vatPayableLkr).toBe(18_000);
    }
  });
});

describe("imports", () => {
  it("count as input VAT alongside local purchases", () => {
    const s = summariseVatPeriod([
      txn("OUTPUT", 1_000_000),
      txn("INPUT_LOCAL", 200_000),
      txn("INPUT_IMPORT", 300_000),
    ]);
    expect(s.inputVatLkr).toBe(90_000); // 36,000 + 54,000
    expect(s.vatPayableLkr).toBe(90_000);
  });
});

describe("schedule mapping", () => {
  it("puts standard-rated sales on Schedule 01", () => {
    expect(scheduleFor("OUTPUT", "STANDARD_18", "GOODS")).toBe("01");
  });

  it("separates local purchases from imports", () => {
    expect(scheduleFor("INPUT_LOCAL", "STANDARD_18", "GOODS")).toBe("02");
    expect(scheduleFor("INPUT_IMPORT", "STANDARD_18", "GOODS")).toBe("03");
  });

  it("splits zero-rated sales by goods and services", () => {
    expect(scheduleFor("OUTPUT", "ZERO_RATED", "GOODS")).toBe("06");
    expect(scheduleFor("OUTPUT", "ZERO_RATED", "SERVICES")).toBe("07");
  });

  it("classifies an import by its kind, not its rate", () => {
    // An import is Schedule 03 whatever its treatment; the zero-rated branch
    // must not capture it.
    expect(scheduleFor("INPUT_IMPORT", "ZERO_RATED", "GOODS")).toBe("03");
  });
});

describe("an empty period", () => {
  it("is nil, not NaN", () => {
    const s = summariseVatPeriod([]);
    expect(s.outputVatLkr).toBe(0);
    expect(s.vatPayableLkr).toBe(0);
    expect(s.excessInputCreditLkr).toBe(0);
    expect(s.transactionCount).toBe(0);
  });
});

describe("where a purchase's VAT figure comes from", () => {
  it("claims what the supplier charged, not a recomputed 18%", () => {
    // The supplier rounded per line and stated 0.00; recomputing the net gives
    // 0.01. Claiming 0.01 would claim a cent the invoice does not evidence.
    const r = resolveTransactionVat({
      kind: "INPUT_LOCAL",
      netAmountLkr: 0.03,
      treatment: "STANDARD_18",
      statedVatAmountLkr: 0,
    });
    expect(r.vatAmountLkr).toBe(0);
    expect(r.statedVatVariance).toEqual({ expectedLkr: 0.01, statedLkr: 0, differenceLkr: -0.01 });
  });

  it("reports a supplier who charged the wrong rate instead of overwriting it", () => {
    const r = resolveTransactionVat({
      kind: "INPUT_LOCAL",
      netAmountLkr: 100_000,
      treatment: "STANDARD_18",
      statedVatAmountLkr: 15_000,
    });
    expect(r.vatAmountLkr).toBe(15_000); // only what was actually charged
    expect(r.statedVatVariance?.expectedLkr).toBe(18_000);
    expect(r.statedVatVariance?.differenceLkr).toBe(-3_000);
  });

  it("raises no variance when the supplier charged exactly the expected tax", () => {
    const r = resolveTransactionVat({
      kind: "INPUT_LOCAL",
      netAmountLkr: 100_000,
      treatment: "STANDARD_18",
      statedVatAmountLkr: 18_000,
    });
    expect(r.statedVatVariance).toBeNull();
  });

  it("computes the VAT on a sale, because the business is the issuer", () => {
    // A stated amount is ignored on output: it is our own invoice to get right.
    const r = resolveTransactionVat({
      kind: "OUTPUT",
      netAmountLkr: 100_000,
      treatment: "STANDARD_18",
      statedVatAmountLkr: 1,
    });
    expect(r.vatAmountLkr).toBe(18_000);
    expect(r.statedVatVariance).toBeNull();
  });

  it("falls back to the computed tax when no figure was captured", () => {
    const r = resolveTransactionVat({
      kind: "INPUT_LOCAL",
      netAmountLkr: 100_000,
      treatment: "STANDARD_18",
      statedVatAmountLkr: null,
    });
    expect(r.vatAmountLkr).toBe(18_000);
    expect(r.statedVatVariance).toBeNull();
  });
});
