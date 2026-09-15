"use client";

import type { AnalyzeResult } from "@/lib/types";
import { GuiAgentPanel } from "./gui-agent-panel";
import { PageHead } from "./ui";

export function FilingView({
  result,
  approved,
  submitted,
  periodApproved,
  periodLabel,
  documentCount,
  onApprovalChange,
  onSubmit,
  onAgentEvent,
}: {
  result: AnalyzeResult;
  approved: boolean;
  submitted: boolean;
  periodApproved: boolean;
  periodLabel: string;
  documentCount: number;
  onApprovalChange: (value: boolean) => void;
  onSubmit: () => void;
  onAgentEvent?: (title: string, detail: string) => void;
}) {
  const openBlockers = result.findings.filter(f => f.status === "open");
  const blockersReady = openBlockers.length === 0;
  const ready = blockersReady && periodApproved;
  const score = result.score.total;

  const isResolved = (id: string) => result.findings.find(f => f.id === id)?.status === "resolved";

  return (
    <>
      <PageHead
        eyebrow="Human-approved action"
        title="Mock filing workspace"
        lead="The agent prepares and verifies. The authorised person decides and submits."
        action={
          <span className="pill">
            <i className="dot" /> Controlled mock portal
          </span>
        }
      />

      {/* The authorisation and the submission are the point of this screen, so
          they sit together in the one hero rather than at the foot of a
          checklist competing with the package table beside it. */}
      <article className="card filing-hero">
        <div className="filing-hero-top">
          <div className="filing-hero-score">
            <strong className="mono">{score}</strong>
            <span>/100 readiness</span>
          </div>
          <div className="filing-hero-text">
            <span className="filing-hero-state">{submitted ? "Submitted" : ready ? "Ready to submit" : "Not ready"}</span>
            <h2>{periodLabel}</h2>
            <p>
              {submitted
                ? "The mock portal accepted this package. The acknowledgement is in the submission history."
                : ready
                  ? "Every gate has passed. Confirm the authorisation below to release the package to the mock portal."
                  : `${!periodApproved ? "The period is not closed yet" : `${openBlockers.length} blocker${openBlockers.length === 1 ? "" : "s"} still require action`}.`}
            </p>
          </div>
        </div>

        <label className="filing-hero-approval">
          <input
            type="checkbox"
            checked={approved}
            onChange={(event) => onApprovalChange(event.target.checked)}
          />
          <span>
            I reviewed the evidence packet and authorise this mock submission. I understand that
            this prototype does not file with the live IRD portal.
          </span>
        </label>

        <button
          className="button wide filing-hero-submit"
          disabled={!ready || !approved || submitted}
          onClick={onSubmit}
        >
          {submitted ? "Mock submission completed" : "Submit to mock portal"}
        </button>
      </article>

      <div className="grid two">
        <article className="card pad">
          <div className="card-head">
            <div>
              <h2>Submission readiness</h2>
              <p>{periodLabel} must be closed by an authorised reviewer before the mock action is enabled.</p>
            </div>
            <strong className="mono">{score}/100</strong>
          </div>

          <div className="checklist">
            <div className="check-row">
              <div className="check-mark">✓</div>
              <div>
                <strong>Documents extracted</strong>
                <span>{documentCount} period record{documentCount === 1 ? "" : "s"} saved with source trace.</span>
              </div>
            </div>
            <div className="check-row">
              <div className={`check-mark${periodApproved ? "" : " wait"}`}>{periodApproved ? "✓" : "!"}</div>
              <div>
                <strong>Period-closing approval</strong>
                <span>{periodApproved ? `${periodLabel} was approved by an authorised reviewer.` : "Complete the Period-closing workflow first."}</span>
              </div>
            </div>
            <div className="check-row">
              <div className={`check-mark${blockersReady ? "" : " wait"}`}>{blockersReady ? "✓" : "!"}</div>
              <div>
                <strong>Evidence blockers resolved</strong>
                <span>
                  {blockersReady
                    ? "All current blockers are resolved."
                    : `${openBlockers.length} blocker${openBlockers.length === 1 ? "" : "s"} still require action.`}
                </span>
              </div>
            </div>
            <div className="check-row">
              <div className="check-mark">✓</div>
              <div>
                <strong>Audit packet generated</strong>
                <span>Agent findings and rule citations attached.</span>
              </div>
            </div>
            <div className="check-row">
              <div className="check-mark info">OTP</div>
              <div>
                <strong>Identity checkpoint</strong>
                <span>The agent pauses for OTP or CAPTCHA during mock filing.</span>
              </div>
            </div>
          </div>

        </article>

        <article className="card pad">
          <div className="card-head">
            <div>
              <h2>Prepared package</h2>
              <p>Evidence-first submission bundle</p>
            </div>
            <span className="tag ok">Generated</span>
          </div>
          <div className="table-wrap">
            <table>
              <tbody>
                <PackageRow name="VAT return package" note={periodLabel} status={periodApproved ? "Approved" : "Not closed"} ok={periodApproved} />
                <PackageRow name="Input schedule evidence" note={`${documentCount} period records`} status="Attached" ok />
                <PackageRow
                  name="Export reconciliation note"
                  note="Drafted by agent"
                  status={isResolved("customs") ? "Approved" : "Needs review"}
                  ok={isResolved("customs")}
                />
                <PackageRow
                  name="Supplier evidence request"
                  note="Source-date warning"
                  status={isResolved("supplier") ? "Approved" : "Needs review"}
                  ok={isResolved("supplier")}
                />
                <PackageRow name="Decision log" note="Human + agent actions" status="Attached" ok />
              </tbody>
            </table>
          </div>
        </article>
      </div>

      <GuiAgentPanel canFile={ready && approved} onAgentEvent={onAgentEvent} />
    </>
  );
}

function PackageRow({
  name,
  note,
  status,
  ok,
}: {
  name: string;
  note: string;
  status: string;
  ok: boolean;
}) {
  return (
    <tr>
      <td>
        <strong>{name}</strong>
        <small>{note}</small>
      </td>
      <td className="text-right">
        <span className={`tag ${ok ? "ok" : "warn"}`}>{status}</span>
      </td>
    </tr>
  );
}
