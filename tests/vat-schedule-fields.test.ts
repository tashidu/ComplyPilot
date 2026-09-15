import { describe, expect, it } from "vitest";
import { collectedFields, SCHEDULE_CODES, SCHEDULE_SPECS, scheduleHeaders, scheduleSpec } from "../lib/vat-schedule-fields";
import { buildOfficialScheduleCsv, scheduleRowGaps } from "../lib/vat-schedule-export";
import type { VatScheduleDetail, VatTransaction } from "../lib/workspace/workspace";

function transaction(patch: Partial<VatTransaction>): VatTransaction {
  return {
    id: "T1", profileId: "P1", periodId: "PER", kind: "OUTPUT", treatment: "STANDARD_18", supplyType: "GOODS",
    invoiceNumber: "26OCT_BR01_1", invoiceDate: "2026-10-05", counterpartyName: "Lanka Foods",
    counterpartyTin: "200987654", description: "Goods", netAmountLkr: 100_000, vatRate: 18,
    vatAmountLkr: 18_000, grossAmountLkr: 118_000, disallowedInputVatLkr: 0, scheduleCode: "01",
    source: "MANUAL", createdAt: "", ...patch,
  };
}

const detail = (transactionId: string, code: VatScheduleDetail["code"], values: Record<string, string>): VatScheduleDetail =>
  ({ transactionId, code, values, updatedAt: "2026-10-20T00:00:00.000Z" });

const rows = (csv: string) => csv.split("\r\n");

describe("the schedule column specs", () => {
  it("covers all seven VAT schedules", () => {
    expect(SCHEDULE_CODES).toEqual(["01", "02", "03", "04", "05", "06", "07"]);
  });

  it("keeps the 01 and 02 headers exactly as the IRD verifier holds them", () => {
    // These two were the pre-existing, separately verified layouts. Moving them
    // into the spec must not have altered a character.
    expect(scheduleHeaders("01")).toEqual([
      "Serial No", "Invoice Date", "Tax Invoice No", "Purchaser's TIN",
      "Name of the Purchaser", "Description", "Value of supply", "VAT Amount",
    ]);
    expect(scheduleHeaders("02")).toEqual([
      "Serial No", "Invoice Date", "Tax Invoice No", "Supplier's TIN",
      "Name of the Supplier", "Description", "Value of purchase", "VAT Amount", "Disallowed VAT Amount",
    ]);
  });

  it("asks for nothing extra on the two schedules the ledger fully answers", () => {
    expect(collectedFields("01")).toEqual([]);
    expect(collectedFields("02")).toEqual([]);
  });

  it("marks the schedules whose subject the ledger does not model", () => {
    expect(SCHEDULE_SPECS["04"].supported).toBe(false);
    expect(SCHEDULE_SPECS["05"].supported).toBe(false);
    for (const code of ["01", "02", "03", "06", "07"] as const) {
      expect(SCHEDULE_SPECS[code].supported).toBe(true);
    }
  });

  it("gives every collected field a hint, since it becomes the question put to a user", () => {
    for (const code of SCHEDULE_CODES) {
      for (const field of collectedFields(code)) {
        expect(field.hint.length, `${code}/${field.key}`).toBeGreaterThan(10);
      }
    }
  });

  it("does not reuse one key for two different columns in a schedule", () => {
    for (const code of SCHEDULE_CODES) {
      const keys = collectedFields(code).map((field) => field.key);
      expect(new Set(keys).size, code).toBe(keys.length);
    }
  });

  it("refuses an unknown schedule code", () => {
    expect(() => scheduleSpec("09" as never)).toThrow(/Unknown VAT schedule/);
  });
});

describe("what the user still has to supply", () => {
  const anImport = transaction({ id: "IMP", kind: "INPUT_IMPORT", scheduleCode: "03", invoiceNumber: "IMP-1", disallowedInputVatLkr: 500 });

  it("reports nothing for a schedule the ledger answers on its own", () => {
    expect(scheduleRowGaps([transaction({})], "01")).toEqual([]);
  });

  it("names every required customs fact an import row is missing", () => {
    const gaps = scheduleRowGaps([anImport], "03");
    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toMatchObject({ transactionId: "IMP", rowNumber: 1, invoiceNumber: "IMP-1" });
    expect(gaps[0].missing.map((field) => field.key).sort()).toEqual([
      "cusdecDate", "cusdecNo", "cusdecOfficeId", "cusdecRegDate", "cusdecSerialId", "vatDeferred", "vatUpfront",
    ]);
  });

  it("stops reporting a field once it has been supplied", () => {
    const details = [detail("IMP", "03", { cusdecNo: "CUS-5501", cusdecDate: "2026-10-02" })];
    const missing = scheduleRowGaps([anImport], "03", details)[0].missing.map((field) => field.key);
    expect(missing).not.toContain("cusdecNo");
    expect(missing).not.toContain("cusdecDate");
    expect(missing).toContain("cusdecOfficeId");
  });

  it("clears the row entirely once every required field is in", () => {
    const details = [detail("IMP", "03", {
      cusdecDate: "2026-10-02", cusdecNo: "CUS-5501", vatDeferred: "0", vatUpfront: "18000",
      cusdecSerialId: "S-99", cusdecOfficeId: "OF-1", cusdecRegDate: "2026-10-03",
    })];
    expect(scheduleRowGaps([anImport], "03", details)).toEqual([]);
  });

  it("treats a blank string as still missing", () => {
    const details = [detail("IMP", "03", { cusdecNo: "   " })];
    expect(scheduleRowGaps([anImport], "03", details)[0].missing.map((f) => f.key)).toContain("cusdecNo");
  });

  it("does not hold a filing for an optional field", () => {
    // NRFC account is optional: an export not settled through one must still file.
    const exportRow = transaction({ id: "EXP", treatment: "ZERO_RATED", scheduleCode: "06" });
    const details = [detail("EXP", "06", {
      exportDate: "2026-10-04", cusdecNo: "CUS-7", cusdecOfficeId: "OF-2", cusdecSerialId: "S-7",
      paymentDate: "2026-10-20", netMassKg: "1250", fobCifValue: "900000",
    })];
    expect(scheduleRowGaps([exportRow], "06", details)).toEqual([]);
  });

  it("keeps details for one schedule out of another", () => {
    // The same transaction can appear in two schedules wanting different facts.
    const details = [detail("IMP", "06", { cusdecNo: "WRONG-SCHEDULE" })];
    expect(scheduleRowGaps([anImport], "03", details)[0].missing.map((f) => f.key)).toContain("cusdecNo");
  });
});

describe("building a schedule from the spec", () => {
  it("writes collected values into their columns, dates in the IRD shape", () => {
    const anImport = transaction({ id: "IMP", kind: "INPUT_IMPORT", scheduleCode: "03", disallowedInputVatLkr: 500 });
    const details = [detail("IMP", "03", {
      cusdecDate: "2026-10-02", cusdecNo: "CUS-5501", vatDeferred: "0", vatUpfront: "18000",
      cusdecSerialId: "S-99", cusdecOfficeId: "OF-1", cusdecRegDate: "2026-10-03",
    })];
    const csv = buildOfficialScheduleCsv([anImport], "03", details);
    expect(rows(csv)[0]).toBe("Serial No,Cusdec Date,Cusdec No,VAT Deferred,VAT Upfront,Disallowed VAT,Cusdec Serial ID,Cusdec Office ID,Cusdec Reg Date");
    expect(rows(csv)[1]).toBe("1,10/02/2026,CUS-5501,0,18000,500.00,S-99,OF-1,10/03/2026");
  });

  it("leaves a column blank rather than inventing a value that was not supplied", () => {
    const anImport = transaction({ id: "IMP", kind: "INPUT_IMPORT", scheduleCode: "03" });
    const csv = buildOfficialScheduleCsv([anImport], "03");
    expect(rows(csv)[1]).toBe("1,,,,,0.00,,,");
  });

  it("still produces 01 and 02 exactly as before the spec existed", () => {
    const csv = buildOfficialScheduleCsv([transaction({})], "01");
    expect(rows(csv)[1]).toBe("1,10/05/2026,26OCT_BR01_1,200987654,Lanka Foods,Goods,100000.00,18000.00");
  });

  it("does not round a figure the user read off a document", () => {
    // An exchange rate carries more than two decimals and a net mass is not
    // money. Formatting them like currency would misstate the CUSDEC.
    const service = transaction({ id: "SVC", treatment: "ZERO_RATED", supplyType: "SERVICES", scheduleCode: "07", netAmountLkr: 302_456 });
    const details = [detail("SVC", "07", { foreignValue: "1000", exchangeRate: "302.4567" })];
    expect(rows(buildOfficialScheduleCsv([service], "07", details))[1]).toContain("302.4567");
  });

  it("puts the foreign figures on a service export beside the rupee value", () => {
    const service = transaction({ id: "SVC", treatment: "ZERO_RATED", supplyType: "SERVICES", scheduleCode: "07", description: "Software consulting", netAmountLkr: 300_000 });
    const details = [detail("SVC", "07", { foreignValue: "1000", exchangeRate: "300" })];
    const csv = buildOfficialScheduleCsv([service], "07", details);
    expect(rows(csv)[0]).toBe("Serial No,Invoice date,Description of Service,Invoice Value (Foreign currency value),Exchange rate,Rupee Value (Rs.)");
    expect(rows(csv)[1]).toBe("1,10/05/2026,Software consulting,1000,300,300000.00");
  });

  it("returns a header-only file for a schedule nothing maps to", () => {
    expect(rows(buildOfficialScheduleCsv([transaction({})], "04"))).toHaveLength(1);
  });
});
