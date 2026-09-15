import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { RippleEffect } from "@/components/ripple";

// Self-hosted via next/font (no external request, no layout shift). Variable
// names are distinct from the --font-ui/--font-mono/--font-heading tokens in
// globals.css so there is no collision with those existing, widely-used
// custom properties - globals.css layers these loaded fonts in as their
// first choice instead. Plus Jakarta Sans on headings only, paired with
// Inter body text, is the deliberate two-typeface split - one flat font
// everywhere is what was reading as generic/unpolished.
const inter = Inter({ subsets: ["latin"], variable: "--font-sans-nf", display: "swap" });
const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono-nf", display: "swap" });
const plusJakarta = Plus_Jakarta_Sans({ subsets: ["latin"], weight: ["600", "700", "800"], variable: "--font-heading-nf", display: "swap" });

export const metadata: Metadata = {
  title: "ComplyPilot RefundShield",
  description:
    "VAT compliance and refund readiness for Sri Lanka's VAT-registered businesses. Synthetic demo data.",
};

// Runs before paint so a saved dark-mode choice never flashes light first.
// Default is light, matching the design system - dark is opt-in only.
const THEME_INIT_SCRIPT = `
  try {
    var saved = localStorage.getItem("cp-theme");
    if (saved === "dark") document.documentElement.setAttribute("data-theme", "dark");
  } catch (e) {}
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${inter.variable} ${jetbrainsMono.variable} ${plusJakarta.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        {children}
        <RippleEffect />
      </body>
    </html>
  );
}
