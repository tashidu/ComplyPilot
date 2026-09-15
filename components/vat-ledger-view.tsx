"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { calculateVat, scheduleFor, summariseVatPeriod, VAT_TREATMENT_LABELS } from "@/lib/vat-operations";
import type { BusinessProfile, BusinessWorkspace, VatPeriodRecord, VatSupplyType, VatTransactionKind, VatTreatment } from "@/lib/workspace/workspace";
import { canOperateVat } from "@/lib/workspace/profile-readiness";
import { PageHead } from "./ui";

export type VatTransactionDraft = { kind: VatTransactionKind; treatment: VatTreatment; supplyType: VatSupplyType; invoiceNumber: string; invoiceDate: string; counterpartyName: string; counterpartyTin: string; description: string; netAmountLkr: number; disallowedInputVatLkr: number };

export function VatLedgerView({ workspace, profile, period, onSave, onCreateInvoice, prefill }: { workspace: BusinessWorkspace; profile: BusinessProfile; period: VatPeriodRecord; onSave: (value: VatTransactionDraft) => Promise<boolean>; onCreateInvoice: () => void; prefill?: { token: string; fields: Record<string, unknown> } | null }) {
  const initial: VatTransactionDraft = { kind: "OUTPUT", treatment: "STANDARD_18", supplyType: "GOODS", invoiceNumber: "", invoiceDate: period.startDate, counterpartyName: "", counterpartyTin: "", description: "", netAmountLkr: 0, disallowedInputVatLkr: 0 };
  const [value, setValue] = useState(initial);
  const [adding, setAdding] = useState(false);

  // A copilot draft fills the form and opens it. Saving stays the user's act.
  const appliedPrefill = useRef<string | null>(null);
  useEffect(() => {
    if (!prefill || appliedPrefill.current === prefill.token) return;
    appliedPrefill.current = prefill.token;
    setValue((current) => ({
      ...current,
      ...Object.fromEntries(
        Object.entries(prefill.fields).filter(
          ([key, value]) =>
            key in current && value !== undefined && value !== "" && value !== null,
        ),
      ),
    }));
    setAdding(true);
  }, [prefill]);
  const transactions = workspace.vatTransactions.filter((item) => item.periodId === period.id);
  const summary = summariseVatPeriod(transactions);
  const calculation = calculateVat(value.netAmountLkr, value.treatment);
  const schedule = scheduleFor(value.kind, value.treatment, value.supplyType);
  const vatActive = canOperateVat(profile);

  async function save() { setAdding(true); try { if (await onSave(value)) setValue(initial); } finally { setAdding(false); } }
  return <>
    <PageHead eyebrow={`${profile.displayName} · ${period.label}`} title="Input & output VAT ledger" lead="Record sales and purchases once. ComplyPilot calculates VAT deterministically and maps each record to the appropriate preparation schedule." action={<button className="button primary" disabled={!vatActive} onClick={onCreateInvoice}>Create tax invoice</button>} />
    {!vatActive ? <div className="registration-blocked"><div><strong>Confirm VAT registration first</strong><p>Record the IRD-approved effective date and certificate or acknowledgement reference before using the VAT ledger.</p></div></div> : null}
    <div className="vat-summary-grid"><Metric label="Output VAT" value={summary.outputVatLkr} tone="brand" /><Metric label="Allowable input VAT" value={summary.allowableInputVatLkr} tone="ok" /><Metric label="Disallowed input VAT" value={summary.disallowedInputVatLkr} tone="warn" /><Metric label={summary.vatPayableLkr ? "VAT payable" : "Excess input credit"} value={summary.vatPayableLkr || summary.excessInputCreditLkr} tone={summary.vatPayableLkr ? "bad" : "ok"} /></div>
    <div className="grid two ledger-grid">
      <article className="card pad"><div className="card-head"><div><h2>Add transaction</h2><p>Amounts are recomputed on the server; AI cannot change the arithmetic.</p></div><span className="tag brand">Schedule {schedule}</span></div>
        <div className="workspace-form-grid">
          <label><span>Record type</span><select value={value.kind} onChange={(event) => setValue({ ...value, kind: event.target.value as VatTransactionKind })}><option value="OUTPUT">Output — sale</option><option value="INPUT_LOCAL">Input — local purchase</option><option value="INPUT_IMPORT">Input — import</option></select></label>
          <label><span>VAT treatment</span><select value={value.treatment} onChange={(event) => setValue({ ...value, treatment: event.target.value as VatTreatment })}>{Object.entries(VAT_TREATMENT_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
          <label><span>Supply type</span><select value={value.supplyType} onChange={(event) => setValue({ ...value, supplyType: event.target.value as VatSupplyType })}><option value="GOODS">Goods</option><option value="SERVICES">Services</option></select></label>
          <label><span>Invoice date</span><input type="date" value={value.invoiceDate} onChange={(event) => setValue({ ...value, invoiceDate: event.target.value })} /></label>
          <label><span>Invoice number</span><input value={value.invoiceNumber} onChange={(event) => setValue({ ...value, invoiceNumber: event.target.value })} /></label>
          <label><span>{value.kind === "OUTPUT" ? "Purchaser" : "Supplier"} TIN</span><input inputMode="numeric" maxLength={9} value={value.counterpartyTin} onChange={(event) => setValue({ ...value, counterpartyTin: event.target.value.replace(/\D/g, "") })} /></label>
          <label className="span-two"><span>{value.kind === "OUTPUT" ? "Purchaser" : "Supplier"} name</span><input value={value.counterpartyName} onChange={(event) => setValue({ ...value, counterpartyName: event.target.value })} /></label>
          <label className="span-two"><span>Supply description</span><input value={value.description} onChange={(event) => setValue({ ...value, description: event.target.value })} /></label>
          <label><span>Net value excluding VAT (LKR)</span><input type="number" min="0" value={value.netAmountLkr} onChange={(event) => setValue({ ...value, netAmountLkr: Number(event.target.value) })} /></label>
          {value.kind !== "OUTPUT" ? <label><span>Non-claimable input VAT (LKR)</span><input type="number" min="0" max={calculation.vatAmountLkr} value={value.disallowedInputVatLkr} onChange={(event) => setValue({ ...value, disallowedInputVatLkr: Number(event.target.value) })} /></label> : null}
        </div>
        <div className="calculation-strip"><span>Net <b>{money(calculation.netAmountLkr)}</b></span><i>+</i><span>VAT {calculation.vatRate}% <b>{money(calculation.vatAmountLkr)}</b></span><i>=</i><span>Gross <b>{money(calculation.grossAmountLkr)}</b></span></div>
        <div className="form-actions"><button className="button primary" disabled={!vatActive || adding || !value.invoiceNumber || !value.counterpartyName || value.netAmountLkr <= 0} onClick={() => void save()}>{adding ? "Saving…" : "Add to VAT ledger"}</button></div>
      </article>
      <article className="card pad"><div className="card-head"><div><h2>Current-period records</h2><p>{transactions.length} record{transactions.length === 1 ? "" : "s"} mapped to VAT schedules.</p></div></div><div className="ledger-list">{transactions.map((item) => <div key={item.id}><span className={`transaction-kind ${item.kind === "OUTPUT" ? "output" : "input"}`}>{item.kind === "OUTPUT" ? "OUT" : "IN"}</span><section><strong>{item.invoiceNumber} · {item.counterpartyName}</strong><small>{item.invoiceDate} · Schedule {item.scheduleCode} · {VAT_TREATMENT_LABELS[item.treatment]}</small></section><aside><strong>{money(item.vatAmountLkr)}</strong><small>VAT</small></aside></div>)}{!transactions.length ? <p className="empty-state">No VAT transactions recorded for this period.</p> : null}</div></article>
    </div>
  </>;
}

function Metric({ label, value, tone }: { label: string; value: number; tone: string }) { return <article className={`vat-metric ${tone}`}><span>{label}</span><strong>{money(value)}</strong></article>; }
function money(value: number) { return new Intl.NumberFormat("en-LK", { style: "currency", currency: "LKR", maximumFractionDigits: 2 }).format(value); }
