import { describe, expect, it } from "vitest";
import {
  STANDARD_VAT_RATE,
  calculateVat,
  roundMoney,
  summariseVatPeriod,
  totalInvoiceLines,
} from "../lib/vat-operations";

/**
 * Money arithmetic. Every figure here is one a tax reviewer can recompute by
 * hand, so a cent of drift is a defect, not a rounding detail.
 */

const line = (net: number) => calculateVat(net, "STANDARD_18");
const isWholeCents = (v: number) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-9;

describe("the standard rate", () => {
  it("is 18%", () => {
    expect(STANDARD_VAT_RATE).toBe(18);
    expect(calculateVat(1000, "STANDARD_18").vatAmountLkr).toBe(180);
  });

  it("charges nothing on zero-rated, exempt and out-of-scope supplies", () => {
    for (const treatment of ["ZERO_RATED", "EXEMPT", "OUT_OF_SCOPE"] as const) {
      expect(calculateVat(1000, treatment).vatAmountLkr).toBe(0);
      expect(calculateVat(1000, treatment).grossAmountLkr).toBe(1000);
    }
  });

  it("never returns a negative net", () => {
    expect(calculateVat(-500, "STANDARD_18").netAmountLkr).toBe(0);
  });
});

describe("rounding", () => {
  it("keeps whole cents", () => {
    expect(roundMoney(30.000000000000156)).toBe(30);
    expect(roundMoney(5.99999999999996)).toBe(6);
    expect(roundMoney(1234.567)).toBe(1234.57);
  });

  it("holds net + VAT === gross for every cent up to LKR 2,000", () => {
    // Every one of the 200,001 cases is still checked. What changed is that
    // they are asserted in bulk: calling expect() per case costs far more than
    // the arithmetic under test and pushed this past the default timeout once
    // the suite grew. Failures are collected with their input, so a regression
    // still names the cent that broke it.
    const failures: string[] = [];
    for (let cents = 0; cents <= 200_000 && failures.length < 5; cents++) {
      const r = line(cents / 100);
      if (roundMoney(r.netAmountLkr + r.vatAmountLkr) !== r.grossAmountLkr) {
        failures.push(`${cents}c: net ${r.netAmountLkr} + VAT ${r.vatAmountLkr} !== gross ${r.grossAmountLkr}`);
      }
      if (!isWholeCents(r.vatAmountLkr)) {
        failures.push(`${cents}c: VAT ${r.vatAmountLkr} is not a whole number of cents`);
      }
    }
    expect(failures).toEqual([]);
  });
});

describe("invoice totals", () => {
  it("foots: the stated VAT is the tax on the stated net", () => {
    // Two lines whose per-line VAT each round to zero. Summing them states
    // LKR 0.00 of VAT on a net of LKR 0.03, which a reviewer recomputes as
    // LKR 0.01 and queries.
    const lines = [line(0.01), line(0.02)];
    const totals = totalInvoiceLines(lines, "STANDARD_18");

    expect(totals.netTotalLkr).toBe(0.03);
    expect(totals.vatTotalLkr).toBe(0.01);
    expect(lines.reduce((s, l) => s + l.vatAmountLkr, 0)).toBe(0); // the old way
  });

  it("stores whole cents, not drifted doubles", () => {
    const many = Array.from({ length: 300 }, () => line(0.1));
    const totals = totalInvoiceLines(many, "STANDARD_18");
    // The raw reduce left 30.000000000000156 here.
    expect(totals.netTotalLkr).toBe(30);
    expect(isWholeCents(totals.netTotalLkr)).toBe(true);
    // 18% of the 30.00 net. Summing the per-line VAT instead would state 6.00,
    // sixty cents more than the tax actually due on the stated net.
    expect(totals.vatTotalLkr).toBe(5.4);
    expect(many.reduce((sum, l) => sum + l.vatAmountLkr, 0)).toBeCloseTo(6, 2);
  });

  it("always satisfies net + VAT === gross", () => {
    const cases = [[0.01, 0.02], [33.33, 1.11, 0.07], [999.99], [0.01], [12.5, 12.5]];
    for (const nets of cases) {
      const totals = totalInvoiceLines(nets.map(line), "STANDARD_18");
      expect(roundMoney(totals.netTotalLkr + totals.vatTotalLkr)).toBe(totals.grossTotalLkr);
    }
  });

  it("charges no VAT on a zero-rated invoice", () => {
    const totals = totalInvoiceLines([line(100), line(250)], "ZERO_RATED");
    expect(totals.vatTotalLkr).toBe(0);
    expect(totals.grossTotalLkr).toBe(totals.netTotalLkr);
  });

  it("totals an empty invoice to zero rather than NaN", () => {
    expect(totalInvoiceLines([], "STANDARD_18")).toEqual({
      netTotalLkr: 0,
      vatTotalLkr: 0,
      grossTotalLkr: 0,
    });
  });
});

describe("the period position", () => {
  const txn = (kind: string, vat: number, disallowed = 0) =>
    ({ kind, vatAmountLkr: vat, disallowedInputVatLkr: disallowed }) as never;

  it("owes the difference when output VAT exceeds input", () => {
    const s = summariseVatPeriod([txn("OUTPUT", 500), txn("INPUT_LOCAL", 200)]);
    expect(s.vatPayableLkr).toBe(300);
    expect(s.excessInputCreditLkr).toBe(0);
  });

  it("carries an excess credit when input VAT exceeds output - the refund case", () => {
    const s = summariseVatPeriod([txn("OUTPUT", 200), txn("INPUT_LOCAL", 500)]);
    expect(s.vatPayableLkr).toBe(0);
    expect(s.excessInputCreditLkr).toBe(300);
  });

  it("settles to exactly zero when they match, across many small lines", () => {
    // Drift used to leave a non-zero balance here, which reads as owing tax on
    // a period that is square.
    const each = line(0.1).vatAmountLkr;
    const txns = [
      ...Array.from({ length: 300 }, () => txn("OUTPUT", each)),
      ...Array.from({ length: 300 }, () => txn("INPUT_LOCAL", each)),
    ];
    const s = summariseVatPeriod(txns);
    // Each transaction's VAT is already its own rounded figure (0.10 -> 0.02),
    // so a period legitimately sums them: 300 x 0.02 = 6.00.
    expect(s.outputVatLkr).toBe(6);
    expect(s.inputVatLkr).toBe(6);
    expect(s.vatPayableLkr).toBe(0);
    expect(s.excessInputCreditLkr).toBe(0);
  });

  it("removes disallowed input VAT from the claim", () => {
    const s = summariseVatPeriod([txn("OUTPUT", 100), txn("INPUT_LOCAL", 400, 150)]);
    expect(s.disallowedInputVatLkr).toBe(150);
    expect(s.allowableInputVatLkr).toBe(250);
    expect(s.excessInputCreditLkr).toBe(150);
  });

  it("never disallows more than the VAT on the line", () => {
    const s = summariseVatPeriod([txn("INPUT_LOCAL", 100, 999)]);
    expect(s.disallowedInputVatLkr).toBe(100);
    expect(s.allowableInputVatLkr).toBe(0);
  });

  it("treats a missing disallowed figure as nothing disallowed, not NaN", () => {
    const s = summariseVatPeriod([{ kind: "INPUT_LOCAL", vatAmountLkr: 90 } as never]);
    expect(s.disallowedInputVatLkr).toBe(0);
    expect(s.allowableInputVatLkr).toBe(90);
  });
});
