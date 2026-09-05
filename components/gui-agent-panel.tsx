"use client";

import { useState } from "react";

type AgentAction = {
  action: "type" | "click" | "await_human" | "done";
  targetId?: string;
  value?: string;
  reason: string;
};

type AgentStep = {
  index: number;
  time: string;
  screenshot: string;
  heading: string;
  action: AgentAction;
  decidedBy: "qwen" | "fallback";
};

type AgentRun = {
  sessionId: string;
  status: "awaiting_human" | "completed" | "failed";
  mode: "LIVE_QWEN" | "DEMO_FALLBACK";
  fallbackReason: string | null;
  acknowledgement: string | null;
  error: string | null;
  steps: AgentStep[];
};

const ACTION_LABEL: Record<AgentAction["action"], string> = {
  type: "Type",
  click: "Click",
  await_human: "Hand to human",
  done: "Finish",
};

export function GuiAgentPanel({
  canFile,
  onAgentEvent,
}: {
  canFile: boolean;
  onAgentEvent?: (title: string, detail: string) => void;
}) {
  const [run, setRun] = useState<AgentRun | null>(null);
  const [busy, setBusy] = useState(false);
  const [otp, setOtp] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function post(body: unknown) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/file", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "The filing agent failed.");
        return null;
      }
      setRun(data as AgentRun);
      return data as AgentRun;
    } catch (e) {
      setError(e instanceof Error ? e.message : "The filing agent could not be reached.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function start() {
    const data = await post({ approved: true });
    if (!data) return;
    onAgentEvent?.(
      "GUI agent opened the mock portal",
      `${data.steps.length} steps recorded. Status: ${data.status.replace("_", " ")}.`,
    );
  }

  async function continueWithOtp() {
    if (!run || otp.trim().length < 4) return;
    const data = await post({ sessionId: run.sessionId, otp: otp.trim() });
    setOtp("");
    if (!data) return;
    onAgentEvent?.(
      data.acknowledgement
        ? "GUI agent completed the mock filing"
        : "GUI agent continued after human verification",
      data.acknowledgement
        ? `Acknowledgement ${data.acknowledgement} received from the mock portal. No live IRD action occurred.`
        : "The one-time password was entered by the authorised human.",
    );
  }

  return (
    <article className="card pad" style={{ marginTop: 14 }}>
      <div className="card-head">
        <div>
          <h2>Agent filing run</h2>
          <p>
            The agent reads each screen, decides one action at a time and stops at identity
            verification.
          </p>
        </div>
        {run ? (
          <span className={`pill ${run.mode === "LIVE_QWEN" ? "live" : "fallback"}`}>
            <i className="dot" />
            {run.mode === "LIVE_QWEN" ? "LIVE QWEN" : "DEMO FALLBACK"}
          </span>
        ) : null}
      </div>

      {!run ? (
        <>
          <div className="notice" style={{ marginBottom: 14 }}>
            <span aria-hidden="true">ℹ</span>
            <div>
              The agent operates a <b>mock portal bundled with this app</b>. It never contacts the
              Inland Revenue Department and cannot file a real return.
            </div>
          </div>
          <button className="button primary wide" disabled={!canFile || busy} onClick={start}>
            {busy ? "Agent is working…" : "Let the agent file it"}
          </button>
          {!canFile ? (
            <p className="subtle" style={{ marginTop: 10 }}>
              Resolve the open blockers and tick the approval box first.
            </p>
          ) : null}
        </>
      ) : null}

      {run?.fallbackReason ? (
        <div className="notice" style={{ marginBottom: 14 }}>
          <span aria-hidden="true">ℹ</span>
          <div>
            <b>Fallback planner used.</b> {run.fallbackReason}
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="notice" style={{ marginBottom: 14, borderLeftColor: "var(--red)" }}>
          <span aria-hidden="true">!</span>
          <div>{error}</div>
        </div>
      ) : null}

      {run ? (
        <div className="agent-steps">
          {run.steps.map((step) => (
            <div className="agent-step" key={step.index}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={step.screenshot} alt={`Portal screen at step ${step.index}`} />
              <div className="agent-step-body">
                <div className="agent-step-head">
                  <span className="agent-step-index">{step.index}</span>
                  <strong>
                    {ACTION_LABEL[step.action.action]}
                    {step.action.targetId ? ` · ${step.action.targetId}` : ""}
                  </strong>
                  <span className={`tag ${step.decidedBy === "qwen" ? "ok" : "warn"}`}>
                    {step.decidedBy === "qwen" ? "Qwen decided" : "Fallback"}
                  </span>
                  <span className="agent-step-time">{step.time}</span>
                </div>
                <p>{step.action.reason}</p>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {run?.status === "awaiting_human" ? (
        <div className="approval" style={{ marginTop: 14 }}>
          <strong style={{ display: "block", marginBottom: 6 }}>
            Human checkpoint: one-time password
          </strong>
          <p className="subtle" style={{ marginBottom: 10 }}>
            The agent stopped because an OTP must be entered by an authorised person. The demo
            portal accepts <code>482913</code>.
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              aria-label="One-time password"
              className="otp-input"
              inputMode="numeric"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              placeholder="000000"
            />
            <button
              className="button primary"
              disabled={busy || otp.trim().length < 4}
              onClick={continueWithOtp}
            >
              {busy ? "Submitting…" : "Enter OTP and continue"}
            </button>
          </div>
        </div>
      ) : null}

      {run?.status === "completed" && run.acknowledgement ? (
        <div className="receipt" style={{ marginTop: 14 }}>
          Portal acknowledgement: {run.acknowledgement}
          <br />
          Steps recorded: {run.steps.length}
          <br />
          Decided by: {run.mode === "LIVE_QWEN" ? "Qwen vision model" : "deterministic fallback"}
          <br />
          Live IRD action: NONE
        </div>
      ) : null}

      {run?.status === "failed" ? (
        <div className="notice" style={{ marginTop: 14, borderLeftColor: "var(--red)" }}>
          <span aria-hidden="true">!</span>
          <div>{run.error ?? "The agent could not complete the run."}</div>
        </div>
      ) : null}
    </article>
  );
}
