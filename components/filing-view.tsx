"use client";

import type { AnalyzeResult } from "@/lib/types";
import { GuiAgentPanel } from "./gui-agent-panel";
import { PageHead } from "./ui";

export function FilingView({
  result,
  approved,
  submitted,
  onApprovalChange,
  onSubmit,
  onAgentEvent,
}: {
  result: AnalyzeResult;
  approved: boolean;
  submitted: boolean;
  onApprovalChange: (value: boolean) => void;
  onSubmit: () => void;
  onAgentEvent?: (title: string, detail: string) => void;
}) {
  const openBlockers = result.findings.filter(f => f.status === "open");
  const ready = openBlockers.length === 0;
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

      <div className="grid two">
        <article className="card pad">
          <div className="card-head">
            <div>
              <h2>Submission readiness</h2>
              <p>All gates must pass before the mock action is enabled.</p>
            </div>
            <strong>{score}/100</strong>
          </div>

          <div className="checklist">
            <div className="check-row">
              <div className="check-mark">✓</div>
              <div>
                <strong>Documents extracted</strong>
                <span>10 invoices with source-image trace.</span>
              </div>
            </div>
            <div className="check-row">
              <div className={`check-mark${ready ? "" : " wait"}`}>{ready ? "✓" : "!"}</div>
              <div>
                <strong>Evidence blockers resolved</strong>
                <span>
                  {ready
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

          <div className="approval">
            <label>
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
          </div>

          <button
            className="button success wide"
            style={{ marginTop: 12 }}
            disabled={!ready || !approved || submitted}
            onClick={onSubmit}
          >
            {submitted ? "Mock submission completed" : "Submit to mock portal"}
          </button>
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
                <PackageRow name="VAT return package" note="October 2026" status="Ready" ok />
                <PackageRow name="Input schedule evidence" note="10 invoice links" status="Attached" ok />
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
      <td style={{ textAlign: "right" }}>
        <span className={`tag ${ok ? "ok" : "warn"}`}>{status}</span>
      </td>
    </tr>
  );
}
