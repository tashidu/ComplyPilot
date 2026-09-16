"use client";

import type { AuthUser } from "@/lib/auth/types";
import { NavIcon } from "./nav-icons";

export type ViewId =
  | "lifecycle"
  | "account"
  | "business"
  | "vat-registration"
  | "ramis-api"
  | "vat-ledger"
  | "vat-schedules"
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
      { id: "vat-schedules", label: "IRD VAT schedules" },
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

/** Two initials for the account snippet, or "G" for a guest session. */
function initials(user: AuthUser | null): string {
  if (!user) return "G";
  return user.fullName
    .split(/\s+/)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function Sidebar({
  view,
  onNavigate,
  openBlockers,
  smartFixCount,
  taskCount,
  collapsed,
  user,
}: {
  view: ViewId;
  onNavigate: (view: ViewId) => void;
  openBlockers: number;
  smartFixCount: number;
  taskCount: number;
  collapsed: boolean;
  user: AuthUser | null;
}) {
  const badgeFor = (id: ViewId): number => {
    if (id === "evidence") return openBlockers;
    if (id === "smart-fix") return smartFixCount;
    if (id === "tasks") return taskCount;
    return 0;
  };

  return (
    <aside className={`sidebar${collapsed ? " collapsed" : ""}`} aria-label="Primary">
      <div className="brand">
        <img src="/logo.png" alt="ComplyPilot" className="brand-mark" />
        {collapsed ? null : (
          <div>
            <strong>ComplyPilot</strong>
            <small>RefundShield</small>
          </div>
        )}
      </div>

      <nav className="nav">
        {NAV.map((group) => (
          <div className="nav-group" key={group.label}>
            {collapsed ? <div className="nav-divider" role="separator" /> : <div className="nav-label">{group.label}</div>}
            {group.items.map((item) => {
              const badge = badgeFor(item.id);
              return (
                <button
                  key={item.id}
                  className="nav-item"
                  aria-current={view === item.id ? "page" : undefined}
                  data-tooltip={collapsed ? item.label : undefined}
                  onClick={() => onNavigate(item.id)}
                >
                  <span className="nav-icon" aria-hidden="true">
                    <NavIcon id={item.id} />
                  </span>
                  {collapsed ? null : <span className="nav-item-label">{item.label}</span>}
                  {badge > 0 ? <span className="nav-count">{badge}</span> : null}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      {collapsed ? null : (
        <div className="sidebar-foot">
          <button className="sidebar-account" onClick={() => onNavigate("account")}>
            <span className="sidebar-account-mark" aria-hidden="true">{initials(user)}</span>
            <span className="sidebar-account-text">
              <strong>{user ? user.fullName : "Guest session"}</strong>
              <small>{user ? user.email : "Signed out · demo data"}</small>
            </span>
          </button>
          <p className="sidebar-note">
            The score is a readiness proxy, not an official IRD risk rating.
          </p>
        </div>
      )}
    </aside>
  );
}
