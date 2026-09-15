"use client";

import { useMemo, useState } from "react";
import type { BusinessProfile, BusinessWorkspace, FilingFrequency } from "@/lib/workspace/workspace";
import { PageHead } from "./ui";

export type PeriodFormValue = {
  label: string;
  frequency: FilingFrequency;
  startDate: string;
  endDate: string;
  paymentDueDate: string;
  returnDueDate: string;
};

const STATUS_LABELS = {
  COLLECTING: "Collecting",
  NEEDS_REVIEW: "Needs review",
  READY_TO_CLOSE: "Ready to close",
  APPROVED: "Approved",
  SUBMITTED: "Submitted",
} as const;

export function PeriodsView({
  workspace,
  profile,
  onActivate,
  onCreate,
  onOpenSubmissions,
}: {
  workspace: BusinessWorkspace;
  profile: BusinessProfile;
  onActivate: (periodId: string) => Promise<void>;
  onCreate: (period: PeriodFormValue) => Promise<boolean>;
  onOpenSubmissions: () => void;
}) {
  const periods = useMemo(
    () => workspace.periods.filter((period) => period.profileId === profile.id).sort((left, right) => right.startDate.localeCompare(left.startDate)),
    [workspace.periods, profile.id],
  );
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [value, setValue] = useState<PeriodFormValue>({
    label: "November 2026",
    frequency: profile.filingFrequency,
    startDate: "2026-11-01",
    endDate: "2026-11-30",
    paymentDueDate: "2026-12-20",
    returnDueDate: "2026-12-31",
  });

  async function create() {
    setSaving(true);
    try {
      if (await onCreate(value)) setCreating(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHead
        eyebrow="Monthly or quarterly workspaces"
        title="VAT period records"
        lead="Collect records throughout a taxable period, close it once, and keep submitted periods read-only."
        action={<button className="button primary" onClick={() => setCreating((current) => !current)}>Create period</button>}
      />

      {creating ? (
        <article className="card pad period-create-card">
          <div className="workspace-form-grid">
            <label><span>Period label</span><input value={value.label} onChange={(event) => setValue({ ...value, label: event.target.value })} /></label>
            <label><span>Frequency</span><select value={value.frequency} onChange={(event) => setValue({ ...value, frequency: event.target.value as FilingFrequency })}><option value="MONTHLY">Monthly</option><option value="QUARTERLY">Quarterly — three months</option></select></label>
            <label><span>Start date</span><input type="date" value={value.startDate} onChange={(event) => setValue({ ...value, startDate: event.target.value })} /></label>
            <label><span>End date</span><input type="date" value={value.endDate} onChange={(event) => setValue({ ...value, endDate: event.target.value })} /></label>
            <label><span>Next VAT payment due</span><input type="date" value={value.paymentDueDate} onChange={(event) => setValue({ ...value, paymentDueDate: event.target.value })} /></label>
            <label><span>Return due</span><input type="date" value={value.returnDueDate} onChange={(event) => setValue({ ...value, returnDueDate: event.target.value })} /></label>
          </div>
          <div className="form-actions"><button className="button" onClick={() => setCreating(false)}>Cancel</button><button className="button primary" disabled={saving} onClick={create}>{saving ? "Creating…" : "Create and open period"}</button></div>
        </article>
      ) : null}

      <div className="period-grid">
        {periods.map((period) => {
          const documents = workspace.inbox.filter((item) => item.periodId === period.id).length;
          const openTasks = workspace.tasks.filter((task) => task.periodId === period.id && task.status !== "COMPLETED").length;
          const active = period.id === profile.activePeriodId;
          return (
            <article key={period.id} className={`card pad period-card${active ? " active" : ""}`}>
              <div className="card-head">
                <div><h2>{period.label}</h2><p>{period.frequency === "MONTHLY" ? "Monthly return" : "Quarterly return · three months"}</p></div>
                <span className={`tag ${period.status === "SUBMITTED" ? "ok" : period.status === "NEEDS_REVIEW" ? "warn" : "brand"}`}>{STATUS_LABELS[period.status]}</span>
              </div>
              <div className="period-dates">
                <span><small>Period</small><strong className="mono">{period.startDate} → {period.endDate}</strong></span>
                <span><small>Payment due</small><strong className="mono">{period.paymentDueDate}</strong></span>
                <span><small>Return due</small><strong className="mono">{period.returnDueDate}</strong></span>
              </div>
              <div className="chip-row"><span className="chip">{documents} documents</span><span className={`chip ${openTasks ? "" : "ready"}`}>{openTasks} open tasks</span></div>
              <div className="form-actions">
                {period.status === "SUBMITTED" ? (
                  <button className="button" onClick={onOpenSubmissions}>View submission</button>
                ) : (
                  <button className={`button ${active ? "" : "primary"}`} disabled={active} onClick={() => void onActivate(period.id)}>{active ? "Current workspace" : "Open period"}</button>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}
