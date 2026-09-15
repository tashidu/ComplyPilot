"use client";

import { useMemo, useState } from "react";
import { filterInvoices, INVOICE_STATUS_LABELS, issueBlocker, sequenceGaps, summariseInvoices, voidBlocker } from "@/lib/vat-invoice-register";
import { VAT_TREATMENT_LABELS } from "@/lib/vat-operations";
import type { BusinessProfile, BusinessWorkspace, GeneratedVatInvoice, VatInvoiceStatus } from "@/lib/workspace/workspace";
import { PageHead } from "./ui";

const STATUS_FILTERS: (VatInvoiceStatus | "ALL")[] = ["ALL", "DRAFT", "ISSUED", "VOID"];

export function InvoiceRegisterView({ workspace, profile, busy, onIssue, onVoid, onDuplicate, onCreate }: {
  workspace: BusinessWorkspace;
  profile: BusinessProfile;
  busy: boolean;
  onIssue: (invoice: GeneratedVatInvoice) => Promise<boolean>;
  onVoid: (invoice: GeneratedVatInvoice, reason: string) => Promise<boolean>;
  onDuplicate: (invoice: GeneratedVatInvoice) => void;
  onCreate: () => void;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<VatInvoiceStatus | "ALL">("ALL");
  /** The invoice whose void reason is being typed, if any. */
  const [voiding, setVoiding] = useState<{ id: string; reason: string } | null>(null);

  const invoices = useMemo(
    () => workspace.generatedInvoices.filter((item) => item.profileId === profile.id),
    [workspace.generatedInvoices, profile.id],
  );
  const shown = useMemo(() => filterInvoices(invoices, { query, status }), [invoices, query, status]);
  const summary = summariseInvoices(invoices);
  const gaps = sequenceGaps(invoices);
  const periodFor = (invoice: GeneratedVatInvoice) => workspace.periods.find((item) => item.id === invoice.periodId);

  async function confirmVoid(invoice: GeneratedVatInvoice) {
    if (!voiding || voiding.reason.trim().length < 4) return;
    if (await onVoid(invoice, voiding.reason.trim())) setVoiding(null);
  }

  return <>
    <PageHead eyebrow={profile.displayName} title="Tax invoice register" lead="Every invoice this business has generated, with its status and the ledger effect behind it. A tax invoice is never edited after issue — it is voided and replaced." action={<button className="button primary" onClick={onCreate}>Create tax invoice</button>} />

    <div className="vat-summary-grid">
      <Metric label="Issued" value={String(summary.issuedCount)} detail={`${money(summary.issuedVatTotalLkr)} output VAT`} tone="ok" />
      <Metric label="Draft" value={String(summary.draftCount)} detail="Not yet given to a purchaser" tone="warn" />
      <Metric label="Void" value={String(summary.voidCount)} detail="Withdrawn, excluded from totals" tone="bad" />
      <Metric label="Live invoiced value" value={money(summary.grossTotalLkr)} detail={`${money(summary.netTotalLkr)} net + ${money(summary.vatTotalLkr)} VAT`} tone="brand" />
    </div>

    {gaps.length ? <div className="invoice-gap-note"><strong>Gaps in the issued sequence</strong><p>{gaps.join(", ")} {gaps.length === 1 ? "is" : "are"} missing. A jump in an invoice serial is the first thing an auditor asks about — account for each one before filing.</p></div> : null}

    <section className="card pad">
      <div className="card-head">
        <div><h2>Invoices</h2><p>{shown.length} of {summary.total} shown.</p></div>
        <div className="register-filters">
          <input aria-label="Search invoices" placeholder="Invoice number, purchaser or TIN" value={query} onChange={(event) => setQuery(event.target.value)} />
          <select aria-label="Filter by status" value={status} onChange={(event) => setStatus(event.target.value as VatInvoiceStatus | "ALL")}>
            {STATUS_FILTERS.map((value) => <option key={value} value={value}>{value === "ALL" ? "All statuses" : INVOICE_STATUS_LABELS[value]}</option>)}
          </select>
        </div>
      </div>

      <div className="invoice-register">
        {shown.map((invoice) => {
          const period = periodFor(invoice);
          const cannotIssue = issueBlocker(invoice, period);
          const cannotVoid = voidBlocker(invoice, period);
          const isVoiding = voiding?.id === invoice.id;
          return <article key={invoice.id} className={`invoice-row ${invoice.status.toLowerCase()}`}>
            <div className="invoice-row-main">
              <div>
                <strong>{invoice.invoiceNumber}</strong>
                <small>{invoice.invoiceDate} · {invoice.purchaserName} · TIN {invoice.purchaserTin}</small>
                <small>{VAT_TREATMENT_LABELS[invoice.treatment]} · {invoice.supplyType.toLowerCase()} · {invoice.lines.length} line{invoice.lines.length === 1 ? "" : "s"}{period ? ` · ${period.label}` : ""}</small>
              </div>
              <div className="invoice-row-amounts">
                <span>Net <b>{money(invoice.netTotalLkr)}</b></span>
                <span>VAT <b>{money(invoice.vatTotalLkr)}</b></span>
                <span>Total <b>{money(invoice.grossTotalLkr)}</b></span>
              </div>
              <span className={`tag ${invoice.status === "ISSUED" ? "ok" : invoice.status === "VOID" ? "bad" : "warn"}`}>{INVOICE_STATUS_LABELS[invoice.status]}</span>
            </div>

            {invoice.status === "VOID" ? <p className="invoice-void-reason">Voided{invoice.voidedAt ? ` on ${invoice.voidedAt.slice(0, 10)}` : ""}: {invoice.voidReason}</p> : null}

            {isVoiding ? <div className="invoice-void-form">
              <label><span>Why is {invoice.invoiceNumber} being voided?</span><input autoFocus value={voiding.reason} placeholder="For example: wrong purchaser TIN, replaced by a corrected invoice" onChange={(event) => setVoiding({ id: invoice.id, reason: event.target.value })} /></label>
              <p>Voiding withdraws {money(invoice.vatTotalLkr)} of output VAT from {period?.label ?? "the period"}. The invoice stays on the register with this reason.</p>
              <div className="form-actions">
                <button className="button" onClick={() => setVoiding(null)}>Cancel</button>
                <button className="button danger" disabled={busy || voiding.reason.trim().length < 4} onClick={() => void confirmVoid(invoice)}>{busy ? "Voiding…" : "Confirm void"}</button>
              </div>
            </div> : <div className="invoice-row-actions">
              <button className="button" disabled={busy || Boolean(cannotIssue)} title={cannotIssue ?? "Mark this invoice as issued to the purchaser"} onClick={() => void onIssue(invoice)}>Mark issued</button>
              <button className="button" disabled={busy || Boolean(cannotVoid)} title={cannotVoid ?? "Withdraw this invoice"} onClick={() => setVoiding({ id: invoice.id, reason: "" })}>Void</button>
              <button className="button" onClick={() => onDuplicate(invoice)} title="Open a new draft prefilled from this invoice">Duplicate</button>
            </div>}
          </article>;
        })}
        {!shown.length ? <p className="empty-state">{summary.total ? "No invoice matches this search." : "No tax invoice has been generated for this business yet."}</p> : null}
      </div>
    </section>
  </>;
}

const METRIC_ICON: Record<string, { glyph: string; tone: string }> = {
  ok: { glyph: "\u2713", tone: "mint" },
  warn: { glyph: "\u270e", tone: "amber" },
  bad: { glyph: "\u2715", tone: "red" },
  brand: { glyph: "\u03a3", tone: "brand" },
};

function Metric({ label, value, detail, tone }: { label: string; value: string; detail: string; tone: string }) {
  const icon = METRIC_ICON[tone] ?? METRIC_ICON.brand;
  return <article className={`vat-metric ${tone}`}>
    <div className={`metric-icon ${icon.tone}`} aria-hidden="true">{icon.glyph}</div>
    <div><span>{label}</span><strong className="mono">{value}</strong><small>{detail}</small></div>
  </article>;
}

function money(value: number) { return new Intl.NumberFormat("en-LK", { style: "currency", currency: "LKR", maximumFractionDigits: 2 }).format(value); }
