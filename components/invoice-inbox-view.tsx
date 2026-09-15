"use client";

import { useRef } from "react";
import type { BusinessProfile, BusinessWorkspace, VatPeriodRecord } from "@/lib/workspace/workspace";
import { PageHead } from "./ui";

function money(value: number | null) {
  return value === null ? "—" : new Intl.NumberFormat("en-LK", { style: "currency", currency: "LKR", maximumFractionDigits: 0 }).format(value);
}

export function InvoiceInboxView({
  workspace,
  profile,
  period,
  busy,
  onAddFiles,
}: {
  workspace: BusinessWorkspace;
  profile: BusinessProfile;
  period: VatPeriodRecord;
  busy: boolean;
  onAddFiles: (files: FileList | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const items = workspace.inbox.filter((item) => item.periodId === period.id);
  const review = items.filter((item) => item.status === "NEEDS_REVIEW" || item.status === "FAILED").length;
  const locked = period.status === "APPROVED" || period.status === "SUBMITTED";
  return (
    <>
      <PageHead
        eyebrow={`${profile.displayName} · ${period.label}`}
        title="Invoice inbox"
        lead="Add invoices and schedule evidence gradually. Each upload is saved to this VAT period; uploading does not submit anything."
        action={<button className="button primary" disabled={busy || locked} onClick={() => inputRef.current?.click()}>{locked ? "Period closed" : busy ? "Processing…" : "Add documents"}</button>}
      />
      <input ref={inputRef} className="sr-only" type="file" multiple accept="image/jpeg,image/png,image/webp,image/bmp,.csv,text/csv" onChange={(event) => { onAddFiles(event.target.files); event.currentTarget.value = ""; }} />
      <div className="grid three">
        <article className="card metric"><div className="metric-icon brand">↓</div><div><strong>{items.length}</strong><span>Saved period records</span></div></article>
        <article className="card metric"><div className="metric-icon mint">✓</div><div><strong>{items.filter((item) => item.status === "MATCHED").length}</strong><span>Matched records</span></div></article>
        <article className="card metric"><div className="metric-icon amber">!</div><div><strong>{review}</strong><span>Need attention</span></div></article>
      </div>
      <article className="card pad inbox-table-card">
        <div className="table-wrap">
          <table>
            <thead><tr><th>Document</th><th>Supplier / type</th><th>Added</th><th className="text-right">VAT</th><th>Status</th></tr></thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td><strong>{item.reference}</strong><small>{item.fileName}</small></td>
                  <td>{item.supplierName ?? item.documentType.replaceAll("_", " ")}<small>{item.dataMode === "SYNTHETIC_DEMO" ? "Synthetic demo evidence" : "User-provided evidence"}</small></td>
                  <td>{new Date(item.uploadedAt).toLocaleDateString("en-LK")}</td>
                  <td className="text-right">{money(item.vatAmountLkr)}</td>
                  <td><span className={`tag ${item.status === "MATCHED" || item.status === "PROCESSED" ? "ok" : item.status === "FAILED" ? "alert" : "warn"}`}>{item.status.replaceAll("_", " ")}</span></td>
                </tr>
              ))}
              {items.length === 0 ? <tr><td colSpan={5}><div className="empty-state">No records yet. Add the first invoice or VAT Schedule CSV for this period.</div></td></tr> : null}
            </tbody>
          </table>
        </div>
      </article>
    </>
  );
}
