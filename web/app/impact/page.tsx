"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { endpoints, type ImpactMetrics } from "@/lib/api";
import { SikiMascot } from "@/components/SikiMascot";
import { RotatedReveal } from "@/components/RotatedReveal";
import { AnimatedNumber } from "@/components/AnimatedNumber";
import { ModeBadge } from "@/components/ModeBadge";
import { ImpactHeroChart } from "@/components/ImpactHeroChart";

/**
 * Impact — aggregate social proof: money found, issues caught, tax
 * savings, feedback. Styled to the same stone/sky system as the rest of
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
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    const id = setInterval(() => void load(), 30_000);
    return () => clearInterval(id);
  }, []);

  const moneyFound = data?.money_found ?? 0;
  const overdueCount = data?.overdue_count ?? 0;
  const discrepanciesFound = data?.discrepancies_found ?? 0;
  const taxSavings = data?.estimated_tax_savings ?? 0;
  const feedbackTotal = data?.feedback?.total ?? 0;
  const feedbackUp = data?.feedback?.up ?? 0;
  const feedbackRatio =
    feedbackTotal > 0 ? Math.round((feedbackUp / feedbackTotal) * 100) : null;
  const isDemo = data?.mode === "demo";

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
      <nav className="bg-white border-b border-stone-200 px-4 py-3">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-2">
          <Link href="/" aria-label="Sikizana home" className="flex items-center gap-3 group">
            <SikiMascot size={36} mood="idle" />
            <div>
              <h1 className="text-base font-bold text-stone-900 leading-none transition-colors group-hover:text-sky-600">SIKIZANA</h1>
              <p className="text-[10px] text-stone-500 leading-none mt-0.5">Impact</p>
            </div>
          </Link>
          <div className="flex items-center gap-3">
            <Link
              href="/pricing"
              className="text-xs text-stone-500 hover:text-stone-700 px-2 py-1 rounded hover:bg-stone-100 btn-press"
            >
              Pricing
            </Link>
            <Link
              href="/books"
              className="text-xs text-stone-500 hover:text-stone-700 px-2 py-1 rounded hover:bg-stone-100 btn-press"
            >
              Open Sikizana →
            </Link>
          </div>
        </div>
      </nav>

      <div className="flex-1 w-full max-w-4xl mx-auto px-5 py-8">
        <header className="mb-7 fade-in-up">
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold text-stone-900">Siki&apos;s Impact</h2>
            {data && <ModeBadge isDemo={isDemo} />}
          </div>
          <p className="text-sm text-stone-500 mt-1">
            {isDemo
              ? "These numbers are from demo data — connect your Xero to see your real impact."
              : "Live numbers from Sikizana's Xero reconciliation engine. Updated every 30 seconds."}
          </p>
        </header>

        {error && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-5 text-xs text-amber-800">
            Could not reach the backend right now — showing the last values.
          </div>
        )}

        <ImpactHeroChart
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
          <StatCard label="Est. Tax Savings" sub="From deductible expenses identified">
            <AnimatedNumber prefix="£" value={Math.round(taxSavings)} />
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

function StatCard({
  label,
  sub,
  children,
}: {
  label: string;
  sub?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-stone-200 rounded-xl p-4 shadow-sm">
      <div className="text-[10px] uppercase tracking-wide text-stone-500 font-semibold mb-1">
        {label}
      </div>
      <div className="text-2xl font-bold text-stone-900">{children}</div>
      {sub && <div className="text-[11px] text-stone-500 mt-1">{sub}</div>}
    </div>
  );
}
