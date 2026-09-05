"use client";

import { useRef, useState } from "react";
import type { AnalyzeResult } from "@/lib/types";
import { formatLkr, SCORE_CONFIG, type ScoreKey } from "@/lib/demo";
import { RescuePlanner, WorkflowTrace } from "./workflow-trace";

type Props = {
  result: AnalyzeResult;
  futureRules: boolean;
  files: number;
  onAddFiles: (files: FileList | null) => void;
  onToggleResolve: (id: string) => void;
  onFixAll: () => void;
  onOpenEvidence: (id: string) => void;
};

export function OverviewView({
  result,
  futureRules,
  files,
  onAddFiles,
  onToggleResolve,
  onFixAll,
  onOpenEvidence,
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
        <button className="button primary" onClick={onFixAll} disabled={ready}>
          Run what-if: fix all
        </button>
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
        <UploadCard files={files} onAddFiles={onAddFiles} />
      </div>

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
        <h2>Pre-flight workflow</h2>
        <span className="subtle">Measured on this run</span>
      </div>
      <div className="grid two">
        <WorkflowTrace result={result} />
        <RescuePlanner result={result} onOpenEvidence={onOpenEvidence} />
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
          accent="var(--brand)"
          accentSoft="var(--brand-soft)"
          progress={result.findings.find(f => f.id === "invoice")?.status === "open" ? 82 : 100}
          done={result.findings.find(f => f.id === "invoice")?.status !== "open"}
        />
        <AgentCard
          initial="R"
          name="Supplier & Reconciliation"
          meta="Schedule · CUSDEC · Supplier"
          copy="Matches documents, checks source freshness and explains every unmatched value."
          accent="var(--mint)"
          accentSoft="var(--mint-soft)"
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
          accent="var(--amber)"
          accentSoft="var(--amber-soft)"
          progress={score}
          done={ready}
          blockedLabel="Blocked"
        />
      </div>

      <div className="section-head">
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
                    {inactive ? "Not applicable" : resolved ? "Resolved" : finding.tag}
                  </span>
                  <span className="tag">{finding.ruleId}</span>
                </div>
                <p>
                  {inactive
                    ? "This check becomes active when the 1 October 2026 rule profile is selected."
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
                <button
                  className={`button small${resolved ? "" : " primary"}`}
                  disabled={inactive}
                  onClick={() => onToggleResolve(finding.id)}
                >
                  {resolved ? "Undo" : "Resolve"}
                </button>
              </div>
            </article>
          );
        })}
      </div>

      <div className="section-head">
        <h2>Readiness score breakdown</h2>
        <span className="tag brand">Formula v1.0</span>
      </div>
      <article className="card pad">
        <div className="breakdown">
          {(Object.keys(SCORE_CONFIG) as ScoreKey[]).map((key) => (
            <div className="breakdown-row" key={key}>
              <span>{SCORE_CONFIG[key].label}</span>
              <div className="bar">
                <i
                  style={
                    {
                      "--width": `${(components[key as keyof typeof components] / SCORE_CONFIG[key].max) * 100}%`,
                    } as React.CSSProperties
                  }
                />
              </div>
              <strong>
                {components[key as keyof typeof components]}/{SCORE_CONFIG[key].max}
              </strong>
            </div>
          ))}
        </div>
      </article>
    </>
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
        <div className="ring" style={{ "--score": score } as React.CSSProperties}>
          <div className="ring-value">
            <strong>{score}</strong>
            <span>out of 100</span>
          </div>
        </div>
        <div className="score-copy">
          <span className="kicker">Refund readiness</span>
          <h2>{ready ? "Approval ready" : "Attention required"}</h2>
          <p>
            {ready
              ? "All current blockers are resolved. The package can move to an authorised human reviewer."
              : `${open} evidence blocker${open === 1 ? "" : "s"} should be resolved before this package moves to human approval.`}
          </p>
          <div className="chip-row">
            <span className={`chip ${ready ? "ready" : "attention"}`}>
              {open} blocker{open === 1 ? "" : "s"} open
            </span>
            <span className="chip">
              Rule pack {futureRules ? "v2026.10" : "historical"}
            </span>
            <span className="chip">Score formula visible</span>
          </div>
        </div>
      </div>
      <div className="score-metrics">
        <div>
          <strong>{formatLkr(result.claimValueUnderReviewLkr)}</strong>
          <span>Claim value under review</span>
        </div>
        <div>
          <strong>{open}</strong>
          <span>Unresolved blockers</span>
        </div>
        <div>
          <strong>{ready ? "READY" : "NOT READY"}</strong>
          <span>45-day clock status</span>
        </div>
      </div>
    </article>
  );
}

function UploadCard({
  files,
  onAddFiles,
}: {
  files: number;
  onAddFiles: (files: FileList | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  return (
    <article className="card pad upload">
      <div className="card-head">
        <div>
          <h2>Add evidence</h2>
          <p>One invoice image per analysis run</p>
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
          <strong>Drop an invoice photo here</strong>
          <span>JPEG, PNG, WebP or BMP, up to 10 MB. PDF and spreadsheet ingest are on the roadmap.</span>
          <span className="button small">Choose file</span>
          <input
            ref={inputRef}
            type="file"
            // The extraction path sends one image to the vision model, so the
            // picker offers exactly what the backend can actually process.
            accept="image/jpeg,image/png,image/webp,image/bmp"
            hidden
            onChange={(event) => {
              onAddFiles(event.target.files);
              event.target.value = "";
            }}
          />
        </div>
      </div>
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
