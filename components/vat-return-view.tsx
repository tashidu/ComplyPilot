"use client";

import { summariseVatPeriod } from "@/lib/vat-operations";
import { buildReturnSummaryCsv, buildScheduleCsv, SCHEDULE_DEFINITIONS, scheduleFileName, transactionsForSchedule } from "@/lib/vat-schedule-export";
import type { BusinessProfile, BusinessWorkspace, VatPeriodRecord } from "@/lib/workspace/workspace";
import { PageHead } from "./ui";

/**
 * Hands the reviewer a file.
 *
 * The schedules are the only thing that actually leaves ComplyPilot on the way
 * to e-Services, so they are produced in the browser and never posted anywhere:
 * nothing about preparing a return requires the period's figures to make a
 * round trip. A BOM is prepended because Excel otherwise reads a UTF-8 CSV as
 * the local code page and mangles any non-ASCII counterparty name.
 */
function downloadCsv(fileName: string, content: string) {
  const url = URL.createObjectURL(new Blob([`﻿${content}`], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function VatReturnView({ workspace, profile, period, onOpenLedger, onClosePeriod, onFile }: { workspace: BusinessWorkspace; profile: BusinessProfile; period: VatPeriodRecord; onOpenLedger: () => void; onClosePeriod: () => void; onFile: () => void }) {
  const transactions = workspace.vatTransactions.filter((item) => item.periodId === period.id);
  const summary = summariseVatPeriod(transactions);
  const schedules = SCHEDULE_DEFINITIONS.map((definition) => ({ ...definition, rows: transactionsForSchedule(transactions, definition.code) }));
  const closed = period.status === "APPROVED" || period.status === "SUBMITTED";

  function exportSchedule(code: (typeof SCHEDULE_DEFINITIONS)[number]["code"]) {
    downloadCsv(scheduleFileName(profile, period, `schedule-${code}`), buildScheduleCsv(transactions, code));
  }

  return <>
    <PageHead eyebrow={`${profile.displayName} · ${period.label}`} title="VAT return preparation" lead="Reconcile the period ledger into IRD schedules, review allowable input VAT, then hand control to the authorised filer." action={<span className={`tag ${closed ? "ok" : "warn"}`}>{period.status.replaceAll("_", " ")}</span>} />
    <div className="vat-return-equation"><div><span>Output VAT</span><strong>{money(summary.outputVatLkr)}</strong></div><b>−</b><div><span>Allowable input VAT</span><strong>{money(summary.allowableInputVatLkr)}</strong><small>{money(summary.disallowedInputVatLkr)} disallowed</small></div><b>=</b><div className={`vat-return-result ${summary.vatPayableLkr ? "payable" : "credit"}`}><span>{summary.vatPayableLkr ? "VAT payable" : "Excess input credit"}</span><strong className="mono">{money(summary.vatPayableLkr || summary.excessInputCreditLkr)}</strong><small>{summary.vatPayableLkr ? "Due to IRD for this period" : "Carried forward or claimable"}</small></div></div>
    <div className="grid two return-grid">
      <article className="card pad">
        <div className="card-head"><div><h2>Schedule preparation map</h2><p>Export each schedule as CSV, check it against the latest official template, then upload it in e-Services.</p></div><strong>{summary.transactionCount} records</strong></div>
        <div className="schedule-map">{schedules.map((item) => <div key={item.code}><b>{item.code}</b><span><strong>{item.name}</strong><small>{item.channel}</small></span><em>{item.rows.length}</em><button className="button" disabled={!item.rows.length} onClick={() => exportSchedule(item.code)} title={item.rows.length ? `Download schedule ${item.code}` : "No records mapped to this schedule"}>CSV</button></div>)}</div>
        <div className="form-actions">
          <button className="button" disabled={!transactions.length} onClick={() => downloadCsv(scheduleFileName(profile, period, "return-summary"), buildReturnSummaryCsv(profile, period, transactions))}>Download return summary</button>
          <a className="button" target="_blank" rel="noreferrer" href="https://www.ird.gov.lk/en/downloads/sitepages/schedules.aspx">Official schedules ↗</a>
          <button className="button primary" onClick={onOpenLedger}>Edit ledger</button>
        </div>
      </article>
      <article className="card pad">
        <div className="card-head"><div><h2>Human submission gates</h2><p>ComplyPilot calculates and prepares; RAMIS/e-Services remains authoritative.</p></div></div>
        <div className="return-gates">
          <Gate ok={profile.vatRegistrationStatus === "ACTIVE"} title="VAT registration active" detail={profile.vatRegistrationCertificateRef || "Add the IRD confirmation reference"} />
          <Gate ok={transactions.length > 0} title="Period transactions captured" detail={`${transactions.length} input/output records`} />
          <Gate ok={transactions.every((item) => item.counterpartyTin === "" || /^\d{9}$/.test(item.counterpartyTin))} title="TIN format check" detail="Counterparty TINs are blank or nine digits" />
          <Gate ok={transactions.every((item) => item.scheduleCode !== "NONE")} title="Every record maps to a schedule" detail={`${transactions.filter((item) => item.scheduleCode === "NONE").length} unmapped`} />
          <Gate ok={closed} title="Authorised period close" detail={closed ? `Period ${period.status.toLowerCase()}` : "Complete evidence and human approval"} />
        </div>
        <div className="return-actions"><button className="button primary" onClick={closed ? onFile : onClosePeriod}>{closed ? "Continue to filing handoff" : "Open period-closing workflow"}</button><p>Official guidance requires electronic submission of VAT returns and schedules through e-Services, unless IRD has approved another method.</p></div>
      </article>
    </div>
  </>;
}

function Gate({ ok, title, detail }: { ok: boolean; title: string; detail: string }) { return <div className={ok ? "ok" : "wait"}><span>{ok ? "✓" : "!"}</span><div><strong>{title}</strong><small>{detail}</small></div></div>; }
function money(value: number) { return new Intl.NumberFormat("en-LK", { style: "currency", currency: "LKR", maximumFractionDigits: 2 }).format(value); }
