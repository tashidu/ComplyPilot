"use client";

import { useEffect, useState } from "react";
import type { AnalyzeResult } from "@/lib/types";
import type { BusinessProfile, BusinessWorkspace, VatPeriodRecord } from "@/lib/workspace/workspace";
import { isProfileComplete } from "@/lib/workspace/profile-readiness";
import { PageHead } from "./ui";

export function PeriodCloseView({
  workspace,
  profile,
  period,
  result,
  busy,
  onApprove,
  onOpenProfile,
  onOpenInbox,
  onOpenTasks,
  onContinue,
}: {
  workspace: BusinessWorkspace;
  profile: BusinessProfile;
  period: VatPeriodRecord;
  result: AnalyzeResult;
  busy: boolean;
  onApprove: (reviewer: string) => Promise<boolean>;
  onOpenProfile: () => void;
  onOpenInbox: () => void;
  onOpenTasks: () => void;
  onContinue: () => void;
}) {
  const [reviewer, setReviewer] = useState(profile.authorisedReviewer);
  useEffect(() => setReviewer(profile.authorisedReviewer), [profile.authorisedReviewer]);

  const documents = workspace.inbox.filter((item) => item.periodId === period.id);
  const tasks = workspace.tasks.filter((task) => task.periodId === period.id);
  const profileReady = isProfileComplete(profile);
  const documentsReady = documents.length > 0;
  const tasksReady = tasks.every((task) => task.status === "COMPLETED");
  const analysisReady = result.workflow.gate === "READY_TO_FILE" && result.runId === period.runId;
  const ready = profileReady && documentsReady && tasksReady && analysisReady && reviewer.trim().length >= 2;
  const approved = period.status === "APPROVED" || period.status === "SUBMITTED";

  const gates = [
    { label: "Business identity complete", detail: `TIN ${profile.tin || "missing"} · VAT ${profile.vatRegistrationStatus.toLowerCase()} · reviewer ${profile.authorisedReviewer || "missing"}`, ok: profileReady, action: onOpenProfile },
    { label: "Period evidence collected", detail: `${documents.length} invoice or schedule record${documents.length === 1 ? "" : "s"} saved`, ok: documentsReady, action: onOpenInbox },
    { label: "Saved tasks completed", detail: `${tasks.filter((task) => task.status !== "COMPLETED").length} task${tasks.filter((task) => task.status !== "COMPLETED").length === 1 ? "" : "s"} still open`, ok: tasksReady, action: onOpenTasks },
    { label: "Latest AI workflow is ready", detail: `${result.workflow.gate.replaceAll("_", " ")} · score ${result.score.total}/100`, ok: analysisReady, action: onOpenTasks },
  ];

  return (
    <>
      <PageHead
        eyebrow={`${profile.displayName} · ${period.label}`}
        title="Period-closing workflow"
        lead="Close one taxable period only after identity, documents, evidence tasks, and the latest analysis have passed their gates."
        action={<span className={`tag ${approved ? "ok" : ready ? "brand" : "warn"}`}>{approved ? "HUMAN APPROVED" : ready ? "READY FOR APPROVAL" : "GATES OPEN"}</span>}
      />

      <div className="notice">
        <span aria-hidden="true">i</span>
        <div><b>Human-in-the-loop boundary.</b> This approval freezes the period for the mock filing flow. It does not submit a VAT return to the IRD or RAMIS.</div>
      </div>

      <article className="card pad close-card">
        <div className="card-head">
          <div><h2>Closing gates</h2><p><span className="mono">{period.startDate}</span> to <span className="mono">{period.endDate}</span> · return due <span className="mono">{period.returnDueDate}</span></p></div>
          <strong className="mono">{gates.filter((gate) => gate.ok).length}/{gates.length}</strong>
        </div>
        <div className="close-gates">
          {gates.map((gate) => (
            <button className={`close-gate${gate.ok ? " passed" : ""}`} key={gate.label} onClick={gate.action}>
              <span className="close-gate-mark">{gate.ok ? "✓" : "!"}</span>
              <span><strong>{gate.label}</strong><small>{gate.detail}</small></span>
              <span aria-hidden="true">→</span>
            </button>
          ))}
        </div>

        {approved ? (
          <div className="period-approved">
            <div><strong>Approved by {period.approvedBy}</strong><span className={period.approvedAt ? "mono" : ""}>{period.approvedAt ? new Date(period.approvedAt).toLocaleString("en-LK") : "Approval recorded"}</span></div>
            <button className="button primary" onClick={onContinue}>Continue to mock filing</button>
          </div>
        ) : (
          <div className="close-approval">
            <label><span>Authorised reviewer</span><input value={reviewer} onChange={(event) => setReviewer(event.target.value)} /></label>
            <button className="button success" disabled={!ready || busy} onClick={() => void onApprove(reviewer)}>{busy ? "Recording approval…" : "Approve and close period"}</button>
          </div>
        )}
      </article>
    </>
  );
}
