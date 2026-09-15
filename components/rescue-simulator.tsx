"use client";

import { useEffect, useState } from "react";
import type { AnalyzeResult, Score } from "@/lib/types";
import { formatLkr } from "@/lib/demo";

type Preview = { score: Score; claimValueUnderReviewLkr: number };

export function RescueSimulator({
  result,
  onOpenEvidence,
  onQueueSelected,
}: {
  result: AnalyzeResult;
  onOpenEvidence: (id: string) => void;
  onQueueSelected: (ids: string[]) => Promise<void>;
}) {
  const actions = result.rescuePlan.actions;
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);

  // A new run, a rule-profile switch, or an applied correction all change
  // what "open" means, so a stale selection referencing an id that no longer
  // needs fixing (or a different case entirely) must not carry over.
  const findingsKey = result.findings.map((finding) => `${finding.id}:${finding.status}`).join("|");
  useEffect(() => {
    setSelected(new Set());
    setPreview(null);
  }, [result.runId, findingsKey]);

  useEffect(() => {
    if (selected.size === 0) {
      setPreview(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetch("/api/simulate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ runId: result.runId, selectedActionIds: Array.from(selected) }),
    })
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (!cancelled && ok) setPreview({ score: data.score, claimValueUnderReviewLkr: data.claimValueUnderReviewLkr });
      })
      .catch(() => {
        // Keep the last successful preview; the simulator stays usable.
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result.runId, Array.from(selected).sort().join(",")]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const actualScore = result.score.total;
  const actualLkr = result.claimValueUnderReviewLkr;
  const hasSelection = selected.size > 0;
  const displayScore = hasSelection ? (preview?.score.total ?? actualScore) : actualScore;
  const displayLkr = hasSelection ? (preview?.claimValueUnderReviewLkr ?? actualLkr) : actualLkr;
  const scoreGain = displayScore - actualScore;
  const lkrProtected = Math.max(0, actualLkr - displayLkr);

  return (
    <article className="card pad rescue-sim">
      <div className="card-head">
        <div className="card-head-icon" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 15V5M10 15V9M17 15V3" />
            <circle cx="3" cy="7" r="1.6" fill="currentColor" stroke="none" />
            <circle cx="10" cy="11" r="1.6" fill="currentColor" stroke="none" />
            <circle cx="17" cy="5" r="1.6" fill="currentColor" stroke="none" />
          </svg>
        </div>
        <div>
          <h2>Refund Rescue Simulator</h2>
          <p>Select rescue actions to preview their combined effect, then save them as owned tasks for evidence-backed completion.</p>
        </div>
        <span className="tag brand">What-if · not the IRD score</span>
      </div>

      {actions.length === 0 ? (
        <div className="notice">
          <span aria-hidden="true">✓</span>
          <div>No open evidence blockers remain. There is nothing left to simulate.</div>
        </div>
      ) : (
        <>
          <div className="rescue-bridge">
            <div className="rescue-bridge-side">
              <span className="subtle">Actual position</span>
              <strong className="mono">{actualScore}/100</strong>
              <span>{formatLkr(actualLkr)} under review</span>
            </div>
            <div className="rescue-bridge-arrow" aria-hidden="true">
              →
            </div>
            <div className={`rescue-bridge-side${hasSelection ? " highlight" : ""}`}>
              <span className="subtle">{hasSelection ? "Selected what-if position" : "Select actions below"}</span>
              <strong className="mono">
                {displayScore}/100
                {loading ? " …" : ""}
              </strong>
              <span>{formatLkr(displayLkr)} under review</span>
            </div>
          </div>

          {hasSelection ? (
            <div className="chip-row" style={{ marginTop: 10 }}>
              <span className="chip ready">+{scoreGain} points</span>
              <span className="chip ready">{formatLkr(lkrProtected)} protected</span>
            </div>
          ) : null}

          <div className="rescue-actions-list">
            {actions.map((action) => (
              <label key={action.findingId} className="rescue-action-row">
                <input
                  type="checkbox"
                  checked={selected.has(action.findingId)}
                  onChange={() => toggle(action.findingId)}
                />
                <div className="rescue-action-body">
                  <strong>{action.title}</strong>
                  <span>{action.requiredAction}</span>
                </div>
                <div className="rescue-action-meta">
                  <span className="tag ok">+{action.scoreGain} pts</span>
                  <span className="tag">{formatLkr(action.lkrAtRisk)}</span>
                  <button
                    type="button"
                    className="button small"
                    onClick={(event) => {
                      event.preventDefault();
                      onOpenEvidence(action.findingId);
                    }}
                  >
                    Evidence
                  </button>
                </div>
              </label>
            ))}
          </div>

          <div className="rescue-sim-foot">
            <button
              className="button primary"
              disabled={!hasSelection || applying}
              onClick={async () => {
                const ids = Array.from(selected);
                setApplying(true);
                try {
                  await onQueueSelected(ids);
                } finally {
                  setApplying(false);
                }
              }}
            >
              {applying
                ? "Saving…"
                : `Save ${selected.size || ""} selected action${selected.size === 1 ? "" : "s"} to Tasks`}
            </button>
            <span className="subtle">The preview does not resolve findings. A human must add evidence and complete each saved task. {result.rescuePlan.disclaimer}</span>
          </div>
        </>
      )}
    </article>
  );
}
