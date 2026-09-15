import { describe, expect, it } from "vitest";
import { calculateVat, invoiceSerial, scheduleFor, summariseVatPeriod } from "../lib/vat-operations";
import type { VatTransaction } from "../lib/workspace/workspace";

function transaction(patch: Partial<VatTransaction>): VatTransaction {
  return {
    id: "TX-1", profileId: "BIZ-1", periodId: "P-1", kind: "OUTPUT", treatment: "STANDARD_18", supplyType: "GOODS", invoiceNumber: "26SEP_BR01_1", invoiceDate: "2026-09-15", counterpartyName: "Test", counterpartyTin: "100123456", description: "Taxable goods", netAmountLkr: 1000, vatRate: 18, vatAmountLkr: 180, grossAmountLkr: 1180, disallowedInputVatLkr: 0, scheduleCode: "01", source: "MANUAL", createdAt: "2026-09-15T00:00:00.000Z", ...patch,
  };
}

describe("VAT operations", () => {
  it("calculates standard and zero-rated VAT deterministically", () => {
    expect(calculateVat(10_000, "STANDARD_18")).toEqual({ netAmountLkr: 10_000, vatRate: 18, vatAmountLkr: 1_800, grossAmountLkr: 11_800 });
    expect(calculateVat(10_000, "ZERO_RATED").vatAmountLkr).toBe(0);
  });

  it("subtracts only allowable input VAT from output VAT", () => {
    const summary = summariseVatPeriod([
      transaction({ kind: "OUTPUT", vatAmountLkr: 450 }),
      transaction({ id: "TX-2", kind: "INPUT_LOCAL", vatAmountLkr: 180, disallowedInputVatLkr: 20, scheduleCode: "02" }),
    ]);
    expect(summary.allowableInputVatLkr).toBe(160);
    expect(summary.vatPayableLkr).toBe(290);
  });

  it("maps common records to their preparation schedules", () => {
    expect(scheduleFor("OUTPUT", "STANDARD_18", "GOODS")).toBe("01");
    expect(scheduleFor("INPUT_LOCAL", "STANDARD_18", "GOODS")).toBe("02");
    expect(scheduleFor("INPUT_IMPORT", "STANDARD_18", "GOODS")).toBe("03");
    expect(scheduleFor("OUTPUT", "ZERO_RATED", "GOODS")).toBe("06");
    expect(scheduleFor("OUTPUT", "ZERO_RATED", "SERVICES")).toBe("07");
  });

  it("generates the prescribed invoice serial shape", () => {
    expect(invoiceSerial("2026-09-15", "BR01", 12)).toBe("26SEP_BR01_12");
  });
});
