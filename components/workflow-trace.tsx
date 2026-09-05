"use client";

import type { AnalyzeResult } from "@/lib/types";

const STATUS_MARK: Record<string, string> = {
  ok: "✓",
  waiting: "⏸",
  failed: "✕",
};

export function WorkflowTrace({ result }: { result: AnalyzeResult }) {
  const { workflow } = result;
  const live = workflow.mode === "LIVE_MULERUN";

  return (
    <article className="card pad">
      <div className="card-head">
        <div>
          <h2>Pre-flight workflow trace</h2>
          <p>
            {live
              ? "Local compliance stages with MuleRun workflow verification."
              : "Stages executed by the local orchestrator, with measured durations."}
          </p>
        </div>
        <span className={`pill ${live ? "live" : "fallback"}`}>
          <i className="dot" />
          {live ? "LIVE MULERUN" : "LOCAL FALLBACK"}
        </span>
      </div>

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
            <span className="trace-ms">{stage.ms > 0 ? `${stage.ms} ms` : "—"}</span>
          </div>
        ))}
      </div>

      <div className="trace-foot">
        <span className={`tag ${workflow.gate === "READY_TO_FILE" ? "ok" : "warn"}`}>
          {workflow.gate === "READY_TO_FILE" ? "READY_TO_FILE" : "NEEDS_HUMAN"}
        </span>
        <span className="subtle">
          Run {result.runId}
          {workflow.executionId ? ` · MuleRun execution ${workflow.executionId}` : ""}
        </span>
      </div>

      {workflow.fallbackReason ? (
        <p className="subtle" style={{ marginTop: 8 }}>
          MuleRun not used: {workflow.fallbackReason}
        </p>
      ) : null}
    </article>
  );
}

/**
 * Answers the question a finance team actually asks: what do we fix first?
 * Ordered by points gained, with the input VAT each action unlocks.
 */
export function RescuePlanner({
  result,
  onOpenEvidence,
}: {
  result: AnalyzeResult;
  onOpenEvidence: (id: string) => void;
}) {
  const open = result.findings
    .filter((finding) => finding.status === "open")
    .sort((a, b) => b.scoreGain - a.scoreGain);

  if (open.length === 0) {
    return (
      <article className="card pad">
        <div className="card-head">
          <div>
            <h2>Refund rescue plan</h2>
            <p>Every blocker is resolved. The package can go to human approval.</p>
          </div>
          <span className="tag ok">Nothing outstanding</span>
        </div>
      </article>
    );
  }

  const totalGain = open.reduce((sum, finding) => sum + finding.scoreGain, 0);
  const totalValue = open.reduce((sum, finding) => sum + finding.amountLkrM, 0);

  return (
    <article className="card pad">
      <div className="card-head">
        <div>
          <h2>Refund rescue plan</h2>
          <p>Highest score gain first, with the input VAT each action unlocks.</p>
        </div>
        <span className="tag warn">
          +{totalGain} points · LKR {totalValue.toFixed(1)}M
        </span>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Priority</th>
              <th>Action</th>
              <th style={{ textAlign: "right" }}>Score gain</th>
              <th style={{ textAlign: "right" }}>VAT unlocked</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {open.map((finding, index) => (
              <tr key={finding.id}>
                <td>
                  <strong>{index + 1}</strong>
                </td>
                <td>
                  <strong>{finding.title}</strong>
                  <small>Rule {finding.ruleId}</small>
                </td>
                <td style={{ textAlign: "right" }}>
                  <strong>+{finding.scoreGain}</strong>
                </td>
                <td style={{ textAlign: "right" }}>LKR {finding.amountLkrM.toFixed(1)}M</td>
                <td style={{ textAlign: "right" }}>
                  <button className="button small" onClick={() => onOpenEvidence(finding.id)}>
                    Evidence
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  );
}
