import { describe, expect, it } from "vitest";
import { AGENT_PIPELINE, buildPipelineView } from "../lib/workflows/pipeline";

describe("declared agent pipeline", () => {
  it("declares the seven agents in the documented order", () => {
    expect(AGENT_PIPELINE.map((s) => s.id)).toEqual([
      "document",
      "temporal",
      "smart-fix",
      "reconciliation",
      "rescue",
      "approval",
      "submission",
    ]);
  });

  it("numbers the stages 1..7 with no gaps", () => {
    expect(AGENT_PIPELINE.map((s) => s.ordinal)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("keeps the human approval stage owned by a human", () => {
    // If this ever becomes model-decided, the filing gate is no longer a gate.
    expect(AGENT_PIPELINE.find((s) => s.id === "approval")?.intelligence).toBe("human");
  });

  it("never lets a model be the sole decider on money or rules", () => {
    // Qwen may read a document; it may not decide reconciliation or the plan.
    const modelOnly = AGENT_PIPELINE.filter((s) => s.intelligence === "qwen").map((s) => s.id);
    expect(modelOnly).toEqual(["document"]);
  });
});

describe("pipeline view", () => {
  it("always returns seven rows in order, however little executed", () => {
    const view = buildPipelineView([]);
    expect(view).toHaveLength(7);
    expect(view.map((s) => s.ordinal)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("reports a stage that never ran as pending, not as passed", () => {
    const view = buildPipelineView([]);
    expect(view.every((s) => s.status === "pending")).toBe(true);
  });

  it("carries the reason a declared stage was not reached", () => {
    const view = buildPipelineView([], { submission: "Blocked until a human approves." });
    expect(view.find((s) => s.id === "submission")?.detail).toBe(
      "Blocked until a human approves.",
    );
  });

  it("folds an executed stage onto its declared row", () => {
    const view = buildPipelineView([
      { agent: "document", name: "Qwen Document Agent", status: "ok", ms: 812 },
    ]);
    const document = view.find((s) => s.id === "document");
    expect(document?.status).toBe("ok");
    expect(document?.ms).toBe(812);
    expect(view.find((s) => s.id === "rescue")?.status).toBe("pending");
  });

  it("sums repeated runs of one stage and keeps the last outcome", () => {
    const view = buildPipelineView([
      { agent: "reconciliation", name: "r", status: "ok", ms: 40 },
      { agent: "reconciliation", name: "r", status: "failed", ms: 10, detail: "boom" },
    ]);
    const stage = view.find((s) => s.id === "reconciliation");
    expect(stage?.ms).toBe(50);
    expect(stage?.status).toBe("failed");
    expect(stage?.detail).toBe("boom");
  });

  it("ignores trace entries that belong to no declared agent", () => {
    const view = buildPipelineView([{ name: "MuleRun pre-flight", status: "ok", ms: 15 }]);
    expect(view.every((s) => s.status === "pending")).toBe(true);
  });
});
