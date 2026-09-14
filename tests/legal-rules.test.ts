import { describe, expect, it } from "vitest";
import { governmentSources, vatInvoiceRulePack, vatRates } from "../lib/government-data";
import { parseInvoiceDate, selectInvoiceRuleProfile } from "../lib/rules/rule-selection";

/**
 * Legal regression tests.
 *
 * These pin the dated facts the product asserts on screen. If someone edits a
 * gazette date, an effective date or a rate, a test fails and they have to say
 * which official source justified the change.
 */

const sourceById = (id: string) => governmentSources.find((source) => source.id === id);

describe("government source metadata", () => {
  it("dates Circular SEC/2025/E/06 as published on 19 November 2025", () => {
    // The IRD circulars listing shows "Circular No. SEC/2025/E/06 [19.11.2025]".
    // 2025-09-22 belongs to notice PN/SVAT/2025-01, not to this circular.
    const circular = sourceById("IRD-RBRS-CIRCULAR");
    expect(circular?.publicationDate).toBe("2025-11-19");
  });

  it("records a verification trail for any corrected legal metadata", () => {
    const circular = sourceById("IRD-RBRS-CIRCULAR") as Record<string, any>;
    expect(circular.verification?.sourceUrl).toContain("ird.gov.lk");
    expect(circular.verification?.verifiedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("keeps the revised invoice format effective from 1 October 2026", () => {
    // Gazette 2500/106 moved this date from 1 July 2026; the specification
    // itself was unchanged.
    expect(sourceById("GZ-2500-106")?.effectiveFrom).toBe("2026-10-01");
    expect(sourceById("GZ-2481-22")?.effectiveFrom).toBe("2026-10-01");
    expect(vatInvoiceRulePack.effectiveFrom).toBe("2026-10-01");
  });

  it("cites both the specifying and the amending gazette", () => {
    expect(vatInvoiceRulePack.sourceIds).toContain("GZ-2481-22");
    expect(vatInvoiceRulePack.sourceIds).toContain("GZ-2500-106");
  });

  it("gives every source an id, authority, url and verification date", () => {
    for (const source of governmentSources) {
      expect(source.id, `${source.id} id`).toBeTruthy();
      expect(source.authority, `${source.id} authority`).toBeTruthy();
      expect(source.url, `${source.id} url`).toMatch(/^https:\/\//);
      expect(source.lastVerifiedAt, `${source.id} lastVerifiedAt`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("distinguishes publication date from effective date", () => {
    // A source may be published before it takes effect. Conflating the two is
    // the mistake this suite exists to catch.
    const gazette = sourceById("GZ-2500-106");
    expect(gazette?.publicationDate).not.toBe(gazette?.effectiveFrom);
  });
});

describe("VAT rates", () => {
  it("holds the standard rate at 18% from 1 January 2024", () => {
    const standard = vatRates.rates.find((rate: any) => rate.id === "standard");
    expect(standard?.ratePercent).toBe(18);
    expect(standard?.effectiveFrom).toBe("2024-01-01");
  });

  it("keeps qualifying exports zero-rated", () => {
    const zero = vatRates.rates.find((rate: any) => rate.id === "zero-export");
    expect(zero?.ratePercent).toBe(0);
  });

  it("marks a rate suggestion as advisory until a human confirms it", () => {
    expect(vatRates.guardrail).toMatch(/advisory/i);
  });
});

describe("rule profile selected from the invoice date", () => {
  it("does not apply the revised format to an invoice dated 20 September 2026", () => {
    const selection = selectInvoiceRuleProfile("2026-09-20");
    expect(selection.profile).toBe("historical");
    expect(selection.futureRules).toBe(false);
    expect(selection.reason).toContain("not yet mandatory");
  });

  it("applies the revised format to an invoice dated 10 October 2026", () => {
    const selection = selectInvoiceRuleProfile("2026-10-10");
    expect(selection.profile).toBe("v2026.10");
    expect(selection.futureRules).toBe(true);
  });

  it("treats the effective date itself as in scope", () => {
    expect(selectInvoiceRuleProfile("2026-10-01").profile).toBe("v2026.10");
    expect(selectInvoiceRuleProfile("2026-09-30").profile).toBe("historical");
  });

  it("accepts the MM/DD/YYYY form the rule pack validates", () => {
    expect(selectInvoiceRuleProfile("10/10/2026").profile).toBe("v2026.10");
    expect(selectInvoiceRuleProfile("09/20/2026").profile).toBe("historical");
  });

  it("never asserts the later format when the date is missing or unreadable", () => {
    expect(selectInvoiceRuleProfile(null).profile).toBe("historical");
    expect(selectInvoiceRuleProfile("not a date").profile).toBe("historical");
    expect(selectInvoiceRuleProfile("02/31/2026").profile).toBe("historical");
    expect(selectInvoiceRuleProfile("not a date").reason).toMatch(/could not be read/);
  });

  it("labels a reviewer override as a what-if rather than the rule in force", () => {
    const selection = selectInvoiceRuleProfile("2026-09-20", "v2026.10");
    expect(selection.profile).toBe("v2026.10");
    expect(selection.overriddenFrom).toBe("historical");
    expect(selection.reason).toMatch(/what-if/);
  });

  it("does not mark a matching choice as an override", () => {
    const selection = selectInvoiceRuleProfile("2026-10-10", "v2026.10");
    expect(selection.overriddenFrom).toBeNull();
    expect(selection.reason).not.toMatch(/what-if/);
  });
});

describe("date parsing", () => {
  it("rejects impossible calendar dates", () => {
    expect(parseInvoiceDate("02/31/2026")).toBeNull();
    expect(parseInvoiceDate("13/01/2026")).toBeNull();
    expect(parseInvoiceDate("")).toBeNull();
  });
});
