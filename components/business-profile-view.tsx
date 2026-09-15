"use client";

import { useEffect, useState } from "react";
import type { BusinessProfile, BusinessWorkspace } from "@/lib/workspace/workspace";
import { PageHead } from "./ui";

export type ProfileFormValue = Pick<
  BusinessProfile,
  | "legalName"
  | "displayName"
  | "entityType"
  | "businessRegistrationNumber"
  | "incorporationDate"
  | "tin"
  | "irdPinStatus"
  | "vatRegistrationStatus"
  | "vatRegistrationEffectiveDate"
  | "vatRegistrationCertificateRef"
  | "filingFrequency"
  | "industry"
  | "address"
  | "postalCode"
  | "contactPhone"
  | "financeEmail"
  | "accountingSystem"
  | "authorisedReviewer"
  | "ramisConnection"
>;

const EMPTY_PROFILE: ProfileFormValue = {
  legalName: "",
  displayName: "",
  entityType: "COMPANY",
  businessRegistrationNumber: "",
  incorporationDate: "",
  tin: "",
  irdPinStatus: "NOT_REQUESTED",
  vatRegistrationStatus: "NOT_SET",
  vatRegistrationEffectiveDate: "",
  vatRegistrationCertificateRef: "",
  filingFrequency: "MONTHLY",
  industry: "",
  address: "",
  postalCode: "",
  contactPhone: "",
  financeEmail: "",
  accountingSystem: "",
  authorisedReviewer: "",
  ramisConnection: "NOT_CONNECTED",
};

function FormSection({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <section className="form-section">
      <div className="form-section-head">
        <h3>{title}</h3>
        <p>{hint}</p>
      </div>
      <div className="workspace-form-grid">{children}</div>
    </section>
  );
}

function formValue(profile: BusinessProfile): ProfileFormValue {
  return {
    legalName: profile.legalName,
    displayName: profile.displayName,
    entityType: profile.entityType,
    businessRegistrationNumber: profile.businessRegistrationNumber,
    incorporationDate: profile.incorporationDate,
    tin: profile.tin,
    irdPinStatus: profile.irdPinStatus,
    vatRegistrationStatus: profile.vatRegistrationStatus,
    vatRegistrationEffectiveDate: profile.vatRegistrationEffectiveDate,
    vatRegistrationCertificateRef: profile.vatRegistrationCertificateRef,
    filingFrequency: profile.filingFrequency,
    industry: profile.industry,
    address: profile.address,
    postalCode: profile.postalCode,
    contactPhone: profile.contactPhone,
    financeEmail: profile.financeEmail,
    accountingSystem: profile.accountingSystem,
    authorisedReviewer: profile.authorisedReviewer,
    ramisConnection: profile.ramisConnection,
  };
}

export function BusinessProfileView({
  workspace,
  onActivate,
  onSave,
  onCreate,
}: {
  workspace: BusinessWorkspace;
  onActivate: (profileId: string) => Promise<void>;
  onSave: (profileId: string, profile: ProfileFormValue) => Promise<boolean>;
  onCreate: (profile: ProfileFormValue) => Promise<boolean>;
}) {
  const active = workspace.profiles.find((profile) => profile.id === workspace.activeProfileId) ?? workspace.profiles[0];
  const [creating, setCreating] = useState(false);
  const [value, setValue] = useState<ProfileFormValue>(() => formValue(active));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!creating) setValue(formValue(active));
  }, [active, creating]);

  function update<K extends keyof ProfileFormValue>(key: K, next: ProfileFormValue[K]) {
    setValue((current) => ({ ...current, [key]: next }));
  }

  async function save() {
    setSaving(true);
    try {
      const ok = creating ? await onCreate(value) : await onSave(active.id, value);
      if (ok) setCreating(false);
    } finally {
      setSaving(false);
    }
  }

  const complete = Boolean(
    value.legalName.trim()
      && value.entityType
      && (value.entityType === "INDIVIDUAL_PROPRIETORSHIP" || value.businessRegistrationNumber.trim())
      && /^\d{9}$/.test(value.tin)
      && value.irdPinStatus === "ACTIVE"
      && value.vatRegistrationStatus === "ACTIVE"
      && value.vatRegistrationEffectiveDate
      && value.vatRegistrationCertificateRef.trim()
      && value.address.trim()
      && value.contactPhone.trim()
      && value.financeEmail.trim()
      && value.authorisedReviewer.trim(),
  );
  const canSave = value.displayName.trim().length >= 2;

  return (
    <>
      <PageHead
        eyebrow="Reusable taxpayer setup"
        title="Business profiles"
        lead="Enter stable business details once, then reuse them across every monthly or quarterly VAT period."
        action={
          <button
            className="button primary"
            onClick={() => {
              setCreating(true);
              setValue(EMPTY_PROFILE);
            }}
          >
            Add business
          </button>
        }
      />

      <div className="profile-switcher" aria-label="Business profiles">
        {workspace.profiles.map((profile) => (
          <button
            key={profile.id}
            className={`profile-card${profile.id === active.id && !creating ? " active" : ""}`}
            onClick={() => {
              setCreating(false);
              void onActivate(profile.id);
            }}
          >
            <strong>{profile.displayName}</strong>
            <span>{profile.tin ? <>TIN <span className="mono">{profile.tin}</span></> : "TIN not added"}</span>
            <small>{profile.isSynthetic ? "Synthetic demo profile" : profile.filingFrequency.toLowerCase()}</small>
          </button>
        ))}
      </div>

      <article className="card pad workspace-form-card">
        <div className="card-head">
          <div>
            <h2>{creating ? "Create business profile" : "Profile details"}</h2>
            <p>Source-backed taxpayer information; ComplyPilot does not invent registration facts.</p>
          </div>
          <span className={`tag ${complete ? "ok" : "warn"}`}>{complete ? "Profile complete" : "Required fields missing"}</span>
        </div>

        {/* Nineteen fields in one flat grid gave no clue which of them the IRD
            actually checks. They are grouped by where the answer comes from:
            the company's own records, the IRD's confirmations, and the people
            who operate the account. */}
        <FormSection
          title="Who the business is"
          hint="From the incorporation and Registrar of Companies records."
        >
          <label>
            <span>Legal business name</span>
            <input value={value.legalName} onChange={(event) => update("legalName", event.target.value)} />
          </label>
          <label>
            <span>Display name</span>
            <input value={value.displayName} onChange={(event) => update("displayName", event.target.value)} />
          </label>
          <label>
            <span>Entity type</span>
            <select value={value.entityType} onChange={(event) => update("entityType", event.target.value as ProfileFormValue["entityType"])}>
              <option value="COMPANY">Company</option><option value="INDIVIDUAL_PROPRIETORSHIP">Individual / proprietorship</option><option value="PARTNERSHIP">Partnership</option><option value="OTHER">Other</option>
            </select>
          </label>
          <label><span>Business Registration number</span><input className="mono" value={value.businessRegistrationNumber} onChange={(event) => update("businessRegistrationNumber", event.target.value)} /></label>
          <label><span>Incorporation / registration date</span><input className="mono" type="date" value={value.incorporationDate} onChange={(event) => update("incorporationDate", event.target.value)} /></label>
          <label>
            <span>Industry</span>
            <input value={value.industry} onChange={(event) => update("industry", event.target.value)} />
          </label>
        </FormSection>

        <FormSection
          title="What the IRD has confirmed"
          hint="Enter only what the IRD has issued or acknowledged. Never a password or PIN."
        >
          <label>
            <span>TIN — nine digits</span>
            <input className="mono" inputMode="numeric" maxLength={9} value={value.tin} onChange={(event) => update("tin", event.target.value.replace(/\D/g, ""))} />
          </label>
          <label>
            <span>IRD e-Services PIN / SSID status</span>
            <select value={value.irdPinStatus} onChange={(event) => update("irdPinStatus", event.target.value as ProfileFormValue["irdPinStatus"])}>
              <option value="NOT_REQUESTED">Not requested</option><option value="REQUESTED">Requested</option><option value="ACTIVE">Active — user confirmed</option>
            </select>
          </label>
          <label>
            <span>VAT registration status</span>
            <select value={value.vatRegistrationStatus} onChange={(event) => update("vatRegistrationStatus", event.target.value as ProfileFormValue["vatRegistrationStatus"])}>
              <option value="ACTIVE">Active — user supplied</option>
              <option value="PENDING">Pending verification</option>
              <option value="NOT_SET">Not set</option>
            </select>
          </label>
          <label><span>VAT effective date — IRD confirmed</span><input className="mono" type="date" value={value.vatRegistrationEffectiveDate} onChange={(event) => update("vatRegistrationEffectiveDate", event.target.value)} /></label>
          <label><span>VAT certificate / acknowledgement reference</span><input className="mono" placeholder="Do not enter an IRD password or PIN" value={value.vatRegistrationCertificateRef} onChange={(event) => update("vatRegistrationCertificateRef", event.target.value)} /></label>
          <label>
            <span>Return filing frequency</span>
            <select value={value.filingFrequency} onChange={(event) => update("filingFrequency", event.target.value as ProfileFormValue["filingFrequency"])}>
              <option value="MONTHLY">Monthly — up to 12 returns/year</option>
              <option value="QUARTERLY">Quarterly — every 3 months</option>
            </select>
          </label>
        </FormSection>

        <FormSection
          title="Where to reach it, and who signs off"
          hint="The reviewer named here is the person a filing is attributed to."
        >
          <label className="span-two">
            <span>Business address</span>
            <input value={value.address} onChange={(event) => update("address", event.target.value)} />
          </label>
          <label><span>Postal code</span><input className="mono" inputMode="numeric" value={value.postalCode} onChange={(event) => update("postalCode", event.target.value)} /></label>
          <label><span>Business phone</span><input className="mono" type="tel" value={value.contactPhone} onChange={(event) => update("contactPhone", event.target.value)} /></label>
          <label>
            <span>Finance email</span>
            <input type="email" value={value.financeEmail} onChange={(event) => update("financeEmail", event.target.value)} />
          </label>
          <label><span>Accounting system</span><input placeholder="Excel, QuickBooks, ERP…" value={value.accountingSystem} onChange={(event) => update("accountingSystem", event.target.value)} /></label>
          <label>
            <span>Authorised reviewer</span>
            <input value={value.authorisedReviewer} onChange={(event) => update("authorisedReviewer", event.target.value)} />
          </label>
          <label>
            <span>RAMIS connection</span>
            <select value={value.ramisConnection} onChange={(event) => update("ramisConnection", event.target.value as ProfileFormValue["ramisConnection"])}>
              <option value="SIMULATOR">RAMIS simulator</option>
              <option value="NOT_CONNECTED">Not connected</option>
              <option value="ONBOARDING">IRD onboarding in progress</option>
              <option value="LIVE_APPROVED">IRD-approved Web API</option>
            </select>
          </label>
        </FormSection>

        <div className="form-actions">
          {creating ? <button className="button" onClick={() => setCreating(false)}>Cancel</button> : null}
          <button className="button primary" disabled={!canSave || saving} onClick={save}>
            {saving ? "Saving…" : creating ? "Create and continue later" : complete ? "Save profile" : "Save progress"}
          </button>
        </div>
      </article>
    </>
  );
}
