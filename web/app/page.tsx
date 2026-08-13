"use client";

import { useEffect, useState } from "react";
import { type MascotMood } from "@/components/SikiMascot";
import { SiteNav } from "@/components/SiteNav";
import { MarketingCtas } from "@/components/MarketingCtas";
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
              Read-only Xero checks
            </div>
            <h1 className="mt-5 text-4xl sm:text-6xl font-bold text-stone-950 leading-[1.03] tracking-tight fade-in-up fade-in-up-delay-1">
              Find money hiding in your Xero books.
            </h1>
            <p className="mt-5 text-lg text-stone-600 max-w-xl leading-relaxed fade-in-up fade-in-up-delay-2">
              Duplicate payments, overdue customers, tax flags — Siki finds them. You approve every fix.
            </p>
            <MarketingCtas />
          </div>

          <div className="fade-in-up fade-in-up-delay-3">
            <CheckProofCard
              eyebrow="This week's Xero check"
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

      {(moneyFound > 0 || discrepanciesFound > 0) && metrics?.mode !== "demo" && (
        <section className="max-w-4xl mx-auto px-6 pb-10">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              { label: "Money Found", value: `£${moneyFound.toFixed(0)}`, sub: "Overdue invoices identified" },
              { label: "Issues Caught", value: String(discrepanciesFound || 0), sub: "Flagged before the accountant" },
            ].map((stat) => (
              <div key={stat.label} className="border-y border-stone-200 py-4">
                <div className="text-[10px] uppercase tracking-wide text-stone-500 font-semibold">{stat.label}</div>
                <div className="text-2xl font-bold text-stone-900 mt-1">{stat.value}</div>
                <div className="text-xs text-stone-500 mt-1">{stat.sub}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      <JobStrip
        jobs={[
          { title: "Recover overdue", href: "/books?flow=check&persona=zana" },
          { title: "Catch duplicates", href: "/books?flow=check&persona=siki" },
          { title: "Share a margin note", href: "/b/catering" },
        ]}
      />
      <PersonaEntryStrip />
      <MarketingFooter />
    </main>
  );
}
