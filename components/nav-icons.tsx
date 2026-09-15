import type { ViewId } from "./sidebar";

/**
 * One small line-icon set for the sidebar, hand-drawn to match (20x20,
 * 1.7 stroke, round joins, no fill) so the drawer looks the same collapsed
 * or expanded rather than falling back to letter monograms.
 */
const ICON_PROPS = {
  width: 18,
  height: 18,
  viewBox: "0 0 20 20",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true as const,
};

const ICONS: Record<ViewId, React.ReactNode> = {
  lifecycle: (
    <svg {...ICON_PROPS}>
      <path d="M10 2.5v3M10 14.5v3M2.5 10h3M14.5 10h3" />
      <circle cx="10" cy="10" r="4.5" />
    </svg>
  ),
  account: (
    <svg {...ICON_PROPS}>
      <circle cx="10" cy="7" r="3.2" />
      <path d="M3.8 17c0-3 2.8-5.2 6.2-5.2S16.2 14 16.2 17" />
    </svg>
  ),
  business: (
    <svg {...ICON_PROPS}>
      <rect x="3" y="7.5" width="14" height="9.5" rx="1.3" />
      <path d="M7 7.5V5.3A1.3 1.3 0 0 1 8.3 4h3.4A1.3 1.3 0 0 1 13 5.3V7.5" />
      <path d="M3 11.5h14" />
    </svg>
  ),
  "vat-registration": (
    <svg {...ICON_PROPS}>
      <path d="M5.5 2.8h6.2L16 7v10.2a1 1 0 0 1-1 1H5.5a1 1 0 0 1-1-1V3.8a1 1 0 0 1 1-1Z" />
      <path d="M11.5 2.8V7H16" />
      <path d="M7.3 12.2l1.7 1.7 3.2-3.7" />
    </svg>
  ),
  "ramis-api": (
    <svg {...ICON_PROPS}>
      <path d="M8 12 4.5 15.5a2 2 0 0 1-2.8-2.8L5.2 9.3M12 8l3.5-3.5a2 2 0 1 1 2.8 2.8L14.8 10.7" />
      <path d="M7 13 13 7" />
    </svg>
  ),
  "vat-ledger": (
    <svg {...ICON_PROPS}>
      <path d="M4 6.5h9M4 6.5l2.3-2.3M4 6.5l2.3 2.3" />
      <path d="M16 13.5H7M16 13.5l-2.3-2.3M16 13.5l-2.3 2.3" />
    </svg>
  ),
  "invoice-builder": (
    <svg {...ICON_PROPS}>
      <path d="M5.5 2.8h6.2L16 7v10.2a1 1 0 0 1-1 1H5.5a1 1 0 0 1-1-1V3.8a1 1 0 0 1 1-1Z" />
      <path d="M11.5 2.8V7H16" />
      <path d="M10 10v4M8 12h4" />
    </svg>
  ),
  "invoice-register": (
    <svg {...ICON_PROPS}>
      <rect x="4" y="3" width="10" height="13" rx="1" transform="translate(1 0)" />
      <path d="M6.5 7.5h7M6.5 10.5h7M6.5 13.5h4.5" />
    </svg>
  ),
  "vat-return": (
    <svg {...ICON_PROPS}>
      <path d="M5.5 2.8h6.2L16 7v10.2a1 1 0 0 1-1 1H5.5a1 1 0 0 1-1-1V3.8a1 1 0 0 1 1-1Z" />
      <path d="M11.5 2.8V7H16" />
      <path d="M6.8 10.5h6.4M6.8 13h4.4" />
    </svg>
  ),
  overview: (
    <svg {...ICON_PROPS}>
      <rect x="3" y="3" width="6" height="6" rx="1.1" />
      <rect x="11" y="3" width="6" height="6" rx="1.1" />
      <rect x="3" y="11" width="6" height="6" rx="1.1" />
      <rect x="11" y="11" width="6" height="6" rx="1.1" />
    </svg>
  ),
  inbox: (
    <svg {...ICON_PROPS}>
      <path d="M3 11 5.4 4.3A1 1 0 0 1 6.3 3.7h7.4a1 1 0 0 1 .95.6L17 11" />
      <path d="M3 11v4.2A1 1 0 0 0 4 16.2h12a1 1 0 0 0 1-1V11h-4.2l-.9 1.9H9.1L8.2 11H3Z" />
    </svg>
  ),
  tasks: (
    <svg {...ICON_PROPS}>
      <path d="M4.2 6.3 5.6 7.7 8 5.3" />
      <path d="M4.2 12.3 5.6 13.7 8 11.3" />
      <path d="M11 6.3h5.2M11 12.3h5.2" />
    </svg>
  ),
  "period-close": (
    <svg {...ICON_PROPS}>
      <rect x="3" y="4.5" width="14" height="12" rx="1.3" />
      <path d="M3 8.3h14M7 3v3M13 3v3" />
      <path d="M7.3 12.2l1.7 1.7 3.2-3.7" />
    </svg>
  ),
  evidence: (
    <svg {...ICON_PROPS}>
      <circle cx="5" cy="5" r="2.1" />
      <circle cx="15" cy="5" r="2.1" />
      <circle cx="10" cy="15" r="2.1" />
      <path d="M6.6 6.3 9 13.2M13.4 6.3 11 13.2M7.1 5h5.8" />
    </svg>
  ),
  "smart-fix": (
    <svg {...ICON_PROPS}>
      <path d="M14.8 3 16 4.2 5.5 14.7l-2.3.6.6-2.3Z" />
      <path d="M4 3v2.4M3 4.2h2M16 15v2.4M15 16.2h2" />
    </svg>
  ),
  rules: (
    <svg {...ICON_PROPS}>
      <circle cx="10" cy="10" r="7" />
      <path d="M10 6v4l2.8 1.8" />
    </svg>
  ),
  periods: (
    <svg {...ICON_PROPS}>
      <rect x="3" y="4" width="14" height="13" rx="1.3" />
      <path d="M3 8h14M7 2.5v3M13 2.5v3" />
    </svg>
  ),
  submissions: (
    <svg {...ICON_PROPS}>
      <circle cx="9.5" cy="10" r="6.3" />
      <path d="M9.5 6.7V10l2.6 1.6" />
      <path d="M15.2 5.2l2-.4-.4 2" />
    </svg>
  ),
  filing: (
    <svg {...ICON_PROPS}>
      <path d="M17 3 9.5 10.5" />
      <path d="M17 3 11.7 17c-.15.4-.7.4-.85 0L9 11l-6-1.85c-.4-.15-.4-.7 0-.85L17 3Z" />
    </svg>
  ),
  audit: (
    <svg {...ICON_PROPS}>
      <path d="M10 2.8 16 5v5c0 4.2-2.6 7-6 8.2C6.6 17 4 14.2 4 10V5Z" />
      <path d="M7.3 9.8l1.7 1.7 3.7-4" />
    </svg>
  ),
};

export function NavIcon({ id }: { id: ViewId }) {
  return <>{ICONS[id]}</>;
}
