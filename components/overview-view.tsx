"use client";

import { useRef, useState } from "react";
import type { AnalyzeResult } from "@/lib/types";
import { formatLkr, SCORE_CONFIG, type ScoreKey } from "@/lib/demo";
import { RescueSimulator } from "./rescue-simulator";

/** The same red/amber/green read used everywhere a 0-100-ish ratio needs a
 * status colour: the overall ring, and each composition meter against its
 * own max. Never a fixed accent - the colour always means the value. */
function toneFor(ratioPercent: number): { text: string; solid: string } {
  if (ratioPercent < 60) return { text: "var(--red)", solid: "var(--red-solid)" };
  if (ratioPercent < 90) return { text: "var(--amber)", solid: "var(--amber-solid)" };
  return { text: "var(--green)", solid: "var(--green-solid)" };
}

type Props = {
  result: AnalyzeResult;
  futureRules: boolean;
  files: number;
  onAddFiles: (files: FileList | null) => void;
  onToggleResolve: (id: string) => void;
  onQueueRescueActions: (ids: string[]) => Promise<void>;
  onOpenEvidence: (id: string) => void;
  onExportPassport: () => void;
  onOpenSmartFix: () => void;
};

export function OverviewView({
  result,
  futureRules,
  files,
  onAddFiles,
  onToggleResolve,
  onQueueRescueActions,
  onOpenEvidence,
  onExportPassport,
  onOpenSmartFix,
}: Props) {
  const openBlockers = result.findings.filter(f => f.status === "open");
  const score = result.score.total;
  const ready = openBlockers.length === 0;
  const components = result.score.components;

  return (
    <>
      <div className="page-head">
        <div>
          <span className="eyebrow">VAT refund readiness & evidence autopilot</span>
          <h1>Protect the 45-day clock.</h1>
          <p className="subtle" style={{ marginTop: 6 }}>
            Find correctable evidence blockers before filing, then keep every decision traceable.
          </p>
        </div>
        <div className="page-actions">
          <button className="button" onClick={onExportPassport}>
            Export Refund Passport
          </button>
        </div>
      </div>

      <div className="notice">
        <span aria-hidden="true">ℹ</span>
        <div>
          <b>Decision support only.</b> The readiness score uses a published, versioned formula. It
          does not reproduce the IRD&apos;s private model or guarantee a payment date.
        </div>
      </div>

      <div className="grid hero" style={{ marginTop: 16 }}>
        <ScoreCard result={result} score={score} ready={ready} open={openBlockers.length} futureRules={futureRules} />
        <UploadCard result={result} files={files} onAddFiles={onAddFiles} />
      </div>

      <div className="section-head">
        <h2>Score composition</h2>
        <span className="tag brand">Formula v1.0</span>
      </div>
      <article className="card pad">
        <div className="breakdown">
          {(Object.keys(SCORE_CONFIG) as ScoreKey[]).map((key) => {
            const value = components[key as keyof typeof components];
            const max = SCORE_CONFIG[key].max;
            const ratio = (value / max) * 100;
            const tone = toneFor(ratio);
            return (
              <div className="breakdown-row" key={key}>
                <span>{SCORE_CONFIG[key].label}</span>
                <div className="bar">
                  <i style={{ "--width": `${ratio}%`, "--tone": tone.solid } as React.CSSProperties} />
                </div>
                <strong className="mono">
                  {value}/{max}
                </strong>
              </div>
            );
          })}
        </div>
      </article>

      <div className="section-head">
        <h2>Refund Rescue Simulator</h2>
        <span className="subtle">Actual vs. selected what-if</span>
      </div>
      <RescueSimulator result={result} onOpenEvidence={onOpenEvidence} onQueueSelected={onQueueRescueActions} />

      <div className="section-head">
        <h2>Live VAT Schedule reconciliation</h2>
        <span className="tag brand">RECON-CSV-001</span>
      </div>
      <ScheduleReconciliationCard result={result} />

      <div className="section-head">
        <h2>Current evidence position</h2>
        <span className="subtle">Updated just now</span>
      </div>
      <div className="grid three">
        <Metric tone="brand" icon="✓" value="10 / 10" label="Invoices extracted with confidence" />
        <Metric
          tone="mint"
          icon="≋"
          value={result.findings.find(f => f.id === "customs")?.status === "resolved" ? "100%" : "87%"}
          label="Value matched across schedule and Customs"
        />
        <Metric
          tone="amber"
          icon="!"
          value={String(openBlockers.length)}
          label="Items routed to human review"
        />
      </div>

      <div className="section-head">
        <h2>Agent workspace</h2>
        <span className="subtle">Three specialist agents</span>
      </div>
      <div className="grid three">
        <AgentCard
          initial="D"
          name="Document Compliance"
          meta="Schema-validated invoice fields"
          copy="Extracts invoice fields, validates calculations and applies the selected rule pack."
          accent="var(--primary-solid)"
          accentSoft="var(--primary-c)"
          progress={result.findings.find(f => f.id === "invoice")?.status === "open" ? 82 : 100}
          done={result.findings.find(f => f.id === "invoice")?.status !== "open"}
        />
        <AgentCard
          initial="R"
          name="Supplier & Reconciliation"
          meta="Schedule · CUSDEC · Supplier"
          copy="Matches documents, checks source freshness and explains every unmatched value."
          accent="var(--green-solid)"
          accentSoft="var(--green-c)"
          progress={
            result.findings.find(f => f.id === "supplier")?.status === "resolved" && result.findings.find(f => f.id === "customs")?.status === "resolved" ? 100 : 87
          }
          done={result.findings.find(f => f.id === "supplier")?.status === "resolved" && result.findings.find(f => f.id === "customs")?.status === "resolved"}
        />
        <AgentCard
          initial="F"
          name="Refund Readiness"
          meta="Score · clock · action plan"
          copy="Combines verified evidence through a deterministic score and approval workflow."
          accent="var(--amber-solid)"
          accentSoft="var(--amber-c)"
          progress={score}
          done={ready}
          blockedLabel="Blocked"
        />
      </div>

      <div className="section-head" id="priority-blockers">
        <h2>Priority blockers</h2>
        <button className="button small" onClick={() => onOpenEvidence(openBlockers[0]?.id ?? "supplier")}>
          Open evidence graph
        </button>
      </div>
      <div className="blockers">
        {result.findings.map((finding) => {
          const resolved = finding.status === "resolved";
          const inactive = finding.status === "inactive";
          return (
            <article
              key={finding.id}
              className={`blocker${resolved ? " resolved" : ""}${inactive ? " inactive" : ""}`}
            >
              <div className="blocker-badge">{resolved || inactive ? "✓" : finding.badge}</div>
              <div className="blocker-body">
                <div className="blocker-title">
                  <strong>{finding.title}</strong>
                  <span
                    className={`tag ${
                      resolved || inactive ? "ok" : finding.severity === "high" ? "alert" : "warn"
                    }`}
                  >
                    {inactive
                      ? finding.id === "schedule"
                        ? "Invoice required"
                        : "Not applicable"
                      : resolved
                        ? "Resolved"
                        : finding.tag}
                  </span>
                  <span className="tag">{finding.ruleId}</span>
                </div>
                <p>
                  {inactive
                    ? finding.id === "schedule"
                      ? finding.description
                      : "This check becomes active when the 1 October 2026 rule profile is selected."
                    : resolved
                      ? "Evidence was updated and the readiness calculation was re-run."
                      : finding.description}
                </p>
                <div className="blocker-meta">
                  {finding.meta.map((item) => (
                    <span key={item}>{item}</span>
                  ))}
                </div>
              </div>
              <div className="blocker-actions">
                <button className="button small" onClick={() => onOpenEvidence(finding.id)}>
                  Evidence
                </button>
                {finding.id === "invoice" ? (
                  <button className="button small" onClick={onOpenSmartFix}>
                    Smart Fix
                  </button>
                ) : null}
                <button
                  className={`button small${resolved ? "" : " primary"}`}
                  disabled={inactive}
                  onClick={() => onToggleResolve(finding.id)}
                >
                  {resolved ? "View completed" : finding.id === "invoice" ? "Open Smart Fix" : "Open task"}
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}

function ScoreRing({ score }: { score: number }) {
  const size = 152;
  const stroke = 13;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - Math.min(100, Math.max(0, score)) / 100);
  const tone = toneFor(score);
  return (
    <div className="score-ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--track)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={tone.solid}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="score-ring-value">
        <strong className="mono">{score}</strong>
        <span>out of 100</span>
      </div>
    </div>
  );
}

function ScoreCard({
  result,
  score,
  ready,
  open,
  futureRules
}: {
  result: AnalyzeResult;
  score: number;
  ready: boolean;
  open: number;
  futureRules: boolean;
}) {
  return (
    <article className="score-card">
      <div className="score-top">
        <ScoreRing score={score} />
        <div className="score-copy">
          <span className="kicker">Refund readiness</span>
          <span className={`status-chip ${ready ? "ready" : "attention"}`}>
            {ready ? "Approval ready" : "Attention required"}
          </span>
          <h2>{ready ? "Every blocker is resolved" : `${open} evidence blocker${open === 1 ? "" : "s"} need attention`}</h2>
          <p>
            {ready
              ? "The package can move to an authorised human reviewer."
              : "Resolve these before this package moves to human approval."}
          </p>
          <div className="chip-row">
            <span className="chip">Rule pack {futureRules ? "v2026.10" : "historical"}</span>
          </div>
          {!ready ? (
            <a className="score-cta" href="#priority-blockers">
              Review priority blockers ↓
            </a>
          ) : null}
        </div>
      </div>
      <div className="score-metrics">
        <div>
          <strong className="mono">{formatLkr(result.claimValueUnderReviewLkr)}</strong>
          <span>Claim value under review</span>
        </div>
        <div>
          <strong className="mono">{open}</strong>
          <span>Unresolved blockers</span>
        </div>
        <div>
          <strong>{ready ? "Ready to start" : "Clock not started"}</strong>
          <span>45-day clock status</span>
        </div>
      </div>
    </article>
  );
}

function UploadCard({
  result,
  files,
  onAddFiles,
}: {
  result: AnalyzeResult;
  files: number;
  onAddFiles: (files: FileList | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  return (
    <article className="card pad upload">
      <div className="card-head">
        <div className="card-head-icon" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 13V3M10 3l-4 4M10 3l4 4" />
            <path d="M3 14v1.5A1.5 1.5 0 0 0 4.5 17h11a1.5 1.5 0 0 0 1.5-1.5V14" />
          </svg>
        </div>
        <div>
          <h2>Add evidence</h2>
          <p>One invoice image plus one VAT Schedule CSV per analysis run</p>
        </div>
        <span className="pill">{files} files</span>
      </div>
      <div
        className={`dropzone${dragging ? " dragging" : ""}`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          onAddFiles(event.dataTransfer.files);
        }}
      >
        <div>
          <div className="dropzone-icon" aria-hidden="true">
            ↑
          </div>
          <strong>Drop an invoice photo and/or a VAT Schedule CSV</strong>
          <span>JPEG, PNG, WebP or BMP up to 10 MB; CSV up to 2 MB.</span>
          <span className="button small">Choose files</span>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/bmp,.csv,text/csv"
            multiple
            hidden
            onChange={(event) => {
              onAddFiles(event.target.files);
              event.target.value = "";
            }}
          />
        </div>
      </div>
      <div className="upload-foot">
        <span>
          Schedule: {result.scheduleEvidence ? `${result.scheduleEvidence.fileName} · ${result.scheduleEvidence.rows.length} rows` : "not uploaded"}
        </span>
        <a href="/demo/vat-schedule-demo.csv" download>
          Download demo CSV
        </a>
      </div>
    </article>
  );
}

function formatScheduleAmount(value: number | null) {
  if (value === null) return "Not supplied";
  return new Intl.NumberFormat("en-LK", {
    style: "currency",
    currency: "LKR",
    maximumFractionDigits: 2,
  }).format(value);
}

function ScheduleReconciliationCard({ result }: { result: AnalyzeResult }) {
  const reconciliation = result.scheduleReconciliation;
  // Typed as a total Record so adding a status to the union fails the build
  // here rather than rendering an empty badge.
  const STATUS_LABELS: Record<
    AnalyzeResult["scheduleReconciliation"]["status"],
    { label: string; tag: string }
  > = {
    NOT_UPLOADED: { label: "Awaiting CSV", tag: "" },
    NEEDS_INVOICE: { label: "Invoice required", tag: "warn" },
    MATCHED: { label: "Matched", tag: "ok" },
    NEEDS_REVIEW: { label: "Needs human review", tag: "warn" },
    MISMATCH: { label: "Review differences", tag: "alert" },
    UNMATCHED: { label: "No matching row", tag: "alert" },
  };
  const status = STATUS_LABELS[reconciliation.status];

  return (
    <article className="card pad schedule-card">
      <div className="card-head">
        <div className="card-head-icon" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 6.5h9M4 6.5l2.3-2.3M4 6.5l2.3 2.3" />
            <path d="M16 13.5H7M16 13.5l-2.3-2.3M16 13.5l-2.3 2.3" />
          </svg>
        </div>
        <div>
          <h2>{reconciliation.fileName ?? "Upload a VAT Schedule CSV to run the real matcher"}</h2>
          <p>
            {reconciliation.status === "NOT_UPLOADED"
              ? "The matcher compares invoice number, supplier TIN, net amount, VAT and gross amount."
              : `${reconciliation.rowCount} rows parsed from the user upload; no language model changes the values.`}
          </p>
        </div>
        <span className={`tag ${status.tag}`}>{status.label}</span>
      </div>

      {reconciliation.totals ? (
        <div className="schedule-totals">
          <div><span>Net total</span><strong>{formatScheduleAmount(reconciliation.totals.netAmount)}</strong></div>
          <div><span>VAT total</span><strong>{formatScheduleAmount(reconciliation.totals.vatAmount)}</strong></div>
          <div><span>Gross total</span><strong>{formatScheduleAmount(reconciliation.totals.grossAmount)}</strong></div>
        </div>
      ) : null}

      {reconciliation.matchedFields.length > 0 ? (
        <div className="schedule-matches">
          <strong>Matched:</strong>
          {reconciliation.matchedFields.map((field) => (
            <span className="chip ready" key={field}>✓ {field}</span>
          ))}
        </div>
      ) : null}

      {reconciliation.variances.length > 0 ? (
        <div className="table-wrap schedule-variances">
          <table>
            <thead><tr><th>Check</th><th>Invoice</th><th>Schedule</th><th>Difference</th></tr></thead>
            <tbody>
              {reconciliation.variances.map((variance) => (
                <tr key={variance.field}>
                  <td><strong>{variance.label}</strong></td>
                  <td>{variance.invoiceValue ?? "Missing"}</td>
                  <td>{variance.scheduleValue ?? "Missing"}</td>
                  <td>{variance.difference === null ? "—" : formatScheduleAmount(variance.difference)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {reconciliation.warnings.length > 0 ? (
        <div className="notice schedule-warning">
          <span aria-hidden="true">!</span>
          <div>{reconciliation.warnings.join(" ")}</div>
        </div>
      ) : null}
    </article>
  );
}

function Metric({
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

function AgentCard({
  initial,
  name,
  meta,
  copy,
  accent,
  accentSoft,
  progress,
  done,
  blockedLabel = "Review",
}: {
  initial: string;
  name: string;
  meta: string;
  copy: string;
  accent: string;
  accentSoft: string;
  progress: number;
  done: boolean;
  blockedLabel?: string;
}) {
  return (
    <article
      className="card agent"
      style={{ "--accent": accent, "--accent-soft": accentSoft } as React.CSSProperties}
    >
      <div className="agent-head">
        <div className="agent-avatar">{initial}</div>
        <div>
          <h3>{name}</h3>
          <p>{meta}</p>
        </div>
        <span className={`tag ${done ? "ok" : "warn"}`}>{done ? "Complete" : blockedLabel}</span>
      </div>
      <p>{copy}</p>
      <div className="agent-bar">
        <i style={{ "--progress": `${progress}%` } as React.CSSProperties} />
      </div>
    </article>
  );
}
