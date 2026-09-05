"use client";

import type { AnalyzeResult } from "@/lib/types";
import { PageHead, SectionHead } from "./ui";

export function RulesView({
  result,
  futureRules,
  notice2,
  onSetProfile,
  onToggleNotice2,
}: {
  result: AnalyzeResult;
  futureRules: boolean;
  notice2: boolean;
  onSetProfile: (future: boolean) => void;
  onToggleNotice2: () => void;
}) {
  const invoiceFixed = result.findings.find(f => f.id === "invoice")?.status === "resolved";
  const futureIssues = futureRules && !invoiceFixed;

  return (
    <>
      <PageHead
        eyebrow="Versioned compliance"
        title="Regulatory Time Machine"
        lead="See how the same evidence behaves before and after the revised invoice format becomes effective."
        action={<span className="pill">Gazette 2481/22 · amended 2500/106</span>}
      />

      <div className="grid two">
        <article className="card pad">
          <h2>Choose the applicable rule profile</h2>
          <p className="subtle" style={{ marginTop: 6 }}>
            Changing the profile re-runs the document agent and updates the readiness score.
          </p>
          <div className="rule-switch" role="group" aria-label="Rule profile">
            <button aria-pressed={!futureRules} onClick={() => onSetProfile(false)}>
              Before 1 Oct 2026
            </button>
            <button aria-pressed={futureRules} onClick={() => onSetProfile(true)}>
              Effective 1 Oct 2026
            </button>
          </div>
          <div className="rule-result">
            <strong>
              {!futureRules
                ? "10 invoices pass the earlier profile"
                : invoiceFixed
                  ? "Revised invoice issues resolved"
                  : "2 invoices require correction"}
            </strong>
            <span>
              {!futureRules
                ? "The revised October 2026 invoice checks are not applied under this historical profile."
                : invoiceFixed
                  ? "The corrected fields now satisfy the selected October 2026 demo rule profile."
                  : "The revised profile identifies missing mandatory fields. LKR 0.8M of claim value is linked to those invoices."}
            </span>
          </div>
        </article>

        <article className="card pad">
          <div className="card-head">
            <div>
              <h2>Rule decision</h2>
              <p>
                {futureRules
                  ? "Profile v2026.10 · effective 1 Oct 2026"
                  : "Historical profile · before 1 Oct 2026"}
              </p>
            </div>
            <span className={`tag ${futureIssues ? "warn" : "ok"}`}>
              {futureIssues ? "Action required" : "Passed"}
            </span>
          </div>
          <div className="checklist">
            <Check
              ok
              title="VAT values reconcile"
              detail="Subtotal, VAT and total are internally consistent."
            />
            <Check
              ok={!futureIssues}
              title="Invoice serial structure"
              detail={
                futureIssues
                  ? "Two records require the revised October format."
                  : futureRules
                    ? "Corrected serial structure accepted."
                    : "Passes the selected earlier profile."
              }
            />
            <Check
              ok={!futureIssues}
              title="Purchaser details"
              detail={
                futureIssues
                  ? "One mandatory purchaser field is missing."
                  : futureRules
                    ? "Mandatory purchaser fields are complete."
                    : "Passes the selected earlier profile."
              }
            />
          </div>
        </article>
      </div>

      <SectionHead
        title="45-day clock twin"
        aside={
          <button className="button small" onClick={onToggleNotice2}>
            {notice2 ? "Remove Notice 2" : "Simulate Notice 2"}
          </button>
        }
      />
      <article className="card pad">
        <div className="clock">
          <div className="clock-step">
            <div className="clock-node">1</div>
            <strong>Taxable period ends</strong>
            <span>31 Oct 2026</span>
          </div>
          <div className="clock-step">
            <div className="clock-node">2</div>
            <strong>{notice2 ? "Notice 2 compliance" : "Proper filing"}</strong>
            <span>{notice2 ? "7 Dec 2026" : "30 Nov 2026"}</span>
          </div>
          <div className="clock-step">
            <div className="clock-node">3</div>
            <strong>45-day target scenario</strong>
            <span>{notice2 ? "21 Jan 2027" : "14 Jan 2027"}</span>
          </div>
        </div>
        <div className="notice" style={{ marginTop: 16 }}>
          <span aria-hidden="true">ℹ</span>
          <div>
            {notice2
              ? "The simulated schedule correction was completed on 7 Dec 2026, so the 45-day scenario begins from that compliance date."
              : "Scenario assumes a proper return and schedules on 30 Nov 2026 with no Notice 2. This is not a payment guarantee."}
          </div>
        </div>
      </article>
    </>
  );
}

function Check({ ok, title, detail }: { ok: boolean; title: string; detail: string }) {
  return (
    <div className="check-row">
      <div className={`check-mark${ok ? "" : " wait"}`}>{ok ? "✓" : "!"}</div>
      <div>
        <strong>{title}</strong>
        <span>{detail}</span>
      </div>
    </div>
  );
}
