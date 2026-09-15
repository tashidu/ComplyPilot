"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { calculateInvoiceLine, invoiceSerial, totalInvoiceLines } from "@/lib/vat-operations";
import type { BusinessProfile, GeneratedVatInvoice, VatPeriodRecord, VatSupplyType } from "@/lib/workspace/workspace";
import { canOperateVat } from "@/lib/workspace/profile-readiness";
import { PageHead } from "./ui";

type LineDraft = { description: string; quantity: number; unitPriceLkr: number };
export type VatInvoiceDraft = { invoiceDate: string; supplyDate: string; classificationCode: string; treatment: "STANDARD_18" | "ZERO_RATED"; supplyType: VatSupplyType; purchaserName: string; purchaserTin: string; purchaserAddress: string; placeOfSupply: string; paymentMode: string; lines: LineDraft[] };

export function VatInvoiceBuilder({ profile, period, generated, onSave, prefill }: { profile: BusinessProfile; period: VatPeriodRecord; generated: GeneratedVatInvoice[]; onSave: (value: VatInvoiceDraft) => Promise<GeneratedVatInvoice | null>; prefill?: { token: string; fields: Record<string, unknown> } | null }) {
  const [value, setValue] = useState<VatInvoiceDraft>({ invoiceDate: period.startDate, supplyDate: period.startDate, classificationCode: "BR01", treatment: "STANDARD_18", supplyType: "GOODS", purchaserName: "", purchaserTin: "", purchaserAddress: "", placeOfSupply: "", paymentMode: "Bank Transfer", lines: [{ description: "", quantity: 1, unitPriceLkr: 0 }] });
  const [saved, setSaved] = useState<GeneratedVatInvoice | null>(generated[0] ?? null);
  const [busy, setBusy] = useState(false);
  const lines = useMemo(() => value.lines.map((line) => calculateInvoiceLine(line, value.treatment)), [value.lines, value.treatment]);
  // Totalled through totalInvoiceLines rather than a raw reduce: VAT is taken
  // on the rounded net total so the invoice foots, and the stored figures are
  // whole cents rather than drifted doubles.
  const totals = totalInvoiceLines(lines, value.treatment);
  const previewNumber = (() => { try { return invoiceSerial(value.invoiceDate, value.classificationCode, generated.filter((item) => item.invoiceDate.slice(0, 7) === value.invoiceDate.slice(0, 7) && item.classificationCode === value.classificationCode).length + 1); } catch { return "YYMMM_CODE_#"; } })();

  function updateLine(index: number, patch: Partial<LineDraft>) { setValue((current) => ({ ...current, lines: current.lines.map((line, itemIndex) => itemIndex === index ? { ...line, ...patch } : line) })); }
  // A draft the copilot prepared arrives here, not saved. It fills the form so
  // the same review and the same save button apply as for anything typed by
  // hand; the token makes each proposal land once.
  const appliedPrefill = useRef<string | null>(null);
  useEffect(() => {
    if (!prefill || appliedPrefill.current === prefill.token) return;
    appliedPrefill.current = prefill.token;
    const f = prefill.fields as Partial<VatInvoiceDraft> & { lines?: LineDraft[] };
    setValue((current) => ({
      ...current,
      ...Object.fromEntries(
        Object.entries(f).filter(([key, v]) => key !== "lines" && v !== undefined && v !== ""),
      ),
      lines: Array.isArray(f.lines) && f.lines.length ? f.lines : current.lines,
    }));
  }, [prefill]);

  async function save() { setBusy(true); try { const result = await onSave(value); if (result) setSaved(result); } finally { setBusy(false); } }
  const ready = canOperateVat(profile) && /^\d{9}$/.test(profile.tin) && /^\d{9}$/.test(value.purchaserTin) && value.purchaserName.trim().length >= 2 && value.purchaserAddress.trim().length >= 3 && value.lines.every((line) => line.description.trim().length >= 2 && line.quantity > 0 && line.unitPriceLkr > 0);

  return <>
    <PageHead eyebrow="Gazette-aligned document" title="VAT Tax Invoice generator" lead="Create a deterministic LKR invoice with the required supplier, purchaser, serial, supply and VAT fields." action={saved ? <button className="button" onClick={() => window.print()}>Print latest invoice</button> : undefined} />
    {profile.vatRegistrationStatus !== "ACTIVE" ? <div className="registration-blocked"><div><strong>VAT registration is not confirmed</strong><p>A VAT Tax Invoice should not be issued from an unconfirmed profile.</p></div></div> : null}
    <div className="invoice-builder-grid">
      <article className="card pad invoice-form no-print"><div className="card-head"><div><h2>Invoice details</h2><p>Estimated number: {previewNumber}</p></div><span className="tag brand">{value.treatment === "STANDARD_18" ? "18% VAT" : "ZERO-RATED"}</span></div>
        <div className="workspace-form-grid">
          <label><span>Invoice date</span><input type="date" min={period.startDate} max={period.endDate} value={value.invoiceDate} onChange={(event) => setValue({ ...value, invoiceDate: event.target.value })} /></label>
          <label><span>Date of supply</span><input type="date" value={value.supplyDate} onChange={(event) => setValue({ ...value, supplyDate: event.target.value })} /></label>
          <label><span>Classification code (QQQQ)</span><input maxLength={15} value={value.classificationCode} onChange={(event) => setValue({ ...value, classificationCode: event.target.value.replace(/[^A-Za-z0-9]/g, "") })} /></label>
          <label><span>Tax treatment</span><select value={value.treatment} onChange={(event) => setValue({ ...value, treatment: event.target.value as VatInvoiceDraft["treatment"] })}><option value="STANDARD_18">Standard VAT — 18%</option><option value="ZERO_RATED">Zero-rated — 0%</option></select></label>
          <label><span>Goods or services</span><select value={value.supplyType} onChange={(event) => setValue({ ...value, supplyType: event.target.value as VatSupplyType })}><option value="GOODS">Goods</option><option value="SERVICES">Services</option></select></label>
          <label><span>Payment mode (optional)</span><input value={value.paymentMode} onChange={(event) => setValue({ ...value, paymentMode: event.target.value })} /></label>
          <label><span>Purchaser TIN — nine digits</span><input maxLength={9} inputMode="numeric" value={value.purchaserTin} onChange={(event) => setValue({ ...value, purchaserTin: event.target.value.replace(/\D/g, "") })} /></label>
          <label><span>Purchaser name</span><input value={value.purchaserName} onChange={(event) => setValue({ ...value, purchaserName: event.target.value })} /></label>
          <label className="span-two"><span>Purchaser registered address</span><input value={value.purchaserAddress} onChange={(event) => setValue({ ...value, purchaserAddress: event.target.value })} /></label>
          <label className="span-two"><span>Place of supply (optional)</span><input value={value.placeOfSupply} onChange={(event) => setValue({ ...value, placeOfSupply: event.target.value })} /></label>
        </div>
        <div className="invoice-lines"><div className="invoice-line-head"><strong>Supply lines</strong><button className="button" disabled={value.lines.length >= 20} onClick={() => setValue({ ...value, lines: [...value.lines, { description: "", quantity: 1, unitPriceLkr: 0 }] })}>Add line</button></div>{value.lines.map((line, index) => <div className="invoice-line" key={index}><input aria-label={`Line ${index + 1} description`} placeholder="Specific description" value={line.description} onChange={(event) => updateLine(index, { description: event.target.value })} /><input aria-label={`Line ${index + 1} quantity`} type="number" min="0.01" step="0.01" value={line.quantity} onChange={(event) => updateLine(index, { quantity: Number(event.target.value) })} /><input aria-label={`Line ${index + 1} unit price`} type="number" min="0.01" step="0.01" value={line.unitPriceLkr} onChange={(event) => updateLine(index, { unitPriceLkr: Number(event.target.value) })} /><strong>{money(lines[index].grossAmountLkr)}</strong>{value.lines.length > 1 ? <button aria-label={`Remove line ${index + 1}`} onClick={() => setValue({ ...value, lines: value.lines.filter((_, itemIndex) => itemIndex !== index) })}>×</button> : null}</div>)}</div>
        <div className="calculation-strip"><span>Net <b>{money(totals.netTotalLkr)}</b></span><i>+</i><span>VAT <b>{money(totals.vatTotalLkr)}</b></span><i>=</i><span>Total <b>{money(totals.grossTotalLkr)}</b></span></div>
        <div className="form-actions"><button className="button primary" disabled={!ready || busy} onClick={() => void save()}>{busy ? "Generating…" : "Generate & add to output VAT"}</button></div>
      </article>
      <InvoicePreview invoice={saved} profile={profile} preview={{ ...value, invoiceNumber: previewNumber, lines, netTotalLkr: totals.netTotalLkr, vatTotalLkr: totals.vatTotalLkr, grossTotalLkr: totals.grossTotalLkr }} />
    </div>
  </>;
}

function InvoicePreview({ invoice, profile, preview }: { invoice: GeneratedVatInvoice | null; profile: BusinessProfile; preview: Omit<VatInvoiceDraft, "lines"> & { invoiceNumber: string; lines: ReturnType<typeof calculateInvoiceLine>[]; netTotalLkr: number; vatTotalLkr: number; grossTotalLkr: number } }) {
  const shown = invoice ?? preview;
  return <article className="tax-invoice-preview"><header><div><span>TAX INVOICE</span><h2>{profile.legalName}</h2><p>{profile.address}</p><p>TIN {profile.tin} · {profile.contactPhone}</p></div><div><strong>{shown.invoiceNumber}</strong><small>Invoice {shown.invoiceDate}</small><small>Supply {shown.supplyDate}</small></div></header><section className="invoice-parties"><div><small>SUPPLIER</small><strong>{profile.legalName}</strong><span>TIN {profile.tin}</span><span>{profile.address}</span></div><div><small>PURCHASER</small><strong>{shown.purchaserName || "Purchaser name"}</strong><span>TIN {shown.purchaserTin || "000000000"}</span><span>{shown.purchaserAddress || "Registered address"}</span></div></section><table><thead><tr><th>Description</th><th>Qty</th><th>Unit LKR</th><th>Net LKR</th><th>VAT</th></tr></thead><tbody>{shown.lines.map((line, index) => <tr key={index}><td>{line.description || "Supply description"}</td><td>{line.quantity}</td><td>{money(line.unitPriceLkr)}</td><td>{money(line.netAmountLkr)}</td><td>{money(line.vatAmountLkr)}</td></tr>)}</tbody></table><footer><div><span>Place of supply: {shown.placeOfSupply || "—"}</span><span>Payment: {shown.paymentMode || "—"}</span><span>Values stated in Sri Lankan Rupees (LKR)</span></div><dl><div><dt>Net value</dt><dd>{money(shown.netTotalLkr)}</dd></div><div><dt>VAT</dt><dd>{money(shown.vatTotalLkr)}</dd></div><div className="total"><dt>Total</dt><dd>{money(shown.grossTotalLkr)}</dd></div></dl></footer><p className="invoice-draft-note">{invoice ? "Generated by ComplyPilot · Review before issuing" : "Live preview · save to assign the final serial"}</p></article>;
}

function money(value: number) { return new Intl.NumberFormat("en-LK", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value); }
