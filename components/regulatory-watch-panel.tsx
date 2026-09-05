"use client";

import { useCallback, useEffect, useState } from "react";

type RuleChange = {
  id: string;
  source: string;
  sourceUrl: string;
  detectedAt: string;
  proposedVersion: string;
  currentVersion: string;
  summary: string;
  impact: string;
  affectedRuleIds: string[];
};

type WatchState = {
  lastCheckedAt: string;
  sources: { name: string; url: string; lastSeen: string; changed: boolean }[];
  pending: RuleChange | null;
  activeVersion: string;
  approvedBy: string | null;
  approvedAt: string | null;
};

export function RegulatoryWatchPanel({
  onAgentEvent,
}: {
  onAgentEvent?: (actor: "agent" | "human", title: string, detail: string) => void;
}) {
  const [state, setState] = useState<WatchState | null>(null);
  const [reviewer, setReviewer] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/regulatory-watch")
      .then((res) => res.json())
      .then((data) => setState(data.state))
      .catch(() => setError("The watch agent could not be reached."));
  }, []);

  const act = useCallback(
    async (action: "approve" | "reject" | "reset") => {
      setBusy(true);
      setError(null);
      try {
        const res = await fetch("/api/regulatory-watch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, reviewer: reviewer.trim() }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "The action failed.");
        setState(data.state);
        if (data.event) onAgentEvent?.("human", data.event.title, data.event.detail);
      } catch (e) {
        setError(e instanceof Error ? e.message : "The action failed.");
      } finally {
        setBusy(false);
      }
    },
    [onAgentEvent, reviewer],
  );

  if (!state) {
    return (
      <article className="card pad">
        <p className="subtle">Loading the regulatory watch agent…</p>
      </article>
    );
  }

  return (
    <article className="card pad">
      <div className="card-head">
        <div>
          <h2>Regulatory Watch Agent</h2>
          <p>
            A scheduled task checks the published sources, and a human tax reviewer decides whether
            the rule pack changes.
          </p>
        </div>
        <span className="tag warn">SIMULATED</span>
      </div>

      <div className="notice" style={{ marginBottom: 14 }}>
        <span aria-hidden="true">ℹ</span>
        <div>
          <b>Detection is simulated in this demo.</b> The sources below are not fetched live. The
          approval gate is real: a detected change never becomes an active rule pack without a named
          human accepting it.
        </div>
      </div>

      <div className="watch-sources">
        {state.sources.map((source) => (
          <div className="watch-source" key={source.url}>
            <span className={`tag ${source.changed ? "warn" : "ok"}`}>
              {source.changed ? "Changed" : "No change"}
            </span>
            <div>
              <strong>{source.name}</strong>
              <span>Last checked {source.lastSeen}</span>
            </div>
          </div>
        ))}
      </div>

      <p className="subtle" style={{ marginTop: 10 }}>
        Active rule pack: <strong>{state.activeVersion}</strong>
        {state.approvedBy ? ` · approved by ${state.approvedBy} at ${state.approvedAt}` : ""}
      </p>

      {error ? (
        <div className="notice" style={{ marginTop: 14, borderLeftColor: "var(--red)" }}>
          <span aria-hidden="true">!</span>
          <div>{error}</div>
        </div>
      ) : null}

      {state.pending ? (
        <div className="watch-change">
          <div className="card-head" style={{ marginBottom: 10 }}>
            <div>
              <h3 style={{ fontSize: 14 }}>
                Change detected: {state.pending.currentVersion} → {state.pending.proposedVersion}
              </h3>
              <p>
                {state.pending.source} · detected {state.pending.detectedAt}
              </p>
            </div>
            <span className="tag warn">Awaiting human review</span>
          </div>

          <p style={{ fontSize: 12.5, marginBottom: 8 }}>
            <b>Summary.</b> {state.pending.summary}
          </p>
          <p style={{ fontSize: 12.5, marginBottom: 10, color: "var(--ink-soft)" }}>
            <b>Impact on this case.</b> {state.pending.impact}
          </p>
          <p className="subtle" style={{ marginBottom: 12 }}>
            Affected rules: {state.pending.affectedRuleIds.join(", ")}
          </p>

          <div className="approval">
            <label htmlFor="reviewer" style={{ display: "block", marginBottom: 6 }}>
              <strong style={{ fontSize: 13 }}>Reviewing tax professional</strong>
            </label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              <input
                id="reviewer"
                className="reviewer-input"
                value={reviewer}
                onChange={(event) => setReviewer(event.target.value)}
                placeholder="Full name"
              />
              <button
                className="button primary"
                disabled={busy || reviewer.trim().length < 2}
                onClick={() => act("approve")}
              >
                Approve rule pack
              </button>
              <button
                className="button"
                disabled={busy || reviewer.trim().length < 2}
                onClick={() => act("reject")}
              >
                Reject
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="watch-change">
          <p style={{ fontSize: 13 }}>
            No change is awaiting review. The active pack is <strong>{state.activeVersion}</strong>.
          </p>
          <button
            className="button small"
            style={{ marginTop: 10 }}
            disabled={busy}
            onClick={() => act("reset")}
          >
            Replay the detection
          </button>
        </div>
      )}
    </article>
  );
}
