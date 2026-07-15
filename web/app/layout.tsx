import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ClientProviders } from "@/components/ClientProviders";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Icons and the share card come from file conventions in this directory
// (favicon.ico, icon.svg, apple-icon.png, opengraph-image.png) — real
// files, because link scrapers fetch /favicon.ico directly and ignore
// data-URI icons. metadataBase makes the og:image URL absolute, which
// WhatsApp/X require.
export const metadata: Metadata = {
  metadataBase: new URL("https://sikizana.persidian.com"),
  title: "Sikizana - Find Money Hiding in Xero",
  description:
    "Check Xero for overdue invoices, duplicate supplier payments, tax flags, and plain-English explanations before money slips away.",
  applicationName: "Sikizana",
  authors: [{ name: "Sikizana" }],
  keywords: [
    "Xero",
    "duplicate payments",
    "invoices",
    "late payment",
    "receivables",
    "credit control",
    "AI",
    "bookkeeping",
    "accounting",
  ],
  openGraph: {
    title: "Sikizana - Find Money Hiding in Xero",
    description:
      "Check Xero for overdue invoices, duplicate supplier payments, tax flags, and plain-English explanations before money slips away.",
    type: "website",
    siteName: "Sikizana",
    url: "https://sikizana.persidian.com",
  },
  twitter: {
    card: "summary_large_image",
    title: "Sikizana - Find Money Hiding in Xero",
    description:
      "Check Xero for overdue invoices, duplicate supplier payments, tax flags, and plain-English explanations before money slips away.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ClientProviders>
          {children}
        </ClientProviders>
      </body>
    </html>
  );
}
