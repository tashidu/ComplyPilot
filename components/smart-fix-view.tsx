"use client";

import { useEffect, useState } from "react";
import type { AnalyzeResult } from "@/lib/types";
import { PageHead, SectionHead } from "./ui";
import { governmentSources, vatInvoiceRulePack } from "@/lib/government-data";

type FieldValue = { value: string | number | boolean | null; confidence: number; source: string | null };

/** Display order and label for every top-level invoice field. Line items are
 * shown separately; they are rarely what a compliance reviewer checks first. */
const FIELD_ORDER: { key: string; label: string }[] = [
  { key: "invoiceTitle", label: "Invoice title" },
  { key: "sellerName", label: "Supplier name" },
  { key: "sellerVatNumber", label: "Supplier TIN" },
  { key: "sellerAddress", label: "Supplier address" },
  { key: "sellerTelephone", label: "Supplier telephone" },
  { key: "buyerName", label: "Purchaser name" },
  { key: "buyerTin", label: "Purchaser TIN" },
  { key: "buyerAddress", label: "Purchaser address" },
  { key: "buyerTelephone", label: "Purchaser telephone" },
  { key: "invoiceNumber", label: "Invoice serial number" },
  { key: "invoiceDate", label: "Invoice date" },
  { key: "supplyDate", label: "Date of supply" },
  { key: "placeOfSupply", label: "Place of supply" },
  { key: "currency", label: "Currency" },
  { key: "netTotal", label: "Net total" },
  { key: "vatTotal", label: "VAT total" },
  { key: "grossTotal", label: "Gross total" },
  { key: "totalInWords", label: "Total in words" },
  { key: "paymentMode", label: "Payment mode" },
];

function fieldBadge(field: FieldValue | undefined): { tag: string; label: string } {
  if (!field || field.value === null || field.value === "") return { tag: "alert", label: "Missing" };
  if (field.confidence >= 90) return { tag: "ok", label: "Verified" };
  if (field.confidence >= 60) return { tag: "warn", label: "Low confidence" };
  return { tag: "alert", label: "Low confidence" };
}

function formatValue(value: FieldValue["value"] | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}

function FieldList({
  fields,
  compareAgainst,
}: {
  fields: Record<string, FieldValue>;
  compareAgainst?: Record<string, FieldValue>;
}) {
  return (
    <div className="field-list">
      {FIELD_ORDER.map(({ key, label }) => {
        const field = fields[key];
        const other = compareAgainst?.[key];
        const changed = Boolean(compareAgainst) && String(field?.value ?? "") !== String(other?.value ?? "");
        const badge = fieldBadge(field);
        return (
          <div key={key} className={`field-row${changed ? " changed" : ""}`}>
            <span className="field-label">{label}</span>
            <span className="field-value">
              <strong>{formatValue(field?.value)}</strong>
              <span className={`tag ${badge.tag}`}>{badge.label}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

function SummaryMetric({
  tone,
  icon,
  value,
  label,
}: {
  tone: "brand" | "mint" | "amber";
  icon: string;
  value: string;
  label: string;
}) {
  return (
    <article className="card metric">
      <div className={`metric-icon ${tone}`} aria-hidden="true">
        {icon}
      </div>
      <div>
        <strong>{value}</strong>
        <span>{label}</span>
      </div>
    </article>
  );
}

export function SmartFixView({
  result,
  onSetProfile,
  onApprove,
  onBack,
}: {
  result: AnalyzeResult;
  onSetProfile: (future: boolean) => void;
  onApprove: (humanValues: Record<string, string>) => Promise<boolean>;
  onBack: () => void;
}) {
  const smartFix = result.smartFix;
  const invoiceFinding = result.findings.find((finding) => finding.id === "invoice");
  const approved = invoiceFinding?.status === "resolved" || smartFix.status === "COMPLIANT";
  const original = (result.invoice ?? {}) as Record<string, FieldValue>;
  const draft = (smartFix.draftInvoice ?? {}) as Record<string, FieldValue>;
  const [humanValues, setHumanValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const humanActions = smartFix.actions.filter((action) => action.decision === "NEEDS_HUMAN");
  const allHumanValuesReady = humanActions.every((action) => humanValues[action.field]?.trim());

  useEffect(() => {
    setHumanValues({});
  }, [result.runId, smartFix.status]);

  async function approveDraft() {
    setSaving(true);
    try {
      await onApprove(humanValues);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHead
        eyebrow="AI-assisted correction"
        title="Smart Fix Studio"
        lead="The original extraction next to an AI-drafted correction. A source fact is never invented; missing registration details stay a human decision."
        action={
          <button className="button" onClick={onBack}>
            Back to overview
          </button>
        }
      />

      {smartFix.status === "NO_INVOICE" ? (
        <div className="notice">
          <span aria-hidden="true">ℹ</span>
          <div>Upload an invoice image on the Overview page to see its original extraction next to an AI-drafted correction.</div>
        </div>
      ) : smartFix.status === "NOT_APPLICABLE" ? (
        <div className="notice">
          <span aria-hidden="true">ℹ</span>
          <div>
            <b>The {vatInvoiceRulePack.version} rule pack is not active for this scenario.</b> Smart Fix
            drafts corrections against the revised invoice specification, effective{" "}
            {vatInvoiceRulePack.effectiveFrom}.
            <div style={{ marginTop: 10 }}>
              <button className="button small primary" onClick={() => onSetProfile(true)}>
                Switch to the {vatInvoiceRulePack.version} profile
              </button>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="notice">
            <span aria-hidden="true">ℹ</span>
            <div>
              <b>Draft corrected invoice — not a legally issued replacement.</b> {smartFix.disclaimer}
            </div>
          </div>

          <div className="grid three" style={{ marginTop: 16 }}>
            <SummaryMetric
              tone="brand"
              icon="Σ"
              value={String(smartFix.actions.length)}
              label="Fields flagged by the rule pack"
            />
            <SummaryMetric
              tone="mint"
              icon="✓"
              value={String(smartFix.autoDraftCount)}
              label="Safe AI drafts (format-only)"
            />
            <SummaryMetric
              tone="amber"
              icon="!"
              value={String(smartFix.humanInputCount)}
              label="Source facts needing a human"
            />
          </div>

          <SectionHead
            title="Original extraction vs. AI-corrected draft"
            aside={
              <button
                className="button small primary"
                onClick={() => void approveDraft()}
                disabled={approved || saving || !allHumanValuesReady}
                title={!allHumanValuesReady ? "Enter every source-backed value below first." : undefined}
              >
                {approved ? "Correction applied" : saving ? "Validating…" : "Validate & apply correction"}
              </button>
            }
          />
          <div className="grid two">
            <article className="card pad">
              <div className="card-head">
                <div>
                  <h2>Original extraction</h2>
                  <p>As read from the uploaded document</p>
                </div>
                <span className={`pill ${result.mode === "LIVE_QWEN" ? "live" : "fallback"}`}>
                  <i className="dot" />
                  {result.mode === "LIVE_QWEN" ? "LIVE QWEN" : "DEMO FALLBACK"}
                </span>
              </div>
              {result.invoiceImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={result.invoiceImage}
                  alt="Uploaded invoice"
                  className="smartfix-source-image"
                />
              ) : (
                <div className="notice" style={{ marginBottom: 14 }}>
                  <span aria-hidden="true">ℹ</span>
                  <div>No source image for this synthetic case. Upload an invoice photo to see it here.</div>
                </div>
              )}
              <FieldList fields={original} />
            </article>

            <article className="card pad">
              <div className="card-head">
                <div>
                  <h2>AI-corrected draft</h2>
                  <p>Highlighted rows differ from the original extraction</p>
                </div>
                <span className="tag brand">DRAFT</span>
              </div>
              <FieldList fields={draft} compareAgainst={original} />
            </article>
          </div>

          <SectionHead title="Why each change is required" />
          <div className="smartfix-actions">
            {smartFix.actions.map((action) => {
              const sources = action.sourceIds
                .map((id) => governmentSources.find((source) => source.id === id))
                .filter((source): source is NonNullable<typeof source> => Boolean(source));
              return (
                <article className="card pad" key={action.field}>
                  <div className="card-head">
                    <div>
                      <h2>{action.label}</h2>
                      <p>
                        Rule {action.ruleId} · effective {vatInvoiceRulePack.effectiveFrom}
                      </p>
                    </div>
                    <span className={`tag ${action.decision === "AI_DRAFT" ? "ok" : "warn"}`}>
                      {action.decision === "AI_DRAFT" ? "AI draft applied" : "Needs a human"}
                    </span>
                  </div>
                  <div className="smartfix-diff">
                    <div>
                      <span className="subtle">Observed</span>
                      <strong>{formatValue(action.observedValue)}</strong>
                    </div>
                    <div aria-hidden="true">→</div>
                    <div>
                      <span className="subtle">Suggested</span>
                      <strong>{action.decision === "NEEDS_HUMAN" ? humanValues[action.field] || "Awaiting human input" : formatValue(action.suggestedValue)}</strong>
                    </div>
                  </div>
                  <p>{action.reason}</p>
                  {action.decision === "NEEDS_HUMAN" ? (
                    <label className="smartfix-human-field">
                      <span>Source-backed value for {action.label}</span>
                      <input
                        value={humanValues[action.field] ?? ""}
                        placeholder="Enter exactly as verified from the business record"
                        onChange={(event) => setHumanValues((current) => ({ ...current, [action.field]: event.target.value }))}
                      />
                      <small>This value is recorded as an authorised human correction, not generated by AI.</small>
                    </label>
                  ) : null}
                  {sources.length > 0 ? (
                    <div className="chip-row">
                      {sources.map((source) => (
                        <a key={source.id} className="chip" href={source.url} target="_blank" rel="noreferrer">
                          {source.id}
                        </a>
                      ))}
                    </div>
                  ) : null}
                </article>
              );
            })}
            {smartFix.actions.length === 0 ? (
              <div className="notice">
                <span aria-hidden="true">✓</span>
                <div>
                  No corrections are required. The extraction already satisfies every mandatory field in{" "}
                  {vatInvoiceRulePack.version}.
                </div>
              </div>
            ) : null}
          </div>
        </>
      )}
    </>
  );
}
