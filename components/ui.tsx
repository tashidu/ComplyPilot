"use client";

import { useEffect } from "react";

export function SectionHead({
  title,
  aside,
}: {
  title: string;
  aside?: React.ReactNode;
}) {
  return (
    <div className="section-head">
      <h2>{title}</h2>
      {aside ? <div>{aside}</div> : null}
    </div>
  );
}

export function PageHead({
  eyebrow,
  title,
  lead,
  action,
}: {
  eyebrow: string;
  title: string;
  lead: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="page-head">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p className="subtle" style={{ marginTop: 6 }}>
          {lead}
        </p>
      </div>
      {action ? <div>{action}</div> : null}
    </div>
  );
}

export function Toast({ message, show }: { message: string; show: boolean }) {
  return (
    <div className={`toast${show ? " show" : ""}`} role="status" aria-live="polite">
      <i>✓</i>
      <span>{message}</span>
    </div>
  );
}

export function Modal({
  open,
  onClose,
  auditCount,
}: {
  open: boolean;
  onClose: () => void;
  auditCount: number;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="mock-filing-title"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="modal">
        <div className="modal-icon">✓</div>
        <h2 id="mock-filing-title">Mock submission complete</h2>
        <p>
          The authorised user approved the evidence package and the demo tool completed a
          controlled mock submission.
        </p>
        <div className="receipt">
          Receipt: CP-DEMO-2026-1042
          <br />
          Status: ACCEPTED (MOCK)
          <br />
          Audit events: {auditCount}
          <br />
          Live IRD action: NONE
        </div>
        <button className="button primary wide" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
