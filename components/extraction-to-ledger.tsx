"use client";

import { useMemo, useState } from "react";
import type { InvoiceExtraction } from "@/lib/ai/extraction-schema";
import { directionLabel } from "@/lib/rules/invoice-direction";
import { proposeLedgerEntry, REVIEW_CONFIDENCE_THRESHOLD, type LedgerImportDraft } from "@/lib/vat-ledger-import";
import { VAT_TREATMENT_LABELS } from "@/lib/vat-operations";
import type { BusinessProfile } from "@/lib/workspace/workspace";

/**
 * What the document agent read, and what it proposes recording.
 *
 * This panel is the join between the extraction pipeline and the business
 * ledger. It deliberately shows the model's work rather than its conclusion:
 * every field carries the confidence it was read at and the text it was read
 * from, and anything the model was unsure about is marked before a person is
 * asked to accept it. The button hands the proposal to the ledger form — it
 * never writes a transaction.
 */
export function ExtractionToLedger({ extraction, profile, mode, onReview }: {
  extraction: InvoiceExtraction;
  profile: BusinessProfile;
  /** Whether the figures came from a live model call or the bundled demo case. */
  mode: "LIVE_QWEN" | "DEMO_FALLBACK";
  onReview: (draft: LedgerImportDraft) => void;
}) {
  /** Set only when the model could not tell which side this business is on. */
  const [confirmedDirection, setConfirmedDirection] = useState<"SALES" | "PURCHASE" | undefined>();
  const proposal = useMemo(
    () => proposeLedgerEntry(extraction, profile, { confirmedDirection }),
    [extraction, profile, confirmedDirection],
  );
  const { direction, draft, fields, blockers, reviewRequired, overallConfidence } = proposal;
  // Only an unreadable TIN is a person's to settle. UNRELATED means both TINs
  // were read and neither is this business, which is a finding, not a prompt.
  const awaitingSide = direction.direction === "UNKNOWN";

  return (
    <section className="card pad extraction-panel">
      <div className="card-head">
        <div>
          <h2>Qwen Document Agent read this invoice</h2>
          <p>{mode === "LIVE_QWEN" ? "Extracted by the vision model from the uploaded image." : "Bundled synthetic demo case — no model call was made."}</p>
        </div>
        <span className={`tag ${overallConfidence >= REVIEW_CONFIDENCE_THRESHOLD ? "ok" : "warn"}`}><span className="mono">{overallConfidence}%</span> mean confidence</span>
      </div>

      <div className={`extraction-direction ${direction.direction.toLowerCase()}`}>
        <strong>{directionLabel(direction.direction)}</strong>
        <p>{direction.reason}</p>
        {confirmedDirection ? <button className="text-link" onClick={() => setConfirmedDirection(undefined)}>Undo my confirmation</button> : null}
      </div>

      <div className="extraction-fields">
        {fields.map((field) => (
          <div key={field.key} className={field.needsReview ? "needs-review" : ""}>
            <div className="extraction-field-head">
              <span>{field.label}</span>
              <b className="mono">{field.confidence}%</b>
            </div>
            <strong>{field.value === null || field.value === "" ? "— not read —" : String(field.value)}</strong>
            <div className="confidence-bar" role="presentation">
              <i style={{ width: `${Math.max(2, field.confidence)}%` }} className={field.confidence >= REVIEW_CONFIDENCE_THRESHOLD ? "ok" : "warn"} />
            </div>
            {field.source ? <small className="extraction-source">Read from: “{field.source}”</small> : null}
            {field.reason ? <small className="extraction-reason">{field.reason}</small> : null}
          </div>
        ))}
      </div>

      {awaitingSide ? (
        <div className="extraction-confirm-side">
          <div>
            <strong>Which side of this invoice is {profile.displayName} on?</strong>
            <p>The agent will not guess this — it decides output versus input VAT, and it is a source fact only you can confirm.</p>
          </div>
          <div className="form-actions">
            <button className="button" onClick={() => setConfirmedDirection("SALES")}>We issued it — a sale</button>
            <button className="button" onClick={() => setConfirmedDirection("PURCHASE")}>A supplier issued it — a purchase</button>
          </div>
        </div>
      ) : null}

      {blockers.length ? (
        <div className="extraction-blocked">
          <strong>Not enough to propose a ledger entry</strong>
          <ul>{blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul>
          <p>Add the entry by hand below, or upload a clearer document. Nothing is recorded from a reading this incomplete.</p>
        </div>
      ) : (
        <>
          <div className="extraction-proposal">
            <div>
              <span className="eyebrow">Proposed entry</span>
              <strong>{draft!.kind === "OUTPUT" ? "Output — sale" : "Input — local purchase"} · {VAT_TREATMENT_LABELS[draft!.treatment]}</strong>
              <small><span className="mono">{draft!.invoiceNumber}</span> · <span className="mono">{draft!.invoiceDate}</span> · {draft!.counterpartyName || "counterparty not read"}</small>
            </div>
            <div className="extraction-amounts">
              <span>Net <b className="mono">{money(draft!.netAmountLkr)}</b></span>
              {draft!.statedVatAmountLkr !== null ? <span>VAT as charged <b className="mono">{money(draft!.statedVatAmountLkr)}</b></span> : null}
            </div>
          </div>

          {reviewRequired.length ? (
            <p className="extraction-review-note">
              <b>{reviewRequired.length} field{reviewRequired.length === 1 ? "" : "s"} need{reviewRequired.length === 1 ? "s" : ""} your eyes:</b> {reviewRequired.join(", ")}. Check {reviewRequired.length === 1 ? "it" : "them"} against the document in the form before saving.
            </p>
          ) : null}

          <div className="form-actions">
            <button className="button primary" onClick={() => onReview(draft!)}>Review in the ledger form →</button>
          </div>
          <p className="extraction-boundary">The agent fills the form. An authorised person still reviews and saves — nothing reaches the VAT return without that.</p>
        </>
      )}
    </section>
  );
}

function money(value: number) { return new Intl.NumberFormat("en-LK", { style: "currency", currency: "LKR", maximumFractionDigits: 2 }).format(value); }
