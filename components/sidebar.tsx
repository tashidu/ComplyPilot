"use client";

export type ViewId = "overview" | "evidence" | "rules" | "filing" | "audit";

const NAV: { id: ViewId; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "evidence", label: "Evidence" },
  { id: "rules", label: "Rules & time machine" },
  { id: "filing", label: "Mock filing" },
  { id: "audit", label: "Audit trail" },
];

export function Sidebar({
  view,
  onNavigate,
  openBlockers,
}: {
  view: ViewId;
  onNavigate: (view: ViewId) => void;
  openBlockers: number;
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

      <div>
        <div className="nav-label">Workspace</div>
        <nav className="nav">
          {NAV.map((item, index) => (
            <button
              key={item.id}
              className="nav-item"
              aria-current={view === item.id ? "page" : undefined}
              onClick={() => onNavigate(item.id)}
            >
              <span className="nav-index">{String(index + 1).padStart(2, "0")}</span>
              <span>{item.label}</span>
              {item.id === "evidence" && openBlockers > 0 ? (
                <span className="nav-count">{openBlockers}</span>
              ) : null}
            </button>
          ))}
        </nav>
      </div>

      <div className="sidebar-foot">
        <strong>Transparent by design</strong>
        Synthetic data only. The score is a readiness proxy, not an official IRD risk rating.
      </div>
    </aside>
  );
}
