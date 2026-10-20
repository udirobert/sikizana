"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { endpoints, type ImpactMetrics } from "@/lib/api";
import { SiteNav } from "@/components/SiteNav";
import { RotatedReveal } from "@/components/RotatedReveal";
import { AnimatedNumber } from "@/components/AnimatedNumber";
import { DemoBadge, ModeBadge } from "@/components/ModeBadge";
import { OverdueTrendChart } from "@/components/OverdueTrendChart";
import { StatCard } from "@/components/StatCard";

/**
 * Impact — aggregate social proof: money found, issues caught, money
 * recovered, feedback. Styled to the same stone/sky system as the rest of
 * the site (this page used to be visually off-brand). Personal impact
 * lives on /account; this page is the public story.
 */
export default function ImpactPage() {
  const [data, setData] = useState<ImpactMetrics | null>(null);
  const [error, setError] = useState(false);

  const load = async () => {
    try {
      const metrics = await endpoints.impact();
      setData(metrics);
      setError(false);
    } catch {
      setError(true);
    }
  };

  useEffect(() => {
     
    void load();
    const id = setInterval(() => void load(), 30_000);
    return () => clearInterval(id);
  }, []);

  const moneyFound = data?.money_found ?? 0;
  const overdueCount = data?.overdue_count ?? 0;
  const discrepanciesFound = data?.discrepancies_found ?? 0;
  const chaseRecovered = data?.events?.chase_recovered;
  const recovered = chaseRecovered?.total_amount ?? 0;
  const recoveredCount = chaseRecovered?.count ?? 0;
  const feedbackTotal = data?.feedback?.total ?? 0;
  const feedbackUp = data?.feedback?.up ?? 0;
  const feedbackRatio =
    feedbackTotal > 0 ? Math.round((feedbackUp / feedbackTotal) * 100) : null;
  const isDemo = data?.mode === "demo";
  const isSandbox = !!data?.mode && data.mode !== "demo" && !data.mode.startsWith("live");

  const steps = [
    {
      step: "1",
      title: "Connect Xero",
      desc: "One-click OAuth. Siki reads your invoices, bank transactions, and P&L.",
    },
    {
      step: "2",
      title: "Ask in plain English",
      desc: "“What’s overdue?” “How much tax will I owe?” “What can I deduct?”",
    },
    {
      step: "3",
      title: "Siki acts",
      desc: "Flags discrepancies, estimates tax, posts journal entries — with your approval.",
    },
  ];

  return (
    <main className="min-h-screen bg-stone-100 flex flex-col">
      <RotatedReveal />
      <SiteNav variant="product" subtitle="Impact" links={[
        { href: "/pricing", label: "Pricing" },
        { href: "/books?flow=check", label: "Try sample books" },
      ]} />

      <div className="flex-1 w-full max-w-4xl mx-auto px-5 py-8">
        <header className="mb-7 fade-in-up">
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold text-stone-900">Siki&apos;s Impact</h2>
            {data && !isSandbox && <ModeBadge isDemo={isDemo} />}
            {data && isSandbox && (
              <DemoBadge
                size="sm"
                label={`${String(data?.mode).replace(/-sandbox$/, "").replace(/^./, (c) => c.toUpperCase())} sandbox · read-only`}
              />
            )}
          </div>
          <p className="text-sm text-stone-500 mt-1">
            {isSandbox
              ? "These numbers are from a read-only sandbox — connect your accounting platform to see your real impact."
              : isDemo
                ? "These numbers are from demo data — connect your Xero to see your real impact."
                : "Live numbers from Sikizana's Xero reconciliation engine. Updated every 30 seconds."}
          </p>
        </header>

        {error && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-5 text-xs text-amber-800">
            Could not reach the backend right now — showing the last values.
          </div>
        )}

        <OverdueTrendChart
          snapshots={data?.snapshots ?? []}
          isDemo={isDemo}
          currentOverdue={moneyFound}
        />

        <section className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
          <StatCard
            label="Money Found"
            sub={`${overdueCount} overdue invoice${overdueCount === 1 ? "" : "s"} identified`}
          >
            <AnimatedNumber prefix="£" value={Math.round(moneyFound)} />
          </StatCard>
          <StatCard label="Issues Caught" sub="Discrepancies flagged before accountant">
            <AnimatedNumber value={discrepanciesFound} />
          </StatCard>
          <StatCard
            label="Money Recovered"
            sub={`${recoveredCount} invoice${recoveredCount === 1 ? "" : "s"} paid after a chase`}
          >
            <AnimatedNumber prefix="£" value={Math.round(recovered)} />
          </StatCard>
          <StatCard
            label="Thumbs-up Rate"
            sub={`${feedbackUp} of ${feedbackTotal} responses`}
          >
            {feedbackRatio !== null ? `${feedbackRatio}%` : "—"}
          </StatCard>
        </section>

        <section className="mb-8">
          <h3 className="text-sm font-bold text-stone-900 mb-3">How it works</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {steps.map((item, i) => (
              <div
                key={item.step}
                className="bg-white border border-stone-200 rounded-xl p-4 shadow-sm fade-in-up"
                style={{ animationDelay: `${i * 80}ms` }}
              >
                <div className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-sky-600 text-white text-xs font-bold mb-2.5">
                  {item.step}
                </div>
                <div className="text-sm font-semibold text-stone-800 mb-1">{item.title}</div>
                <div className="text-xs text-stone-500 leading-relaxed">{item.desc}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-sky-50 border border-sky-200 rounded-2xl p-6 text-center fade-in-up">
          <h3 className="text-base font-bold text-stone-900 mb-1">See it in action</h3>
          <p className="text-sm text-stone-600 mb-4">
            Connect your Xero org — free — and see what Siki finds in your books.
          </p>
          <Link
            href="/books"
            className="inline-block text-sm font-semibold px-5 py-2.5 rounded-lg bg-sky-600 text-white hover:bg-sky-700 btn-press transition-colors"
          >
            Open Sikizana →
          </Link>
        </section>
      </div>

      <footer className="text-center py-3">
        <p className="text-xs text-stone-400">
          Sikizana · AI finance assistant for Xero · Human-in-the-loop by design
        </p>
      </footer>
    </main>
  );
}
