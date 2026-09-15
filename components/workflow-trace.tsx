"use client";

import type { AnalyzeResult } from "@/lib/types";

const STATUS_MARK: Record<string, string> = {
  ok: "✓",
  waiting: "⏸",
  failed: "✕",
  pending: "○",
};

export function WorkflowTrace({ result }: { result: AnalyzeResult }) {
  const { workflow } = result;
  const live = workflow.mode === "LIVE_MULERUN";
  // Only call it a fallback when MuleRun was genuinely tried and failed.
  const label = live
    ? "LIVE MULERUN"
    : workflow.muleRunAttempted
      ? "LOCAL FALLBACK"
      : "LOCAL ORCHESTRATOR";

  return (
    <article className="card pad">
      <div className="card-head">
        <div>
          <h2>Agent pipeline</h2>
          <p>
            {live
              ? "Seven declared agents, run locally and verified against the MuleRun execution."
              : "Seven declared agents run by the local orchestrator, with measured durations."}
          </p>
        </div>
        <span className={`pill ${live ? "live" : "fallback"}`}>
          <i className="dot" />
          {label}
        </span>
      </div>

      {/* The seven declared agents, always all seven. A stage this run never
          reached shows as pending rather than being omitted, so the trace
          cannot imply a stage passed when it did not run. */}
      <div className="trace">
        {workflow.pipeline.map((stage) => (
          <div className={`trace-row ${stage.status}`} key={stage.id}>
            <span className="trace-mark" aria-hidden="true">
              {STATUS_MARK[stage.status] ?? "•"}
            </span>
            <div className="trace-body">
              <strong>
                <span className="trace-ordinal mono">{stage.ordinal}</span>
                {stage.name}
              </strong>
              <span>{stage.detail ?? stage.role}</span>
              {stage.muleRun ? (
                <span className="trace-remote">
                  MuleRun reported {stage.muleRun.status} in{" "}
                  <span className="mono">{stage.muleRun.ms} ms</span>
                </span>
              ) : null}
            </div>
            <span className="trace-ms mono">{stage.ms > 0 ? `${stage.ms} ms` : "—"}</span>
          </div>
        ))}
      </div>

      <details className="trace-raw">
        <summary>Full execution trace ({workflow.trace.length} steps)</summary>
        <div className="trace">
          {workflow.trace.map((stage, index) => (
            <div className={`trace-row ${stage.status}`} key={`${stage.name}-${index}`}>
              <span className="trace-mark" aria-hidden="true">
                {STATUS_MARK[stage.status] ?? "•"}
              </span>
              <div className="trace-body">
                <strong>{stage.name}</strong>
                {stage.detail ? <span>{stage.detail}</span> : null}
              </div>
              <span className="trace-ms mono">{stage.ms > 0 ? `${stage.ms} ms` : "—"}</span>
            </div>
          ))}
        </div>
      </details>

      <div className="trace-foot">
        <span className={`tag ${workflow.gate === "READY_TO_FILE" ? "ok" : "warn"}`}>
          {workflow.gate === "READY_TO_FILE" ? "READY_TO_FILE" : "NEEDS_HUMAN"}
        </span>
        <span className="subtle">
          Run <span className="mono">{result.runId}</span>
          {workflow.executionId ? (
            <>
              {" · MuleRun execution "}
              <span className="mono">{workflow.executionId}</span>
            </>
          ) : ""}
        </span>
      </div>

      {workflow.fallbackReason ? (
        <p className="subtle" style={{ marginTop: 8 }}>
          {workflow.muleRunAttempted ? "MuleRun failed: " : "MuleRun not used: "}
          {workflow.fallbackReason}
        </p>
      ) : null}
    </article>
  );
}

// The static rescue-priority table that used to live here was superseded by
// the interactive RescueSimulator (components/rescue-simulator.tsx), which
// lets a reviewer select specific actions and preview their combined effect
// before anything is actually applied.
