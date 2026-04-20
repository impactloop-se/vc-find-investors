import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Find Investors — Impact Loop",
  description: "Search engine for European impact VCs and family offices",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
