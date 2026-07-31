import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Verified Knowledge Base · Pregnancy & Postpartum",
  description: "A verified, evidence-rated, market-aware knowledge base.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
