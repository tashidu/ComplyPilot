import {
  governmentDataSummary,
  governmentSources,
  inactiveVatSnapshot,
  vatInvoiceRulePack,
  vatRates,
  vatSchedules,
} from "@/lib/government-data";

const legalWeightLabel = {
  binding: "Binding source",
  "official-guidance": "Official guidance",
  informational: "Advisory only",
} as const;

function formatDate(value: string | null | undefined) {
  if (!value) return "No fixed effective date";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

export function GovernmentDataPanel() {
  const visibleSources = governmentSources.filter((source) =>
    [
      "GZ-2500-106",
      "GZ-2481-22",
      "GZ-2456-02",
      "IRD-VAT-RATES",
      "IRD-VAT-SCHEDULES",
      "IRD-INACTIVE-VAT",
      "SLC-TARIFF-2026",
    ].includes(source.id),
  );
  const standardRate = vatRates.rates.find((rate) => rate.id === "standard");

  return (
    <article className="card pad government-data">
      <div className="card-head">
        <div>
          <h2>Official government data pack</h2>
          <p>Versioned public sources used by the agents, with legal weight and freshness kept visible.</p>
        </div>
        <span className="tag ok">Verified {formatDate(governmentDataSummary.lastVerifiedAt)}</span>
      </div>

      <div className="government-stats" aria-label="Government data summary">
        <div><strong>{governmentDataSummary.sourceCount}</strong><span>official sources</span></div>
        <div><strong>{governmentDataSummary.mandatoryInvoiceFieldCount}</strong><span>mandatory invoice checks</span></div>
        <div><strong>{vatSchedules.schedules.length}</strong><span>VAT schedule types</span></div>
        <div><strong>{standardRate?.ratePercent ?? 18}%</strong><span>standard VAT reference</span></div>
      </div>

      <div className="government-source-grid">
        {visibleSources.map((source) => (
          <a
            className="government-source"
            href={source.url}
            key={source.id}
            target="_blank"
            rel="noreferrer"
          >
            <div className="government-source-head">
              <span className={`tag ${source.legalWeight === "binding" ? "brand" : ""}`}>
                {legalWeightLabel[source.legalWeight]}
              </span>
              <span className={`source-freshness ${source.freshness}`}>{source.freshness}</span>
            </div>
            <strong>{source.title}</strong>
            <span>{source.authority}</span>
            <small>
              {source.effectiveFrom ? `Effective ${formatDate(source.effectiveFrom)}` : `Checked ${formatDate(source.lastVerifiedAt)}`}
            </small>
          </a>
        ))}
      </div>

      <div className="government-agent-uses">
        <div>
          <strong>Document Agent</strong>
          <span>{vatInvoiceRulePack.version} · Gazette-backed field and format checks</span>
        </div>
        <div>
          <strong>Reconciliation Agent</strong>
          <span>{vatSchedules.schedules.map((schedule) => schedule.id.replace("VAT-", "")).join(", ")} · schedule-to-evidence mapping</span>
        </div>
        <div>
          <strong>Supplier Agent</strong>
          <span>Inactive VAT list · snapshot dated {formatDate(inactiveVatSnapshot.effectiveDate)}</span>
        </div>
      </div>

      <div className="notice government-boundary">
        <span aria-hidden="true">ℹ</span>
        <div>
          <b>Safe MVP boundary:</b> this repository contains public rules and source metadata only—no taxpayer records.
          The inactive-registration source is a dated snapshot, and every supplier, tariff or legal decision still requires human confirmation.
        </div>
      </div>
    </article>
  );
}
