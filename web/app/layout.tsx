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

export const metadata: Metadata = {
  title: "Sikizana Books — AI Bookkeeper for Xero",
  description: "AI-powered bookkeeping for Xero. Reconcile transactions, find discrepancies, and get plain-English P&L explanations.",
  applicationName: "Sikizana Books",
  authors: [{ name: "Sikizana" }],
  keywords: ["Xero", "bookkeeping", "AI", "reconciliation", "P&L", "journal entries", "accounting"],
  icons: {
    icon: [
      { url: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' rx='22' fill='%23D4843A'/%3E%3Ccircle cx='36' cy='42' r='12' fill='white'/%3E%3Ccircle cx='64' cy='42' r='12' fill='white'/%3E%3Ccircle cx='36' cy='42' r='7' fill='%231A1A2E'/%3E%3Ccircle cx='64' cy='42' r='7' fill='%231A1A2E'/%3E%3Ccircle cx='38' cy='40' r='2.5' fill='white'/%3E%3Ccircle cx='66' cy='40' r='2.5' fill='white'/%3E%3Cpolygon points='46,54 54,54 50,60' fill='%23E8954A'/%3E%3C/svg%3E", type: "image/svg+xml" },
    ],
    apple: [
      { url: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' rx='22' fill='%23D4843A'/%3E%3Ccircle cx='36' cy='42' r='12' fill='white'/%3E%3Ccircle cx='64' cy='42' r='12' fill='white'/%3E%3Ccircle cx='36' cy='42' r='7' fill='%231A1A2E'/%3E%3Ccircle cx='64' cy='42' r='7' fill='%231A1A2E'/%3E%3Ccircle cx='38' cy='40' r='2.5' fill='white'/%3E%3Ccircle cx='66' cy='40' r='2.5' fill='white'/%3E%3Cpolygon points='46,54 54,54 50,60' fill='%23E8954A'/%3E%3C/svg%3E" },
    ],
  },
  openGraph: {
    title: "Sikizana Books — AI Bookkeeper for Xero",
    description: "Reconcile transactions, find discrepancies, and get plain-English P&L explanations. Powered by AI, human-in-the-loop by design.",
    type: "website",
    siteName: "Sikizana Books",
  },
  twitter: {
    card: "summary",
    title: "Sikizana Books — AI Bookkeeper for Xero",
    description: "AI-powered bookkeeping for Xero. Reconcile, audit, and explain your books in plain English.",
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
