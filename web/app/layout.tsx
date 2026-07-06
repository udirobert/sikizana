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
  title: "Sikizana — Get Paid Faster, with Xero",
  description:
    "See who owes you what (aged 30/60/90 days), learn what's normal for your industry, and chase overdue invoices with escalating emails that stop the moment you're paid.",
  applicationName: "Sikizana",
  authors: [{ name: "Sikizana" }],
  keywords: ["Xero", "invoices", "late payment", "receivables", "credit control", "AI", "bookkeeping", "accounting"],
  openGraph: {
    title: "Sikizana — Get Paid Faster, with Xero",
    description:
      "See who owes you what, learn your industry's payment norms, and chase overdue invoices with escalating emails that stop the moment you're paid.",
    type: "website",
    siteName: "Sikizana",
    url: "https://sikizana.persidian.com",
  },
  twitter: {
    card: "summary_large_image",
    title: "Sikizana — Get Paid Faster, with Xero",
    description:
      "See who owes you what, learn your industry's payment norms, and chase overdue invoices with escalating emails that stop the moment you're paid.",
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
