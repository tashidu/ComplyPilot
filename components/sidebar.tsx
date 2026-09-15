"use client";

export type ViewId =
  | "lifecycle"
  | "account"
  | "business"
  | "vat-registration"
  | "ramis-api"
  | "vat-ledger"
  | "invoice-builder"
  | "invoice-register"
  | "vat-return"
  | "overview"
  | "inbox"
  | "tasks"
  | "period-close"
  | "evidence"
  | "smart-fix"
  | "rules"
  | "periods"
  | "submissions"
  | "filing"
  | "audit";

const NAV: { label: string; items: { id: ViewId; label: string }[] }[] = [
  {
    label: "Setup",
    items: [
      { id: "lifecycle", label: "VAT journey" },
      { id: "account", label: "Account & login" },
      { id: "business", label: "Business profile" },
      { id: "vat-registration", label: "VAT registration" },
      { id: "ramis-api", label: "RAMIS API setup" },
    ],
  },
  {
    label: "VAT operations",
    items: [
      { id: "vat-ledger", label: "Input & output VAT" },
      { id: "invoice-builder", label: "Create VAT invoice" },
      { id: "invoice-register", label: "Invoice register" },
      { id: "vat-return", label: "Prepare VAT return" },
    ],
  },
  {
    label: "Current period",
    items: [
      { id: "overview", label: "Overview" },
      { id: "inbox", label: "Invoice inbox" },
      { id: "tasks", label: "Saved tasks" },
      { id: "period-close", label: "Close period" },
    ],
  },
  {
    label: "AI intelligence",
    items: [
      { id: "smart-fix", label: "Smart Fix Studio" },
      { id: "evidence", label: "Evidence graph" },
      { id: "rules", label: "Rules & time machine" },
    ],
  },
  {
    label: "Records",
    items: [
      { id: "periods", label: "VAT periods" },
      { id: "submissions", label: "Submission history" },
      { id: "filing", label: "Mock filing" },
      { id: "audit", label: "Audit trail" },
    ],
  },
];

export function Sidebar({
  view,
  onNavigate,
  openBlockers,
  smartFixCount,
  taskCount,
}: {
  view: ViewId;
  onNavigate: (view: ViewId) => void;
  openBlockers: number;
  smartFixCount: number;
  taskCount: number;
}) {
  return (
    <aside className="sidebar" aria-label="Primary">
      <div className="brand">
        <div className="brand-mark">CP</div>
        <div>
          <strong>ComplyPilot</strong>
          <small>RefundShield</small>
        </div>
      </div>

      <nav className="nav">
        {NAV.map((group) => (
          <div className="nav-group" key={group.label}>
            <div className="nav-label">{group.label}</div>
            {group.items.map((item) => (
              <button
                key={item.id}
                className="nav-item"
                aria-current={view === item.id ? "page" : undefined}
                onClick={() => onNavigate(item.id)}
              >
                <span className="nav-mark" aria-hidden="true" />
                <span>{item.label}</span>
                {item.id === "evidence" && openBlockers > 0 ? <span className="nav-count">{openBlockers}</span> : null}
                {item.id === "smart-fix" && smartFixCount > 0 ? <span className="nav-count">{smartFixCount}</span> : null}
                {item.id === "tasks" && taskCount > 0 ? <span className="nav-count">{taskCount}</span> : null}
              </button>
            ))}
          </div>
        ))}
      </nav>

      <div className="sidebar-foot">
        <strong>Transparent by design</strong>
        Demo and user-provided data stay labelled. The score is a readiness proxy, not an official IRD risk rating.
      </div>
    </aside>
  );
}
