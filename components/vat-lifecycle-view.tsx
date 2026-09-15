"use client";

import type { AuthUser } from "@/lib/auth/types";
import type { BusinessProfile, BusinessWorkspace } from "@/lib/workspace/workspace";
import type { ViewId } from "./sidebar";
import { PageHead } from "./ui";

export function VatLifecycleView({ user, workspace, profile, onNavigate }: { user: AuthUser | null; workspace: BusinessWorkspace; profile: BusinessProfile; onNavigate: (view: ViewId) => void }) {
  const api = workspace.ramisApiProfiles.find((item) => item.profileId === profile.id);
  const periodTransactions = workspace.vatTransactions.filter((item) => item.periodId === profile.activePeriodId);
  const steps: Array<{ title: string; detail: string; done: boolean; view: ViewId; action: string }> = [
    { title: "Create ComplyPilot account", detail: user ? `Signed in as ${user.fullName}` : "Guest progress lasts only for this browser session. Create an account to keep it.", done: Boolean(user), view: "account", action: user ? "View account" : "Create account" },
    { title: "Complete business identity", detail: /^\d{9}$/.test(profile.tin) ? `TIN ${profile.tin} saved` : "Add entity, contact, TIN and IRD e-Services status.", done: /^\d{9}$/.test(profile.tin) && Boolean(profile.address), view: "business", action: "Business profile" },
    { title: "Confirm VAT registration", detail: profile.vatRegistrationStatus === "ACTIVE" ? `Active from ${profile.vatRegistrationEffectiveDate || "user-confirmed date not added"}` : "Prepare documents here, then register on the official IRD site.", done: profile.vatRegistrationStatus === "ACTIVE", view: "vat-registration", action: profile.vatRegistrationStatus === "ACTIVE" ? "View registration" : "Start registration" },
    { title: "Choose RAMIS submission channel", detail: api?.status === "APPROVED" ? "Web API onboarding marked approved" : "Use CSV/e-Services now, or request official Web API onboarding.", done: api?.status === "APPROVED", view: "ramis-api", action: "API & RAMIS setup" },
    { title: "Run VAT operations", detail: `${periodTransactions.length} input/output transaction${periodTransactions.length === 1 ? "" : "s"} in the active period.`, done: periodTransactions.length > 0, view: "vat-ledger", action: "Open VAT ledger" },
    { title: "Review and submit the return", detail: "Check schedules, input credits and output tax before human approval.", done: false, view: "vat-return", action: "Prepare return" },
  ];

  return (
    <>
      <PageHead eyebrow="Start here" title="Your Sri Lanka VAT journey" lead="One clear path for a new business, an already-registered taxpayer, or an ERP team preparing for RAMIS Web API onboarding." />
      <div className="lifecycle-choice">
        <button className={profile.vatRegistrationStatus !== "ACTIVE" ? "active" : ""} onClick={() => onNavigate("vat-registration")}><span>NEW TO VAT</span><strong>I need to register</strong><small>Prepare the TIN/PIN steps and route-specific documents, then continue on IRD e-Services.</small></button>
        <button className={profile.vatRegistrationStatus === "ACTIVE" ? "active" : ""} onClick={() => onNavigate("business")}><span>ALREADY REGISTERED</span><strong>I already have VAT</strong><small>Record the IRD-confirmed status, effective date and certificate reference, then start operations.</small></button>
      </div>
      <section className="card pad lifecycle-card">
        <div className="card-head"><div><h2>End-to-end workflow</h2><p>ComplyPilot prepares each step; government registration and final filing remain authorised human actions.</p></div><span className="tag brand">{steps.filter((item) => item.done).length}/{steps.length} ready</span></div>
        <div className="lifecycle-steps">{steps.map((item, index) => <button key={item.title} className={item.done ? "done" : ""} onClick={() => onNavigate(item.view)}><b>{item.done ? "✓" : index + 1}</b><span><strong>{item.title}</strong><small>{item.detail}</small></span><em>{item.action} →</em></button>)}</div>
      </section>
    </>
  );
}
