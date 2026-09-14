import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ComplyPilot RefundShield",
  description:
    "VAT compliance and refund readiness for Sri Lanka's VAT-registered businesses. Synthetic demo data.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
