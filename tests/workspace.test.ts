import { describe, expect, it } from "vitest";
import { runOrchestrator } from "../lib/workflows/orchestrator";
import { normaliseWorkspace } from "../lib/workspace/workspace";
import {
  activePeriod,
  activeProfile,
  createDefaultWorkspace,
  isProfileComplete,
  periodMetrics,
  syncAnalysisToWorkspace,
} from "../lib/workspace/workspace";

describe("persistent VAT workspace model", () => {
  it("starts with a reusable business profile and monthly period history", () => {
    const workspace = createDefaultWorkspace();
    const profile = activeProfile(workspace);
    const period = activePeriod(workspace);

    expect(isProfileComplete(profile)).toBe(true);
    expect(profile.filingFrequency).toBe("MONTHLY");
    expect(period.label).toBe("October 2026");
    expect(workspace.periods.filter((item) => item.profileId === profile.id)).toHaveLength(3);
    expect(workspace.submissions).toHaveLength(2);
  });

  it("allows profile progress to exist but blocks closing until VAT identity is complete", () => {
    const workspace = createDefaultWorkspace();
    const profile = { ...activeProfile(workspace), tin: "", vatRegistrationStatus: "PENDING" as const };

    expect(isProfileComplete(profile)).toBe(false);
  });

  it("turns analysis findings into saved period tasks without auto-resolving them", async () => {
    const workspace = createDefaultWorkspace();
    const period = activePeriod(workspace);
    const analysis = await runOrchestrator(null, true, [], undefined, undefined, "SYNTHETIC_DEMO");
    const updated = syncAnalysisToWorkspace(workspace, analysis, { periodId: period.id });
    const tasks = updated.tasks.filter((task) => task.periodId === period.id);

    expect(tasks.length).toBeGreaterThan(0);
    expect(tasks.some((task) => task.status === "OPEN")).toBe(true);
    expect(updated.periods.find((item) => item.id === period.id)?.status).toBe("NEEDS_REVIEW");
    expect(periodMetrics(updated, period.id).openTaskCount).toBe(tasks.length);
  });

  it("labels a user upload in the period inbox and preserves its run link", async () => {
    const workspace = createDefaultWorkspace();
    const period = activePeriod(workspace);
    const analysis = await runOrchestrator(null, true, [], undefined, undefined, "USER_PROVIDED");
    const updated = syncAnalysisToWorkspace(workspace, analysis, {
      periodId: period.id,
      fileName: "supplier-invoice.png",
      documentType: "INVOICE",
    });
    const item = updated.inbox.find((candidate) => candidate.fileName === "supplier-invoice.png");

    expect(item?.dataMode).toBe("USER_PROVIDED");
    expect(item?.runId).toBe(analysis.runId);
    expect(item?.status).toBe("FAILED");
  });
});

describe("the audit trail", () => {
  it("starts empty rather than with events that never happened", () => {
    // It used to open with six entries carrying fixed clock times, describing
    // work nobody had done. A pre-populated trail is a false one.
    expect(createDefaultWorkspace().auditEvents).toEqual([]);
  });

  it("survives a workspace stored before the trail existed", () => {
    const old = { ...createDefaultWorkspace(), auditEvents: undefined } as never;
    expect(normaliseWorkspace(old).auditEvents).toEqual([]);
  });
});
