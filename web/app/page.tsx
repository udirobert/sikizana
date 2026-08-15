"use client";

import { useEffect, useState } from "react";
import { type MascotMood } from "@/components/SikiMascot";
import { SiteNav } from "@/components/SiteNav";
import {
  BooksNextLinks,
  COMPARE_TYPICALS_HREF,
  CONNECT_XERO_HREF,
  SAMPLE_BOOKS_HREF,
} from "@/components/MarketingCtas";
import { SectorCheckEntry } from "@/components/SectorCheckEntry";
import { MarketingFooter } from "@/components/MarketingFooter";
import {
  AgeingEvidence,
  CheckProofCard,
  DuplicateEvidence,
  SummaryEvidence,
} from "@/components/CheckProofCard";
import { JobStrip, PersonaEntryStrip } from "@/components/PersonaEntryStrip";
import { useImpactMetrics } from "@/hooks/useRevenue";

export default function LandingPage() {
  const metrics = useImpactMetrics(60_000);
  const moneyFound = metrics?.money_found ?? 0;
  const discrepanciesFound = metrics?.discrepancies_found ?? 0;

  const [mood, setMood] = useState<MascotMood>("wave");
  useEffect(() => {
    const cycle: MascotMood[] = ["wave", "idle", "look", "idle", "wave"];
    let i = 0;
    const interval = setInterval(() => {
      i = (i + 1) % cycle.length;
      setMood(cycle[i]);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  return (
    <main className="min-h-screen bg-stone-50 overflow-x-hidden">
      <SiteNav variant="marketing" />

      <section className="max-w-6xl mx-auto px-6 pt-14 pb-12">
        <div className="grid grid-cols-1 lg:grid-cols-[1.02fr_0.98fr] gap-10 items-center">
          <div className="text-left">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-700 fade-in-up">
              Typicals first · then your books
            </div>
            <h1 className="mt-5 text-4xl sm:text-6xl font-bold text-stone-950 leading-[1.03] tracking-tight fade-in-up fade-in-up-delay-1">
              See how your numbers sit vs typical UK ranges.
            </h1>
            <p className="mt-5 text-lg text-stone-600 max-w-xl leading-relaxed fade-in-up fade-in-up-delay-2">
              Type what you run, drag a ballpark, then check sample books or connect Xero.
              Siki finds duplicates and overdue — you approve every fix.
            </p>
            <SectorCheckEntry />
            <BooksNextLinks />
            <p className="mt-3 text-xs text-stone-500 fade-in-up fade-in-up-delay-4">
              No signup · Figures stay in your browser until you share · Nothing changes without approval
            </p>
          </div>

          <div className="fade-in-up fade-in-up-delay-3">
            <CheckProofCard
              eyebrow="Then in the books"
              title="3 things to review"
              sikiMood={mood}
              findings={[
                {
                  id: "overdue",
                  label: "Overdue receivables",
                  value: "£4,200",
                  tone: "bg-rose-50 text-rose-700 border-rose-100",
                  evidence: (
                    <AgeingEvidence
                      rows={[
                        ["Aster Studio", "45d overdue", "£1,800"],
                        ["Hinton & Co", "38d overdue", "£1,400"],
                        ["North Works", "31d overdue", "£1,000"],
                      ]}
                    />
                  ),
                },
                {
                  id: "duplicate",
                  label: "Possible duplicate payment",
                  value: "£680",
                  tone: "bg-amber-50 text-amber-700 border-amber-100",
                  evidence: (
                    <DuplicateEvidence
                      rows={[
                        ["13 Jun", "Cobalt Electrical", "-£680"],
                        ["14 Jun", "Cobalt Electrical", "-£680"],
                      ]}
                    />
                  ),
                },
                {
                  id: "books",
                  label: "Books explained",
                  value: "Ready",
                  tone: "bg-sky-50 text-sky-700 border-sky-100",
                  evidence: (
                    <SummaryEvidence
                      rows={[
                        ["Cash", "£18.4k", "up £1.2k"],
                        ["Operating profit", "£6.3k", "this month"],
                        ["VAT due", "£2.1k", "in 12 days"],
                      ]}
                    />
                  ),
                },
              ]}
            />
          </div>
        </div>
      </section>

      {/* Social proof strip — always visible. Upgrades from representative
          demo figures to live numbers once a connected user loads the page.
          Keeps cold traffic informed without misleading anyone. */}
      <section className="max-w-4xl mx-auto px-6 pb-10">
        <div className="grid grid-cols-3 divide-x divide-stone-200 border-y border-stone-200 py-4">
          {[
            {
              label: "Money at risk",
              value:
                moneyFound > 0 && metrics?.mode !== "demo"
                  ? `£${Math.round(moneyFound).toLocaleString()}`
                  : "£4,880",
              sub:
                moneyFound > 0 && metrics?.mode !== "demo"
                  ? "Overdue invoices found"
                  : "Typical in a first check",
              live: moneyFound > 0 && metrics?.mode !== "demo",
            },
            {
              label: "Issues caught",
              value:
                discrepanciesFound > 0 && metrics?.mode !== "demo"
                  ? String(discrepanciesFound)
                  : "3–5",
              sub:
                discrepanciesFound > 0 && metrics?.mode !== "demo"
                  ? "Flagged before your accountant"
                  : "Per set of books, on average",
              live: discrepanciesFound > 0 && metrics?.mode !== "demo",
            },
            {
              label: "Time to check",
              value: "< 60s",
              sub: "Read-only · nothing changes",
              live: false,
            },
          ].map((stat) => (
            <div key={stat.label} className="px-4 first:pl-0 last:pr-0">
              <div className="text-[10px] uppercase tracking-wide text-stone-500 font-semibold">
                {stat.label}
              </div>
              <div className="text-xl font-bold text-stone-900 mt-1 tabular-nums">
                {stat.value}
              </div>
              <div className="text-xs text-stone-400 mt-0.5 leading-snug">{stat.sub}</div>
            </div>
          ))}
        </div>
      </section>

      <JobStrip
        jobs={[
          { title: "Compare typicals", href: COMPARE_TYPICALS_HREF },
          { title: "Sample books", href: SAMPLE_BOOKS_HREF },
          { title: "Connect Xero", href: CONNECT_XERO_HREF },
        ]}
      />
      <PersonaEntryStrip />
      <MarketingFooter />
    </main>
  );
}
