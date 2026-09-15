"use client";

import { useEffect, useState } from "react";
import type { BusinessProfile, BusinessWorkspace, RamisApiProfile, RamisApiStatus } from "@/lib/workspace/workspace";
import { canOperateVat } from "@/lib/workspace/profile-readiness";
import { PageHead } from "./ui";

export type RamisApiDraft = Omit<RamisApiProfile, "profileId" | "updatedAt">;
const EMPTY: RamisApiDraft = { status: "NOT_STARTED", integrationReference: "", erpSystemName: "", technicalContactEmail: "", ssid: "", credentialsConfigured: false, baseUrlReceivedFromIrd: false, scheduleScopes: ["SCHEDULE_01", "SCHEDULE_04", "SCHEDULE_07"], notes: "" };

export function RamisApiView({ workspace, profile, onSave, onOpenRegistration }: { workspace: BusinessWorkspace; profile: BusinessProfile; onSave: (value: RamisApiDraft) => Promise<boolean>; onOpenRegistration: () => void }) {
  const stored = workspace.ramisApiProfiles.find((item) => item.profileId === profile.id);
  const [value, setValue] = useState<RamisApiDraft>(() => stored ? withoutIds(stored) : { ...EMPTY, technicalContactEmail: profile.financeEmail, erpSystemName: profile.accountingSystem });
  const [saving, setSaving] = useState(false);
  useEffect(() => setValue(stored ? withoutIds(stored) : { ...EMPTY, technicalContactEmail: profile.financeEmail, erpSystemName: profile.accountingSystem }), [profile.id, stored?.updatedAt]);
  const eligible = canOperateVat(profile);
  const checks = [eligible, Boolean(value.integrationReference), Boolean(value.ssid), value.credentialsConfigured, value.baseUrlReceivedFromIrd];

  async function save() { setSaving(true); try { await onSave(value); } finally { setSaving(false); } }
  const emailBody = encodeURIComponent(`Business: ${profile.legalName}\nTIN: ${profile.tin}\nERP/accounting system: ${value.erpSystemName}\nTechnical contact: ${value.technicalContactEmail}\n\nPlease advise the official onboarding steps and technical specification for VAT Web API integration with RAMIS.`);

  return <>
    <PageHead eyebrow="Official integration path" title="RAMIS Web API onboarding" lead="Track the information IRD gives your ERP team. This page never stores the RAMIS password and does not invent an endpoint." action={<span className={`tag ${value.status === "APPROVED" ? "ok" : "warn"}`}>{value.status.replaceAll("_", " ")}</span>} />
    <div className="notice"><span>i</span><div><b>API access is not automatic after VAT registration.</b> IRD is onboarding sectors in phases. The published flow authenticates an approved SSID/password to obtain a JWT; production URLs and schemas must come from IRD.</div></div>
    {!eligible ? <div className="registration-blocked"><div><strong>VAT registration must be confirmed first</strong><p>Prepare the application and finish registration on IRD e-Services before requesting Web API onboarding.</p></div><button className="button primary" onClick={onOpenRegistration}>Open VAT registration</button></div> : null}
    <div className="grid two ramis-grid">
      <article className="card pad">
        <div className="card-head"><div><h2>Onboarding record</h2><p>Metadata only—no password, JWT or taxpayer secret is stored.</p></div><strong>{checks.filter(Boolean).length}/{checks.length}</strong></div>
        <div className="workspace-form-grid">
          <label><span>Onboarding status</span><select value={value.status} onChange={(event) => setValue({ ...value, status: event.target.value as RamisApiStatus })}><option value="NOT_STARTED">Not started</option><option value="CONTACT_IRD">Contact IRD</option><option value="ONBOARDING">Technical onboarding</option><option value="APPROVED">IRD-approved integration</option></select></label>
          <label><span>IRD integration / ticket reference</span><input value={value.integrationReference} onChange={(event) => setValue({ ...value, integrationReference: event.target.value })} /></label>
          <label><span>ERP or accounting system</span><input value={value.erpSystemName} onChange={(event) => setValue({ ...value, erpSystemName: event.target.value })} /></label>
          <label><span>Technical contact email</span><input type="email" value={value.technicalContactEmail} onChange={(event) => setValue({ ...value, technicalContactEmail: event.target.value })} /></label>
          <label className="span-two"><span>SSID supplied by IRD (identifier only)</span><input value={value.ssid} onChange={(event) => setValue({ ...value, ssid: event.target.value })} placeholder="Never enter the SSID password here" /></label>
          <label className="checkbox-field span-two"><input type="checkbox" checked={value.baseUrlReceivedFromIrd} onChange={(event) => setValue({ ...value, baseUrlReceivedFromIrd: event.target.checked })} /><span>IRD provided the production base URL and current API specification</span></label>
          <label className="checkbox-field span-two"><input type="checkbox" checked={value.credentialsConfigured} onChange={(event) => setValue({ ...value, credentialsConfigured: event.target.checked })} /><span>SSID/password are configured in a protected server environment—not in this UI</span></label>
          <label className="span-two"><span>Technical notes</span><textarea rows={3} value={value.notes} onChange={(event) => setValue({ ...value, notes: event.target.value })} /></label>
        </div>
        <div className="form-actions"><button className="button primary" disabled={saving || !eligible} onClick={() => void save()}>{saving ? "Saving…" : "Save API onboarding"}</button></div>
      </article>
      <article className="card pad api-facts"><div className="card-head"><div className="card-head-icon" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M7.5 12.5 4 9l3.5-3.5M12.5 7.5 16 11l-3.5 3.5" /><path d="M11.2 3.4 8.8 16.6" /></svg></div><div><h2>What the integration needs</h2><p>Published 2026 flow</p></div></div><ol><li><b>Active VAT registration</b><span>TIN and IRD-approved onboarding.</span></li><li><b>SSID + server-side password</b><span>Authentication returns a JWT for later requests.</span></li><li><b>IRD-issued API specification</b><span>Base URL, schemas and test process must be supplied by IRD.</span></li><li><b>ERP invoice mapping</b><span>Current published scope: Schedule 01, 04 and 07.</span></li><li><b>Post-submit review</b><span>Purchasers review Schedule 02/04 records in RAMIS.</span></li></ol><a className="button primary wide" href={`mailto:ramis.webapi@ird.gov.lk?subject=VAT%20Web%20API%20onboarding%20request&body=${emailBody}`}>Email ramis.webapi@ird.gov.lk</a><a className="button wide" target="_blank" rel="noreferrer" href="https://www.ird.gov.lk/en/eServices/Lists/FilingReturns/Attachments/17/VAT_WEB_API_Quick_Guide_v0_1.pdf">Open official Web API guide ↗</a></article>
    </div>
  </>;
}

function withoutIds(value: RamisApiProfile): RamisApiDraft { const { profileId: _profile, updatedAt: _updated, ...draft } = value; return draft; }
