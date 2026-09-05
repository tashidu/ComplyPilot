import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ComplyPilot RefundShield",
  description:
    "VAT refund readiness and evidence autopilot for Sri Lankan exporters. Synthetic demo data.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
