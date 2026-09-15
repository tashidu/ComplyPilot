"use client";

import { useMemo, useState } from "react";
import { buildOfficialScheduleCsv, OFFICIAL_SCHEDULE_HEADERS, transactionsForSchedule } from "@/lib/vat-schedule-export";
import type { BusinessProfile, BusinessWorkspace, VatPeriodRecord, VatScheduleBatch, VatScheduleCode } from "@/lib/workspace/workspace";
import { PageHead } from "./ui";

function money(value: number) {
  return new Intl.NumberFormat("en-LK", { style: "currency", currency: "LKR", maximumFractionDigits: 2 }).format(value);
}

function downloadCsv(fileName: string, content: string) {
  const url = URL.createObjectURL(new Blob([`\uFEFF${content}`], { type: "text/csv;charset=utf-8" }));
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
  onOpenLedger: () => void;
  onOpenReturn: () => void;
}) {
  const [selectedCode, setSelectedCode] = useState<VatScheduleCode>("01");
  const periodTransactions = useMemo(
    () => workspace.vatTransactions.filter((item) => item.profileId === profile.id && item.periodId === period.id),
    [workspace.vatTransactions, profile.id, period.id],
  );
  const batches = useMemo(
    () => workspace.vatScheduleBatches.filter((item) => item.profileId === profile.id && item.periodId === period.id),
    [workspace.vatScheduleBatches, profile.id, period.id],
  );
  const selectedBatch = batches.find((item) => item.code === selectedCode);
  const selectedRows = transactionsForSchedule(periodTransactions, selectedCode);
  const currentIds = selectedRows.map((item) => item.id).sort().join("|");
  const stale = Boolean(selectedBatch && selectedBatch.sourceTransactionIds.slice().sort().join("|") !== currentIds);
  const blocking = selectedBatch?.issues.filter((item) => item.severity === "ERROR") ?? [];
  const warnings = selectedBatch?.issues.filter((item) => item.severity === "WARNING") ?? [];

  function download(batch: VatScheduleBatch) {
    downloadCsv(batch.fileName, buildOfficialScheduleCsv(periodTransactions, batch.code));
  }

  return <>
    <PageHead
      eyebrow={`${profile.displayName} · ${period.label} · IRD period ${selectedBatch?.periodCode ?? "build pending"}`}
      title="IRD VAT schedule builder"
      lead="Turn the period ledger into exact Schedule 01 and Schedule 02 columns, run deterministic pre-checks, obtain human approval, then verify with IRD's official desktop tool."
      action={<button className="button primary" disabled={busy} onClick={() => void onBuild()}>{busy ? "Building…" : batches.length ? "Rebuild schedules" : "Build schedules"}</button>}
    />

    <div className="schedule-flow" aria-label="Schedule workflow">
      <div className="done"><b>1</b><span><strong>Capture</strong><small>AI reads invoice; human confirms facts</small></span></div>
      <div className="done"><b>2</b><span><strong>Assign</strong><small>Output → 01, local input → 02</small></span></div>
      <div className={batches.length ? "done" : "active"}><b>3</b><span><strong>Build & review</strong><small>Exact v1.8 columns and checks</small></span></div>
      <div className={batches.some((item) => item.status === "IRD_VERIFIED") ? "done" : ""}><b>4</b><span><strong>External verify</strong><small>Run IRD tool; human records pass</small></span></div>
    </div>

    <div className="schedule-ai-note">
      <span className="schedule-ai-spark">AI</span>
      <div><strong>Where AI is used</strong><p>Qwen extracts and classifies messy invoices. The schedule mapper, totals and validation are deterministic code so the same evidence always produces the same filing rows. Missing TINs and source facts are never invented.</p></div>
      <span className="tag ok">Explainable by design</span>
    </div>

    <div className="schedule-cards">
      {(["01", "02"] as VatScheduleCode[]).map((code) => {
        const batch = batches.find((item) => item.code === code);
        const rows = transactionsForSchedule(periodTransactions, code);
        const isStale = Boolean(batch && batch.sourceTransactionIds.slice().sort().join("|") !== rows.map((item) => item.id).sort().join("|"));
        const errors = batch?.issues.filter((item) => item.severity === "ERROR").length ?? 0;
        return <button key={code} className={`schedule-card ${selectedCode === code ? "selected" : ""}`} onClick={() => setSelectedCode(code)}>
          <span className="schedule-code">{code}</span>
          <span className="schedule-card-main"><strong>{code === "01" ? "Output VAT · Sales" : "Input VAT · Local purchases"}</strong><small>{code === "01" ? "Purchaser details and value of supply" : "Supplier details, purchases and disallowed VAT"}</small></span>
          <span className="schedule-card-metric"><strong>{rows.length}</strong><small>rows</small></span>
          <span className={`tag ${errors || isStale ? "warn" : batch ? "ok" : ""}`}>{statusLabel(batch, isStale)}</span>
        </button>;
      })}
    </div>

    <div className="grid two schedule-workspace-grid">
      <article className="card pad schedule-preview-card">
        <div className="card-head"><div><h2>Schedule {selectedCode} preview</h2><p>Official workbook v1.8 field order · values remain linked to the ledger.</p></div><span className="tag">{selectedRows.length} rows</span></div>
        <div className="schedule-table-wrap"><table className="schedule-table"><thead><tr>{OFFICIAL_SCHEDULE_HEADERS[selectedCode].map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>
          {selectedRows.length ? selectedRows.map((item, index) => <tr key={item.id}><td>{index + 1}</td><td>{item.invoiceDate}</td><td className="mono">{item.invoiceNumber}</td><td className="mono">{item.counterpartyTin || "—"}</td><td>{item.counterpartyName}</td><td>{item.description}</td><td className="mono">{item.netAmountLkr.toFixed(2)}</td><td className="mono">{item.vatAmountLkr.toFixed(2)}</td>{selectedCode === "02" ? <td className="mono">{item.disallowedInputVatLkr.toFixed(2)}</td> : null}</tr>) : <tr><td colSpan={OFFICIAL_SCHEDULE_HEADERS[selectedCode].length} className="empty-cell">No ledger rows map to this schedule.</td></tr>}
        </tbody></table></div>
        <div className="schedule-totals"><span>Value <strong className="mono">{money(selectedRows.reduce((sum, item) => sum + item.netAmountLkr, 0))}</strong></span><span>VAT <strong className="mono">{money(selectedRows.reduce((sum, item) => sum + item.vatAmountLkr, 0))}</strong></span>{selectedCode === "02" ? <span>Disallowed <strong className="mono">{money(selectedRows.reduce((sum, item) => sum + item.disallowedInputVatLkr, 0))}</strong></span> : null}</div>
      </article>

      <article className="card pad schedule-review-card">
        <div className="card-head"><div><h2>Pre-check & handoff</h2><p>ComplyPilot validation is not an IRD verification result.</p></div></div>
        {!selectedBatch ? <div className="schedule-empty"><strong>Build this period first</strong><p>The builder will save row counts, totals, issues, filename and review status to this business period.</p></div> : <>
          <div className="schedule-file"><span>Official filename</span><strong className="mono">{selectedBatch.fileName}</strong><small>{selectedBatch.submissionType} · version {selectedBatch.versionNumber} · period code {selectedBatch.periodCode}</small></div>
          <div className="return-gates">
            <Gate ok={!stale} title="Ledger snapshot current" detail={stale ? "Ledger changed after this build; rebuild required" : `${selectedBatch.sourceTransactionIds.length} source rows linked`} />
            <Gate ok={!blocking.length} title="Blocking checks passed" detail={blocking.length ? `${blocking.length} error(s) require correction` : "TIN, dates, amounts and duplicate keys checked"} />
            <Gate ok={selectedBatch.status === "APPROVED" || selectedBatch.status === "IRD_VERIFIED"} title="Human approval" detail={selectedBatch.approvedBy ? `Approved by ${selectedBatch.approvedBy}` : "Authorised reviewer must approve"} />
            <Gate ok={selectedBatch.status === "IRD_VERIFIED"} title="Official verifier confirmation" detail={selectedBatch.verifiedAt ? `Recorded ${new Date(selectedBatch.verifiedAt).toLocaleString("en-LK")}` : "Run IRD's Windows verifier, then record its pass"} />
          </div>
          {(blocking.length || warnings.length) ? <div className="schedule-issues">{[...blocking, ...warnings].slice(0, 5).map((issue, index) => <div key={`${issue.transactionId}-${issue.field}-${index}`} className={issue.severity === "ERROR" ? "error" : "warning"}><b>{issue.severity}</b><span>Row {issue.rowNumber ?? "—"} · {issue.field}<small>{issue.message}</small></span></div>)}</div> : <p className="schedule-clear">✓ ComplyPilot pre-check found no issues.</p>}
          <div className="form-actions schedule-actions">
            <button className="button" onClick={onOpenLedger}>Edit ledger</button>
            <button className="button" disabled={stale || Boolean(blocking.length) || !selectedRows.length} onClick={() => download(selectedBatch)}>Download CSV</button>
            {selectedBatch.status === "READY" ? <button className="button primary" disabled={stale || busy} onClick={() => void onApprove(selectedBatch.id)}>Approve</button> : null}
            {selectedBatch.status === "APPROVED" ? <button className="button primary" disabled={busy} onClick={() => void onVerify(selectedBatch.id)}>Record IRD verifier pass</button> : null}
            {selectedBatch.status === "IRD_VERIFIED" ? <button className="button primary" onClick={onOpenReturn}>Continue to VAT return</button> : null}
          </div>
        </>}
      </article>
    </div>
    <div className="schedule-boundary"><strong>Safe boundary</strong><span>This screen prepares Schedule 01/02 files. It does not log in to RAMIS, bypass CAPTCHA/OTP, or claim an official submission. The authorised person uploads the verified file in IRD e-Services.</span><a href="https://www.ird.gov.lk/en/Downloads/SitePages/Schedules.aspx?menuid=1604" target="_blank" rel="noreferrer">IRD templates ↗</a></div>
  </>;
}

function Gate({ ok, title, detail }: { ok: boolean; title: string; detail: string }) {
  return <div className={ok ? "ok" : "wait"}><span>{ok ? "✓" : "!"}</span><div><strong>{title}</strong><small>{detail}</small></div></div>;
}
