"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  BusinessProfile,
  BusinessWorkspace,
  VatPeriodRecord,
  WorkspaceTask,
  WorkspaceTaskStatus,
} from "@/lib/workspace/workspace";
import { PageHead } from "./ui";

type TaskDraft = Pick<WorkspaceTask, "assignedTo" | "evidenceNote" | "status">;

export function TasksView({
  workspace,
  profile,
  period,
  onSave,
  onComplete,
  onOpenSmartFix,
}: {
  workspace: BusinessWorkspace;
  profile: BusinessProfile;
  period: VatPeriodRecord;
  onSave: (taskId: string, draft: TaskDraft) => Promise<boolean>;
  onComplete: (task: WorkspaceTask, draft: TaskDraft) => Promise<boolean>;
  onOpenSmartFix: () => void;
}) {
  const tasks = useMemo(
    () => workspace.tasks.filter((task) => task.periodId === period.id),
    [workspace.tasks, period.id],
  );
  const [drafts, setDrafts] = useState<Record<string, TaskDraft>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    setDrafts(
      Object.fromEntries(
        tasks.map((task) => [
          task.id,
          { assignedTo: task.assignedTo, evidenceNote: task.evidenceNote, status: task.status },
        ]),
      ),
    );
  }, [tasks]);

  const openCount = tasks.filter((task) => task.status !== "COMPLETED").length;
  const completedCount = tasks.length - openCount;

  function update(task: WorkspaceTask, value: Partial<TaskDraft>) {
    setDrafts((current) => ({
      ...current,
      [task.id]: {
        assignedTo: current[task.id]?.assignedTo ?? task.assignedTo,
        evidenceNote: current[task.id]?.evidenceNote ?? task.evidenceNote,
        status: current[task.id]?.status ?? task.status,
        ...value,
      },
    }));
  }

  async function act(task: WorkspaceTask, complete: boolean) {
    const draft = drafts[task.id] ?? task;
    setBusyId(task.id);
    try {
      return complete ? await onComplete(task, draft) : await onSave(task.id, draft);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <PageHead
        eyebrow={`${profile.displayName} · ${period.label}`}
        title="Saved tasks"
        lead="AI findings become owned, evidence-backed work. A task changes the readiness score only after a human records evidence and completes it."
      />

      <div className="grid three">
        <article className="card metric"><div className="metric-icon amber">!</div><div><strong className="mono">{openCount}</strong><span>Open tasks</span></div></article>
        <article className="card metric"><div className="metric-icon mint">✓</div><div><strong className="mono">{completedCount}</strong><span>Completed with evidence</span></div></article>
        <article className="card metric"><div className="metric-icon brand">↗</div><div><strong className="mono">{tasks.filter((task) => task.selectedForAction).length}</strong><span>Saved from Rescue Simulator</span></div></article>
      </div>

      <div className="task-list">
        {tasks.map((task) => {
          const draft = drafts[task.id] ?? task;
          const complete = task.status === "COMPLETED";
          const noteReady = draft.evidenceNote.trim().length >= 8;
          return (
            <article className={`card pad task-card${task.selectedForAction ? " selected" : ""}`} key={task.id}>
              <div className="card-head">
                <div>
                  <div className="chip-row">
                    <span className={`tag ${task.severity === "high" ? "alert" : "warn"}`}>{task.severity}</span>
                    {task.selectedForAction ? <span className="tag brand">RESCUE PLAN</span> : null}
                    <span className={`tag ${complete ? "ok" : ""}`}>{task.status.replaceAll("_", " ")}</span>
                  </div>
                  <h2 style={{ marginTop: 8 }}>{task.title}</h2>
                  <p>{task.description}</p>
                </div>
                <strong className="mono">LKR {task.amountLkrM.toFixed(1)}M</strong>
              </div>

              {complete ? (
                <div className="task-complete-note">
                  <strong>Evidence accepted</strong>
                  <span>{task.evidenceNote || "Completed through the validated analysis workflow."}</span>
                  {task.assignedTo ? <small>Owner: {task.assignedTo}</small> : null}
                </div>
              ) : (
                <div className="task-controls">
                  <label>
                    <span>Owner</span>
                    <input
                      value={draft.assignedTo}
                      placeholder={profile.authorisedReviewer || "Finance team member"}
                      onChange={(event) => update(task, { assignedTo: event.target.value })}
                    />
                  </label>
                  <label>
                    <span>Work status</span>
                    <select
                      value={draft.status}
                      onChange={(event) => update(task, { status: event.target.value as WorkspaceTaskStatus })}
                    >
                      <option value="OPEN">Open</option>
                      <option value="WAITING_EVIDENCE">Waiting for evidence</option>
                      <option value="READY_FOR_REVIEW">Ready for review</option>
                    </select>
                  </label>
                  <label className="span-two">
                    <span>Evidence note — required before completion</span>
                    <textarea
                      rows={3}
                      value={draft.evidenceNote}
                      placeholder="Example: Supplier confirmation received and attached; verified by finance reviewer."
                      onChange={(event) => update(task, { evidenceNote: event.target.value })}
                    />
                  </label>
                </div>
              )}

              {!complete ? (
                <div className="form-actions">
                  {task.findingId === "invoice" ? (
                    <button className="button primary" onClick={onOpenSmartFix}>Open Smart Fix</button>
                  ) : (
                    <button
                      className="button success"
                      disabled={!noteReady || busyId === task.id}
                      onClick={() => void act(task, true)}
                    >
                      {busyId === task.id ? "Verifying…" : "Complete with evidence"}
                    </button>
                  )}
                  <button className="button" disabled={busyId === task.id} onClick={() => void act(task, false)}>
                    Save task
                  </button>
                </div>
              ) : null}
            </article>
          );
        })}
        {tasks.length === 0 ? (
          <article className="card pad empty-state">No saved tasks for this period. Add evidence or run the analysis to create them.</article>
        ) : null}
      </div>
    </>
  );
}
