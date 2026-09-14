"use client";

import { useEffect, useState } from "react";
import type { BusinessProfile, BusinessWorkspace } from "@/lib/workspace/workspace";
import { PageHead } from "./ui";

export type ProfileFormValue = Pick<
  BusinessProfile,
  | "legalName"
  | "displayName"
  | "tin"
  | "vatRegistrationStatus"
  | "filingFrequency"
  | "industry"
  | "address"
  | "financeEmail"
  | "authorisedReviewer"
  | "ramisConnection"
>;

const EMPTY_PROFILE: ProfileFormValue = {
  legalName: "",
  displayName: "",
  tin: "",
  vatRegistrationStatus: "NOT_SET",
  filingFrequency: "MONTHLY",
  industry: "",
  address: "",
  financeEmail: "",
  authorisedReviewer: "",
  ramisConnection: "NOT_CONNECTED",
};

function formValue(profile: BusinessProfile): ProfileFormValue {
  return {
    legalName: profile.legalName,
    displayName: profile.displayName,
    tin: profile.tin,
    vatRegistrationStatus: profile.vatRegistrationStatus,
    filingFrequency: profile.filingFrequency,
    industry: profile.industry,
    address: profile.address,
    financeEmail: profile.financeEmail,
    authorisedReviewer: profile.authorisedReviewer,
    ramisConnection: profile.ramisConnection === "LIVE_APPROVED" ? "ONBOARDING" : profile.ramisConnection,
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
      && /^\d{9}$/.test(value.tin)
      && value.vatRegistrationStatus === "ACTIVE"
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
            <span>{profile.tin ? `TIN ${profile.tin}` : "TIN not added"}</span>
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

        <div className="workspace-form-grid">
          <label>
            <span>Legal business name</span>
            <input value={value.legalName} onChange={(event) => update("legalName", event.target.value)} />
          </label>
          <label>
            <span>Display name</span>
            <input value={value.displayName} onChange={(event) => update("displayName", event.target.value)} />
          </label>
          <label>
            <span>TIN — nine digits</span>
            <input inputMode="numeric" maxLength={9} value={value.tin} onChange={(event) => update("tin", event.target.value.replace(/\D/g, ""))} />
          </label>
          <label>
            <span>VAT registration status</span>
            <select value={value.vatRegistrationStatus} onChange={(event) => update("vatRegistrationStatus", event.target.value as ProfileFormValue["vatRegistrationStatus"])}>
              <option value="ACTIVE">Active — user supplied</option>
              <option value="PENDING">Pending verification</option>
              <option value="NOT_SET">Not set</option>
            </select>
          </label>
          <label>
            <span>Return filing frequency</span>
            <select value={value.filingFrequency} onChange={(event) => update("filingFrequency", event.target.value as ProfileFormValue["filingFrequency"])}>
              <option value="MONTHLY">Monthly — up to 12 returns/year</option>
              <option value="QUARTERLY">Quarterly — every 3 months</option>
            </select>
          </label>
          <label>
            <span>Industry</span>
            <input value={value.industry} onChange={(event) => update("industry", event.target.value)} />
          </label>
          <label className="span-two">
            <span>Business address</span>
            <input value={value.address} onChange={(event) => update("address", event.target.value)} />
          </label>
          <label>
            <span>Finance email</span>
            <input type="email" value={value.financeEmail} onChange={(event) => update("financeEmail", event.target.value)} />
          </label>
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
            </select>
          </label>
        </div>

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
