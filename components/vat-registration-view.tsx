"use client";

import { useEffect, useMemo, useState } from "react";
import { buildVatDocumentChecklist, createVatRegistrationDraft, registrationReadiness, turnoverAssessment, VAT_REGISTRATION_SOURCES, type TaxableActivityKind } from "@/lib/vat-registration";
import type { BusinessProfile, BusinessWorkspace, VatRegistrationApplication, VatRegistrationBasis } from "@/lib/workspace/workspace";
import { PageHead } from "./ui";

const BASIS_LABELS: Record<VatRegistrationBasis, string> = {
  TURNOVER: "Turnover threshold exceeded",
  VOLUNTARY: "Voluntary registration",
  IMPORT_EXPORT: "Importer / exporter",
  SECTION_10C_NEW_BUSINESS: "New business — Section 10C",
  TEMPORARY: "Temporary VAT registration",
};

const STEPS = ["Eligibility", "Application", "Documents", "Review"];
type RegistrationDraft = Omit<VatRegistrationApplication, "id" | "profileId" | "status" | "updatedAt">;

function editable(application: VatRegistrationApplication): RegistrationDraft {
  const { id: _id, profileId: _profileId, status: _status, updatedAt: _updatedAt, ...draft } = application;
  return draft;
}

function money(value: number) {
  return new Intl.NumberFormat("en-LK", { style: "currency", currency: "LKR", maximumFractionDigits: 0 }).format(value);
}

export function VatRegistrationView({ workspace, profile, onSave, onOpenProfile, onConfirmRegistration }: {
  workspace: BusinessWorkspace;
  profile: BusinessProfile;
  onSave: (draft: RegistrationDraft) => Promise<boolean>;
  onOpenProfile: () => void;
  onConfirmRegistration?: (effectiveDate: string, certificateReference: string) => Promise<boolean>;
}) {
  const stored = workspace.vatRegistrations.find((item) => item.profileId === profile.id);
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<RegistrationDraft>(() => editable(stored ?? createVatRegistrationDraft(profile)));
  const [saving, setSaving] = useState(false);
  /** Financial services are liable on their own, much lower thresholds. */
  const [activity, setActivity] = useState<TaxableActivityKind>("GENERAL");
  const [effectiveDate, setEffectiveDate] = useState(profile.vatRegistrationEffectiveDate);
  const [certificateReference, setCertificateReference] = useState(profile.vatRegistrationCertificateRef);

  useEffect(() => setDraft(editable(stored ?? createVatRegistrationDraft(profile))), [profile.id, stored?.updatedAt]);
  useEffect(() => { setEffectiveDate(profile.vatRegistrationEffectiveDate); setCertificateReference(profile.vatRegistrationCertificateRef); }, [profile.id, profile.vatRegistrationEffectiveDate, profile.vatRegistrationCertificateRef]);

  const application = useMemo<VatRegistrationApplication>(() => ({
    ...draft,
    id: stored?.id ?? "UNSAVED",
    profileId: profile.id,
    status: stored?.status ?? "NOT_STARTED",
    updatedAt: stored?.updatedAt ?? new Date(0).toISOString(),
  }), [draft, profile.id, stored]);
  const readiness = useMemo(() => registrationReadiness(application, profile), [application, profile]);
  const turnover = turnoverAssessment(draft.taxableSuppliesLastQuarterLkr, draft.estimatedTaxableSuppliesNext12MonthsLkr, activity);

  function update<K extends keyof RegistrationDraft>(key: K, value: RegistrationDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function chooseBasis(basis: VatRegistrationBasis) {
    setDraft((current) => ({ ...current, basis, documents: buildVatDocumentChecklist(basis, profile.entityType, current.documents) }));
  }

  async function save(nextStep?: number) {
    setSaving(true);
    try {
      const ok = await onSave(draft);
      if (ok && nextStep !== undefined) setStep(nextStep);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHead eyebrow="IRD registration preparation" title="VAT Registration Assistant" lead="A guided TIN → e-Services → VAT tax-type workflow built from the IRD 2026 taxpayer-registration guide and TPR 005 form." action={<span className={`tag ${readiness.ready ? "ok" : "warn"}`}>{readiness.percentage}% prepared</span>} />

      <div className="registration-boundary"><strong>Preparation only</strong><span>ComplyPilot prepares and checks information. It does not create an IRD account, submit this application, or store your IRD password/PIN.</span></div>

      {profile.vatRegistrationStatus === "ACTIVE" ? <div className="vat-active-banner"><span>✓</span><div><strong>VAT registration marked active</strong><p>TIN {profile.tin}{profile.vatRegistrationEffectiveDate ? ` · effective ${profile.vatRegistrationEffectiveDate}` : ""}{profile.vatRegistrationCertificateRef ? ` · reference ${profile.vatRegistrationCertificateRef}` : ""}. This is user-supplied profile data, not a live RAMIS verification.</p></div></div> : null}

      <div className="registration-prerequisites">
        <button className={/^\d{9}$/.test(profile.tin) ? "done" : ""} onClick={onOpenProfile}><b>1</b><span><strong>Get TIN</strong><small>{profile.tin ? `TIN ${profile.tin}` : "Add your nine-digit TIN"}</small></span></button>
        <button className={profile.irdPinStatus === "ACTIVE" ? "done" : ""} onClick={onOpenProfile}><b>2</b><span><strong>Activate PIN / SSID</strong><small>{profile.irdPinStatus.replaceAll("_", " ").toLowerCase()}</small></span></button>
        <button className={stored ? "done" : ""} onClick={() => setStep(0)}><b>3</b><span><strong>Prepare VAT application</strong><small>{stored?.status.replaceAll("_", " ").toLowerCase() ?? "not started"}</small></span></button>
        <a href={VAT_REGISTRATION_SOURCES.eServices} target="_blank" rel="noreferrer"><b>4</b><span><strong>Human submits in IRD</strong><small>Open official e-Services ↗</small></span></a>
      </div>

      <div className="registration-stepper" aria-label="VAT registration steps">
        {STEPS.map((label, index) => <button key={label} className={`${step === index ? "active" : ""}${index < step ? " complete" : ""}`} onClick={() => setStep(index)}><span>{index < step ? "✓" : index + 1}</span>{label}</button>)}
      </div>

      {step === 0 ? <section className="card pad registration-card">
        <div className="card-head"><div><h2>Choose the correct registration route</h2><p>The document list changes automatically based on this answer.</p></div><span className={`tag ${turnover.mandatory ? "bad" : "neutral"}`}>{turnover.mandatory ? "Threshold indicated" : "Check your basis"}</span></div>
        <div className="workspace-form-grid">
          <label className="span-two"><span>Registration basis</span><select value={draft.basis} onChange={(event) => chooseBasis(event.target.value as VatRegistrationBasis)}>{Object.entries(BASIS_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
          <label><span>Taxable supplies — latest quarter (LKR)</span><input type="number" min="0" value={draft.taxableSuppliesLastQuarterLkr} onChange={(event) => update("taxableSuppliesLastQuarterLkr", Number(event.target.value))} /></label>
          <label><span>Estimated taxable supplies — next 12 months (LKR)</span><input type="number" min="0" value={draft.estimatedTaxableSuppliesNext12MonthsLkr} onChange={(event) => update("estimatedTaxableSuppliesNext12MonthsLkr", Number(event.target.value))} /></label>
          <label className="span-two"><span>Type of taxable activity</span><select value={activity} onChange={(event) => setActivity(event.target.value as TaxableActivityKind)}><option value="GENERAL">General goods and services</option><option value="FINANCIAL_SERVICES">Supply of financial services</option></select></label>
          <label className="span-two"><span>Why are you applying?</span><textarea rows={3} placeholder="Describe the business, registration basis and expected taxable activities." value={draft.reason} onChange={(event) => update("reason", event.target.value)} /></label>
        </div>
        <div className={`eligibility-result ${turnover.mandatory ? "mandatory" : "optional"}`}><strong>{turnover.mandatory ? "Mandatory threshold may be met" : "Threshold not indicated by these values"}</strong><p>IRD currently states over {money(turnover.thresholds.quarterLkr)} per quarter or {money(turnover.thresholds.twelveMonthsLkr)} in 12 months for {activity === "FINANCIAL_SERVICES" ? "the supply of financial services" : "general goods and services"}. Importers and exporters of commercial goods must register regardless of turnover, and voluntary registration may still be possible.</p><small>Decision support only · confirm timing and classification with IRD or a tax professional.</small></div>
        <div className="form-actions"><button className="button primary" disabled={saving} onClick={() => void save(1)}>{saving ? "Saving…" : "Save & continue"}</button></div>
      </section> : null}

      {step === 1 ? <section className="card pad registration-card">
        <div className="card-head"><div><h2>TPR 005 application details</h2><p>Fields mirror the main VAT section of the official tax-type application.</p></div><a className="text-link" href={VAT_REGISTRATION_SOURCES.taxTypeForm} target="_blank" rel="noreferrer">View TPR 005 ↗</a></div>
        <div className="workspace-form-grid">
          <label><span>Premises number</span><input value={draft.premisesNo} onChange={(event) => update("premisesNo", event.target.value)} /></label>
          <label><span>Unit number (if any)</span><input value={draft.unitNo} onChange={(event) => update("unitNo", event.target.value)} /></label>
          <label className="span-two"><span>Address for this tax type</span><input value={draft.taxTypeAddress} onChange={(event) => update("taxTypeAddress", event.target.value)} /></label>
          <label><span>Postal code</span><input value={draft.postalCode} onChange={(event) => update("postalCode", event.target.value)} /></label>
          <label><span>VAT-liable business activity</span><input value={draft.businessActivity} onChange={(event) => update("businessActivity", event.target.value)} /></label>
          <label><span>Activity code (if known)</span><input value={draft.activityCode} onChange={(event) => update("activityCode", event.target.value)} /></label>
          <label><span>Requested effective date</span><input type="date" value={draft.requestedEffectiveDate} onChange={(event) => update("requestedEffectiveDate", event.target.value)} /></label>
          <label><span>First transaction date</span><input type="date" value={draft.firstTransactionDate} onChange={(event) => update("firstTransactionDate", event.target.value)} /></label>
          <label><span>Estimated first taxable-supply date</span><input type="date" value={draft.estimatedTaxableSupplyDate} onChange={(event) => update("estimatedTaxableSupplyDate", event.target.value)} /></label>
          <label><span>Total taxable supplies to date (LKR)</span><input type="number" min="0" value={draft.taxableSuppliesToDateLkr} onChange={(event) => update("taxableSuppliesToDateLkr", Number(event.target.value))} /></label>
          <label className="span-two"><span>Address where operations are carried out</span><input value={draft.operationAddress} onChange={(event) => update("operationAddress", event.target.value)} /></label>
          <label><span>Authorised signatory name</span><input value={draft.signatoryName} onChange={(event) => update("signatoryName", event.target.value)} /></label>
          <label><span>Signatory NIC / passport</span><input value={draft.signatoryNic} onChange={(event) => update("signatoryNic", event.target.value)} /></label>
          <label className="checkbox-field span-two"><input type="checkbox" checked={draft.cashBasisRequested} onChange={(event) => update("cashBasisRequested", event.target.checked)} /><span>Request VAT accounting on cash basis (subject to IRD approval)</span></label>
        </div>
        <div className="form-actions"><button className="button" onClick={() => setStep(0)}>Back</button><button className="button primary" disabled={saving} onClick={() => void save(2)}>{saving ? "Saving…" : "Save & continue"}</button></div>
      </section> : null}

      {step === 2 ? <section className="card pad registration-card">
        <div className="card-head"><div><h2>Evidence checklist</h2><p>{BASIS_LABELS[draft.basis]} · {profile.entityType.replaceAll("_", " ").toLowerCase()}</p></div><a className="text-link" href={VAT_REGISTRATION_SOURCES.guideline} target="_blank" rel="noreferrer">IRD 2026 guide ↗</a></div>
        <div className="document-checklist">{draft.documents.map((document, index) => <div className={`document-row ${document.status === "READY" ? "ready" : ""}`} key={document.key}><button onClick={() => setDraft((current) => ({ ...current, documents: current.documents.map((item, itemIndex) => itemIndex === index ? { ...item, status: item.status === "READY" ? "MISSING" : "READY" } : item) }))} aria-label={`Mark ${document.label} ${document.status === "READY" ? "missing" : "ready"}`}>{document.status === "READY" ? "✓" : ""}</button><div><strong>{document.label}</strong><span>{document.required ? "Required for this route" : "Only when applicable"}</span><input placeholder="Evidence note or filename (optional)" value={document.note} onChange={(event) => setDraft((current) => ({ ...current, documents: current.documents.map((item, itemIndex) => itemIndex === index ? { ...item, note: event.target.value } : item) }))} /></div></div>)}</div>
        <div className="form-actions"><button className="button" onClick={() => setStep(1)}>Back</button><button className="button primary" disabled={saving} onClick={() => void save(3)}>{saving ? "Saving…" : "Save & review"}</button></div>
      </section> : null}

      {step === 3 ? <section className="card pad registration-card">
        <div className="registration-review-head"><div className="readiness-ring" style={{ "--progress": `${readiness.percentage * 3.6}deg` } as React.CSSProperties}><span>{readiness.percentage}%</span></div><div><span className="eyebrow">Application readiness</span><h2>{readiness.ready ? "Ready for human review" : `${readiness.total - readiness.completed} checks still need attention`}</h2><p>Review the gaps below before an authorised person enters the data in IRD e-Services.</p></div></div>
        <div className="readiness-list">{readiness.checks.map((check) => <button key={check.label} className={check.passed ? "passed" : "missing"} onClick={() => !check.passed && setStep(check.label.includes("evidence") ? 2 : check.label.includes("TIN") || check.label.includes("PIN") || check.label.includes("identity") ? 0 : 1)}><span>{check.passed ? "✓" : "!"}</span><strong>{check.label}</strong><small>{check.passed ? "Complete" : "Needs attention"}</small></button>)}</div>
        <div className="official-action"><div><strong>Final step stays human-controlled</strong><p>Download/open the official guidance, check the information, and submit through IRD e-Services. Do not share your IRD credentials with ComplyPilot.</p></div><a className="button primary" href={VAT_REGISTRATION_SOURCES.registration} target="_blank" rel="noreferrer">Open official IRD registration ↗</a></div>
        {profile.vatRegistrationStatus !== "ACTIVE" ? <div className="registration-confirm"><div><span className="eyebrow">After IRD approves the registration</span><h3>Record the result</h3><p>This does not call RAMIS. It stores the confirmation reference supplied by the user.</p></div><label><span>Effective date</span><input type="date" value={effectiveDate} onChange={(event) => setEffectiveDate(event.target.value)} /></label><label><span>Certificate / acknowledgement reference</span><input value={certificateReference} onChange={(event) => setCertificateReference(event.target.value)} /></label><button className="button primary" disabled={!effectiveDate || certificateReference.trim().length < 3 || saving || !onConfirmRegistration} onClick={async () => { if (!onConfirmRegistration) return; setSaving(true); try { await onConfirmRegistration(effectiveDate, certificateReference); } finally { setSaving(false); } }}>Mark IRD registration confirmed</button></div> : null}
        <div className="form-actions"><button className="button" onClick={() => setStep(2)}>Back</button><button className="button primary" disabled={saving} onClick={() => void save()}>{saving ? "Saving…" : "Save registration pack"}</button></div>
      </section> : null}
    </>
  );
}

export type { RegistrationDraft };
