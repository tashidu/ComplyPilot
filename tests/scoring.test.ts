import { describe, expect, it } from "vitest";
import { SCORE_CONFIG, calculateClaimValue, calculateReadiness } from "../lib/rules/scoring";
import type { Finding } from "../lib/types";

/**
 * The readiness score is the number a judge is most likely to check by hand.
 * These tests pin the published progression so a scoring change cannot land
 * silently.
 */

const finding = (id: string, status: Finding["status"], lkr = 0): Finding =>
  ({ id, status, amountLkrM: lkr }) as Finding;

const OPEN_THREE = [
  finding("invoice", "open", 1.4),
  finding("supplier", "open", 1.9),
  finding("customs", "open", 0.9),
];

describe("readiness score", () => {
  it("starts the demo case at 68", () => {
    expect(calculateReadiness(OPEN_THREE).total).toBe(68);
  });

  it("reaches 89 - not 100 - when all three are resolved", () => {
    const resolved = OPEN_THREE.map((f) => ({ ...f, status: "resolved" as const }));
    expect(calculateReadiness(resolved).total).toBe(89);
  });

  it("follows the published progression as blockers are resolved one by one", () => {
    const resolve = (...ids: string[]) =>
      calculateReadiness(
        OPEN_THREE.map((f) => (ids.includes(f.id) ? { ...f, status: "resolved" as const } : f)),
      ).total;

    expect(resolve("supplier")).toBe(78);
    expect(resolve("supplier", "customs")).toBe(85);
    expect(resolve("supplier", "customs", "invoice")).toBe(89);
  });

  it("never exceeds the sum of the component maxima", () => {
    const max = Object.values(SCORE_CONFIG).reduce((sum, c) => sum + c.max, 0);
    const allResolved = [...OPEN_THREE, finding("schedule", "open")].map((f) => ({
      ...f,
      status: "resolved" as const,
    }));
    expect(calculateReadiness(allResolved).total).toBeLessThanOrEqual(max);
  });

  it("treats an inactive invoice check as satisfying document completeness", () => {
    // Under the historical profile the later format is not in force, so the
    // check is inactive rather than failed.
    const findings = OPEN_THREE.map((f) =>
      f.id === "invoice" ? { ...f, status: "inactive" as const } : f,
    );
    expect(calculateReadiness(findings).components.document).toBe(
      SCORE_CONFIG.document.base + 4,
    );
  });

  it("withholds the schedule points unless the schedule actually matched", () => {
    // An uploaded schedule that is still waiting for an invoice must not earn
    // the matched-schedule award, however the finding is marked.
    const awaiting = [...OPEN_THREE, finding("schedule", "inactive")];
    const matched = [...OPEN_THREE, finding("schedule", "resolved")];
    expect(calculateReadiness(matched).total - calculateReadiness(awaiting).total).toBe(3);
  });

  it("is a pure function of the findings", () => {
    const once = calculateReadiness(OPEN_THREE);
    const twice = calculateReadiness(OPEN_THREE);
    expect(once).toEqual(twice);
    expect(OPEN_THREE[0].status).toBe("open"); // input not mutated
  });
});

describe("claim value at risk", () => {
  it("counts only evidence that is still open", () => {
    expect(calculateClaimValue(OPEN_THREE)).toBeCloseTo(4.2, 5);
  });

  it("falls to zero once everything is resolved", () => {
    const resolved = OPEN_THREE.map((f) => ({ ...f, status: "resolved" as const }));
    expect(calculateClaimValue(resolved)).toBe(0);
  });

  it("ignores inactive checks, which carry no exposure", () => {
    const findings = OPEN_THREE.map((f) =>
      f.id === "supplier" ? { ...f, status: "inactive" as const } : f,
    );
    expect(calculateClaimValue(findings)).toBeCloseTo(2.3, 5);
  });
});
