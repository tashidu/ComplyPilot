"use client";

import { EVIDENCE_INVENTORY } from "@/lib/demo";
import { PageHead, SectionHead } from "./ui";
import type { AnalyzeResult, Finding } from "@/lib/types";

export function EvidenceView({
  result,
  active,
  onSelect,
  onBack,
}: {
  result: AnalyzeResult;
  active: string;
  onSelect: (id: string) => void;
  onBack: () => void;
}) {
  const chain = result.findings.find(f => f.id === active);
  
  if (!chain) {
    return (
       <div className="pad">
          <p>Finding not found.</p>
          <button className="button" onClick={onBack}>Back to overview</button>
       </div>
    );
  }

  return (
    <>
      <PageHead
        eyebrow="Traceability"
        title="Evidence graph"
        lead="Follow every finding from source document to the recommended human action."
        action={
          <button className="button" onClick={onBack}>
            Back to overview
          </button>
        }
      />

      <article className="card pad">
        <div className="card-head">
          <div>
            <h2>{chain.graphTitle}</h2>
            <p>Rule {chain.ruleId} · pick another chain below to switch.</p>
          </div>
          <span className="pill">Confidence {chain.confidence}%</span>
        </div>
        <div className="graph">
          {chain.graph.map((node) => (
            <div key={node.title} className={`graph-node${node.status ? ` ${node.status}` : ""}`}>
              <b>{node.title}</b>
              <span>{node.detail}</span>
            </div>
          ))}
        </div>
      </article>

      <SectionHead title="Choose evidence chain" />
      <div className="grid three">
        {result.findings.map((blocker: Finding) => {
          const status = blocker.status === "resolved"
            ? "Resolved"
            : blocker.status === "inactive"
              ? "Not applicable"
              : "Needs review";
          return (
            <button
              key={blocker.id}
              className="chain-option"
              aria-pressed={active === blocker.id}
              onClick={() => onSelect(blocker.id)}
            >
              <span className="eyebrow">{blocker.id}</span>
              <h3>{blocker.title}</h3>
              <p className="subtle">
                Confidence {blocker.confidence}% · {status}
              </p>
            </button>
          );
        })}
      </div>

      <SectionHead title="Evidence inventory" aside={<span className="subtle">Synthetic dataset</span>} />
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Evidence</th>
              <th>Source</th>
              <th>Effective date</th>
              <th>Freshness</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {EVIDENCE_INVENTORY.map((row) => (
              <tr key={row.name}>
                <td>
                  <strong>{row.name}</strong>
                  <small>{row.note}</small>
                </td>
                <td>{row.source}</td>
                <td>{row.effective}</td>
                <td>
                  <span className={`tag ${row.fresh ? "ok" : "warn"}`}>
                    {row.fresh ? "Current" : "Outdated"}
                  </span>
                </td>
                <td>{row.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
