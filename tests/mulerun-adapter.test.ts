/**
 * The MuleRun adapter, exercised against a real local webhook.
 *
 * The published MuleRun workflow is not wired up (WORKFLOW_MODE=local, and no
 * credentials), so nothing else in the suite touches this path. These cover the
 * two properties that matter if it is ever switched on: a malformed or failing
 * execution is rejected rather than trusted, and a remote status is advisory -
 * it is reported as a disagreement and never applied to a local finding.
 */
import { describe, expect, it, afterEach, beforeEach } from "vitest";
import { createServer, type Server } from "node:http";
import {
  runMuleRunWorkflow,
  compareMuleRunResult,
  isMuleRunConfigured,
  type WorkflowInput,
} from "../lib/workflows/mulerun-adapter";
import type { Finding } from "../lib/types";

let server: Server | null = null;
// The adapter reads credentials from the environment, so these tests set them.
// Restoring afterwards keeps that out of any test that runs later in the file
// order and asserts on the unconfigured path.
let savedUrl: string | undefined;
let savedKey: string | undefined;

function stub(handler: (body: any) => { status: number; body: unknown }): Promise<string> {
  return new Promise((resolve) => {
    server = createServer((req, res) => {
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", () => {
        const out = handler(JSON.parse(raw || "{}"));
        res.writeHead(out.status, { "Content-Type": "application/json" });
        res.end(JSON.stringify(out.body));
      });
    });
    server.listen(0, "127.0.0.1", () => {
      const addr = server!.address() as any;
      resolve(`http://127.0.0.1:${addr.port}/hook`);
    });
  });
}

beforeEach(() => {
  savedUrl = process.env.MULERUN_API_URL;
  savedKey = process.env.MULERUN_API_KEY;
});

afterEach(() => {
  server?.close();
  server = null;
  if (savedUrl === undefined) delete process.env.MULERUN_API_URL;
  else process.env.MULERUN_API_URL = savedUrl;
  if (savedKey === undefined) delete process.env.MULERUN_API_KEY;
  else process.env.MULERUN_API_KEY = savedKey;
});

const INPUT: WorkflowInput = {
  runId: "RUN-PROBE",
  ruleProfile: "v2026.10",
  invoice: null,
  schedule: { source: "not-supplied", fileName: null, rowCount: 0, totalLkr: 0, rows: [] },
  cusdec: { totalLkr: 0 },
  supplier: { snapshotDate: "not-supplied" },
  governmentContext: {
    sourceVerifiedAt: "2026-09-16",
    invoiceRulePack: { id: "RP", version: "1", effectiveFrom: "2026-10-01", sourceIds: [] },
    vatRates: [], schedules: [],
    supplierSnapshot: { id: "S", effectiveDate: "2026-09-01", containsTaxpayerRecords: false },
  },
  resolvedBlockers: [],
};

describe("MuleRun adapter against a stub webhook", () => {
  it("posts the case and accepts a valid execution", async () => {
    let seenRunId: string | undefined;
    const url = await stub((body) => { seenRunId = body.runId; return { status: 200, body: {
      executionId: "EX-1", gate: "NEEDS_HUMAN", findings: [{ id: "F1", status: "resolved" }] } }; });
    process.env.MULERUN_API_URL = url; process.env.MULERUN_API_KEY = "probe-key";
    expect(isMuleRunConfigured()).toBe(true);
    const result = await runMuleRunWorkflow(INPUT);
    expect(seenRunId).toBe("RUN-PROBE");
    expect(result.executionId).toBe("EX-1");
  });

  it("rejects a malformed execution rather than trusting it", async () => {
    const url = await stub(() => ({ status: 200, body: { executionId: "EX-2", gate: "WHATEVER", findings: [] } }));
    process.env.MULERUN_API_URL = url; process.env.MULERUN_API_KEY = "k";
    await expect(runMuleRunWorkflow(INPUT)).rejects.toThrow(/validation/i);
  });

  it("surfaces an HTTP failure", async () => {
    const url = await stub(() => ({ status: 500, body: { error: "workflow exploded" } }));
    process.env.MULERUN_API_URL = url; process.env.MULERUN_API_KEY = "k";
    await expect(runMuleRunWorkflow(INPUT)).rejects.toThrow(/workflow exploded/);
  });

  it("never lets a remote 'resolved' move a local open finding", () => {
    const local = [{ id: "F1", status: "open" }] as unknown as Finding[];
    const diff = compareMuleRunResult(local, {
      executionId: "EX", gate: "READY_TO_FILE", findings: [{ id: "F1", status: "resolved" }],
    });
    expect(diff).toEqual([{ findingId: "F1", localStatus: "open", remoteStatus: "resolved" }]);
    expect(local[0].status).toBe("open");
  });
});
