"use client";

import type { AuditEvent } from "@/lib/demo";
import { PageHead } from "./ui";

export function AuditView({
  events,
  onExport,
}: {
  events: AuditEvent[];
  onExport: () => void;
}) {
  return (
    <>
      <PageHead
        eyebrow="Trustworthy AI"
        title="Replayable audit trail"
        lead="Every extraction, rule decision, correction and approval appears in one timeline."
        action={
          <button className="button primary" onClick={onExport}>
            Export audit JSON
          </button>
        }
      />

      <article className="card pad">
        <div className="audit">
          {[...events].reverse().map((event, index) => (
            <div className="audit-item" key={`${event.time}-${index}`}>
              <div className="audit-time">{event.time}</div>
              <div className="audit-rail">
                <span className={`audit-dot${event.actor === "human" ? " human" : ""}`} />
              </div>
              <div className="audit-copy">
                <strong>{event.title}</strong>
                <span>{event.detail}</span>
              </div>
            </div>
          ))}
        </div>
      </article>
    </>
  );
}
