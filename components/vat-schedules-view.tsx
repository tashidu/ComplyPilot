"use client";

import { useMemo, useState } from "react";
import { buildOfficialScheduleCsv, scheduleRowCells, scheduleRowGaps, transactionsForSchedule } from "@/lib/vat-schedule-export";
import { collectedFields, SCHEDULE_CODES, scheduleHeaders, scheduleSpec } from "@/lib/vat-schedule-fields";
import type { BusinessProfile, BusinessWorkspace, VatPeriodRecord, VatScheduleBatch, VatScheduleCode } from "@/lib/workspace/workspace";
import { PageHead } from "./ui";

function money(value: number) {
  return new Intl.NumberFormat("en-LK", { style: "currency", currency: "LKR", maximumFractionDigits: 2 }).format(value);
}

function downloadCsv(fileName: string, content: string) {
  const url = URL.createObjectURL(new Blob([`﻿${content}`], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function statusLabel(batch: VatScheduleBatch | undefined, stale: boolean) {
  if (!batch) return "NOT BUILT";
  if (stale) return "REBUILD NEEDED";
  return batch.status.replaceAll("_", " ");
}

export function VatSchedulesView({
  workspace,
  profile,
  period,
  busy,
  onBuild,
  onApprove,
  onVerify,
  onSaveDetails,
  onOpenLedger,
  onOpenReturn,
}: {
  workspace: BusinessWorkspace;
  profile: BusinessProfile;
  period: VatPeriodRecord;
  busy: boolean;
  onBuild: () => Promise<boolean>;
  onApprove: (batchId: string) => Promise<boolean>;
  onVerify: (batchId: string) => Promise<boolean>;
  onSaveDetails: (code: VatScheduleCode, entries: { transactionId: string; values: Record<string, string> }[]) => Promise<boolean>;
  onOpenLedger: () => void;
  onOpenReturn: () => void;
}) {
  const [selectedCode, setSelectedCode] = useState<VatScheduleCode>("01");
  /** Edits in the details form, before they are saved. Keyed transactionId/fieldKey. */
  const [edits, setEdits] = useState<Record<string, Record<string, string>>>({});

  const periodTransactions = useMemo(
    () => workspace.vatTransactions.filter((item) => item.profileId === profile.id && item.periodId === period.id),
    [workspace.vatTransactions, profile.id, period.id],
  );
  const batches = useMemo(
    () => workspace.vatScheduleBatches.filter((item) => item.profileId === profile.id && item.periodId === period.id),
    [workspace.vatScheduleBatches, profile.id, period.id],
  );
  const details = workspace.vatScheduleDetails ?? [];
  const spec = scheduleSpec(selectedCode);
  const headers = scheduleHeaders(selectedCode);
  const selectedBatch = batches.find((item) => item.code === selectedCode);
  const selectedRows = transactionsForSchedule(periodTransactions, selectedCode);
  const currentIds = selectedRows.map((item) => item.id).sort().join("|");
  const stale = Boolean(selectedBatch && selectedBatch.sourceTransactionIds.slice().sort().join("|") !== currentIds);
  const blocking = selectedBatch?.issues.filter((item) => item.severity === "ERROR") ?? [];
  const warnings = selectedBatch?.issues.filter((item) => item.severity === "WARNING") ?? [];
  const gaps = scheduleRowGaps(periodTransactions, selectedCode, details);

  const savedValue = (transactionId: string, key: string) =>
    details.find((item) => item.transactionId === transactionId && item.code === selectedCode)?.values[key] ?? "";
  const currentValue = (transactionId: string, key: string) =>
    edits[transactionId]?.[key] ?? savedValue(transactionId, key);

  function edit(transactionId: string, key: string, value: string) {
    setEdits((current) => ({ ...current, [transactionId]: { ...current[transactionId], [key]: value } }));
  }

  async function saveDetails() {
    const entries = Object.entries(edits)
      .map(([transactionId, values]) => ({ transactionId, values }))
      .filter((entry) => Object.keys(entry.values).length > 0);
    if (!entries.length) return;
    if (await onSaveDetails(selectedCode, entries)) setEdits({});
  }

  function download(batch: VatScheduleBatch) {
    downloadCsv(batch.fileName, buildOfficialScheduleCsv(periodTransactions, batch.code, details));
  }

  return <>
    <PageHead
      eyebrow={`${profile.displayName} · ${period.label} · IRD period ${selectedBatch?.periodCode ?? "build pending"}`}
      title="IRD VAT schedule builder"
      lead="Turn the period ledger into exact IRD schedule columns, ask for the few facts only you hold, run deterministic pre-checks, then hand a verified file to the authorised filer."
      action={<button className="button primary" disabled={busy} onClick={() => void onBuild()}>{busy ? "Building…" : batches.length ? "Rebuild schedules" : "Build schedules"}</button>}
    />

    <div className="schedule-flow" aria-label="Schedule workflow">
      <div className="done"><b>1</b><span><strong>Capture</strong><small>AI reads invoice; human confirms facts</small></span></div>
      <div className="done"><b>2</b><span><strong>Assign</strong><small>Each record mapped to its schedule</small></span></div>
      <div className={gaps.length ? "active" : batches.length ? "done" : ""}><b>3</b><span><strong>Complete</strong><small>Supply customs and export facts</small></span></div>
      <div className={batches.some((item) => item.status === "IRD_VERIFIED") ? "done" : ""}><b>4</b><span><strong>Build & verify</strong><small>Exact columns, then IRD&apos;s own tool</small></span></div>
    </div>

    <div className="schedule-ai-note">
      <span className="schedule-ai-spark">AI</span>
      <div><strong>Where AI is used</strong><p>Qwen extracts and classifies messy invoices, and the copilot can tell you which rows are still incomplete. The column layout, mapping, totals and validation are deterministic code, so the same evidence always produces the same filing rows. A customs reference or an exchange rate is never invented — it is asked for.</p></div>
      <span className="tag ok">Explainable by design</span>
    </div>

    <div className="schedule-cards">
      {SCHEDULE_CODES.map((code) => {
        const codeSpec = scheduleSpec(code);
        const batch = batches.find((item) => item.code === code);
        const rows = transactionsForSchedule(periodTransactions, code);
        if (!rows.length && !batch && !codeSpec.supported) return null;
        const isStale = Boolean(batch && batch.sourceTransactionIds.slice().sort().join("|") !== rows.map((item) => item.id).sort().join("|"));
        const errors = batch?.issues.filter((item) => item.severity === "ERROR").length ?? 0;
        const needing = scheduleRowGaps(periodTransactions, code, details).length;
        return <button key={code} className={`schedule-card ${selectedCode === code ? "selected" : ""} ${codeSpec.supported ? "" : "unsupported"}`} onClick={() => setSelectedCode(code)}>
          <span className="schedule-code">{code}</span>
          <span className="schedule-card-main"><strong>{codeSpec.name}</strong><small>{codeSpec.covers}</small></span>
          <span className="schedule-card-metric"><strong>{rows.length}</strong><small>rows</small></span>
          {needing ? <span className="tag warn">{needing} need detail</span> : <span className={`tag ${errors || isStale ? "warn" : batch ? "ok" : ""}`}>{statusLabel(batch, isStale)}</span>}
        </button>;
      })}
    </div>

    {!spec.supported ? (
      <div className="schedule-unsupported-note">
        <strong>Schedule {selectedCode} — {spec.name}</strong>
        <p>{spec.covers} The ledger does not model this yet, so no rows can be produced. The column layout below is recorded from IRD&apos;s verifier so the gap is exact rather than approximate.</p>
        <div className="schedule-table-wrap"><table className="schedule-table"><thead><tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr></thead></table></div>
      </div>
    ) : null}

    {gaps.length ? (
      <section className="card pad schedule-gaps">
        <div className="card-head">
          <div>
            <h2>{gaps.length} row{gaps.length === 1 ? "" : "s"} need details only you have</h2>
            <p>Schedule {selectedCode} asks for facts a VAT ledger does not hold. Read them off the CUSDEC or the export invoice — the agent will not guess them.</p>
          </div>
          <span className="tag warn">Blocking the build</span>
        </div>
        <div className="schedule-gap-rows">
          {gaps.map((gap) => (
            <div className="schedule-gap-row" key={gap.transactionId}>
              <div className="schedule-gap-head">
                <strong className="mono">{gap.invoiceNumber}</strong>
                <small>{gap.invoiceDate} · {gap.counterpartyName || "counterparty not recorded"} · row {gap.rowNumber}</small>
              </div>
              <div className="workspace-form-grid">
                {gap.missing.map((field) => (
                  <label key={field.key}>
                    <span>{field.header}</span>
                    <input
                      type={field.input === "number" ? "number" : field.input === "date" ? "date" : "text"}
                      step={field.input === "number" ? "any" : undefined}
                      value={currentValue(gap.transactionId, field.key)}
                      placeholder={field.hint}
                      onChange={(event) => edit(gap.transactionId, field.key, event.target.value)}
                    />
                    <small className="field-hint">{field.hint}</small>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="form-actions">
          <button className="button primary" disabled={busy || !Object.keys(edits).length} onClick={() => void saveDetails()}>{busy ? "Saving…" : "Save details"}</button>
          <button className="button" onClick={onOpenLedger}>Edit ledger</button>
        </div>
      </section>
    ) : null}

    <div className="grid two schedule-workspace-grid">
      <article className="card pad schedule-preview-card">
        <div className="card-head"><div><h2>Schedule {selectedCode} preview</h2><p>{spec.name} · official field order · values stay linked to the ledger.</p></div><span className="tag">{selectedRows.length} rows</span></div>
        <div className="schedule-table-wrap"><table className="schedule-table">
          <thead><tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr></thead>
          <tbody>
            {selectedRows.length ? selectedRows.map((item, index) => (
              <tr key={item.id}>
                {scheduleRowCells(item, index, selectedCode, details).map((cell, cellIndex) => (
                  <td key={cellIndex} className={typeof cell === "number" ? "mono" : undefined}>
                    {cell === "" ? <em className="cell-missing">needed</em> : typeof cell === "number" ? cell.toFixed(2) : cell}
                  </td>
                ))}
              </tr>
            )) : <tr><td colSpan={headers.length} className="empty-cell">No ledger rows map to this schedule.</td></tr>}
          </tbody>
        </table></div>
        <div className="schedule-totals">
          <span>Value <strong className="mono">{money(selectedRows.reduce((sum, item) => sum + item.netAmountLkr, 0))}</strong></span>
          <span>VAT <strong className="mono">{money(selectedRows.reduce((sum, item) => sum + item.vatAmountLkr, 0))}</strong></span>
          {selectedCode === "02" ? <span>Disallowed <strong className="mono">{money(selectedRows.reduce((sum, item) => sum + item.disallowedInputVatLkr, 0))}</strong></span> : null}
        </div>
      </article>

      <article className="card pad schedule-review-card">
        <div className="card-head"><div><h2>Pre-check &amp; handoff</h2><p>ComplyPilot validation is not an IRD verification result.</p></div></div>
        {!selectedBatch ? <div className="schedule-empty"><strong>Build this period first</strong><p>The builder saves row counts, totals, issues, filename and review status against this business period.</p></div> : <>
          <div className="schedule-file"><span>Official filename</span><strong className="mono">{selectedBatch.fileName}</strong><small>{selectedBatch.submissionType} · version {selectedBatch.versionNumber} · period code {selectedBatch.periodCode}</small></div>
          <div className="return-gates">
            <Gate ok={!stale} title="Ledger snapshot current" detail={stale ? "Ledger changed after this build; rebuild required" : `${selectedBatch.sourceTransactionIds.length} source rows linked`} />
            <Gate ok={!gaps.length} title="Row details supplied" detail={gaps.length ? `${gaps.length} row(s) still missing required facts` : "Every required column has a value"} />
            <Gate ok={!blocking.length} title="Blocking checks passed" detail={blocking.length ? `${blocking.length} error(s) require correction` : "TIN, dates, amounts and duplicate keys checked"} />
            <Gate ok={selectedBatch.status === "APPROVED" || selectedBatch.status === "IRD_VERIFIED"} title="Human approval" detail={selectedBatch.approvedBy ? `Approved by ${selectedBatch.approvedBy}` : "Authorised reviewer must approve"} />
            <Gate ok={selectedBatch.status === "IRD_VERIFIED"} title="Official verifier confirmation" detail={selectedBatch.verifiedAt ? `Recorded ${new Date(selectedBatch.verifiedAt).toLocaleString("en-LK")}` : "Run IRD's Windows verifier, then record its pass"} />
          </div>
          {(blocking.length || warnings.length) ? <div className="schedule-issues">{[...blocking, ...warnings].slice(0, 5).map((issue, index) => <div key={`${issue.transactionId}-${issue.field}-${index}`} className={issue.severity === "ERROR" ? "error" : "warning"}><b>{issue.severity}</b><span>Row {issue.rowNumber ?? "—"} · {issue.field}<small>{issue.message}</small></span></div>)}</div> : <p className="schedule-clear">✓ ComplyPilot pre-check found no issues.</p>}
          <div className="form-actions schedule-actions">
            <button className="button" onClick={onOpenLedger}>Edit ledger</button>
            <button className="button" disabled={stale || Boolean(blocking.length) || Boolean(gaps.length) || !selectedRows.length} onClick={() => download(selectedBatch)}>Download CSV</button>
            {selectedBatch.status === "READY" ? <button className="button primary" disabled={stale || busy} onClick={() => void onApprove(selectedBatch.id)}>Approve</button> : null}
            {selectedBatch.status === "APPROVED" ? <button className="button primary" disabled={busy} onClick={() => void onVerify(selectedBatch.id)}>Record IRD verifier pass</button> : null}
            {selectedBatch.status === "IRD_VERIFIED" ? <button className="button primary" onClick={onOpenReturn}>Continue to VAT return</button> : null}
          </div>
        </>}
      </article>
    </div>
    <div className="schedule-boundary"><strong>Safe boundary</strong><span>This screen prepares IRD schedule files. It does not log in to RAMIS, bypass CAPTCHA/OTP, or claim an official submission. The authorised person uploads the verified file in IRD e-Services.</span><a href="https://www.ird.gov.lk/en/Downloads/SitePages/Schedules.aspx?menuid=1604" target="_blank" rel="noreferrer">IRD templates ↗</a></div>
  </>;
}

function Gate({ ok, title, detail }: { ok: boolean; title: string; detail: string }) {
  return <div className={ok ? "ok" : "wait"}><span>{ok ? "✓" : "!"}</span><div><strong>{title}</strong><small>{detail}</small></div></div>;
}
