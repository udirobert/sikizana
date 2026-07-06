"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { SikiMascot, type MascotMood } from "@/components/SikiMascot";
import { useImpactMetrics } from "@/hooks/useRevenue";
import { useMe } from "@/hooks/useMe";
import { PlanBadge } from "@/components/PlanBadge";

/**
 * Public landing page — mascot-driven, English-only, polished.
 * Siki the Owl greets visitors, the hero is bold and clear,
 * and the whole page feels alive without being cluttered.
 */
export default function LandingPage() {
  const metrics = useImpactMetrics(60_000);
  const { me } = useMe();
  const moneyFound = metrics?.money_found ?? 0;
  const discrepanciesFound = metrics?.discrepancies_found ?? 0;

  // Cycle the mascot mood for a living feel
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
      {/* ── Nav ─────────────────────────────────────────────────────── */}
      <nav className="bg-white border-b border-stone-200 px-4 py-3 sticky top-0 z-50 backdrop-blur-md bg-white/90">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 group">
            <SikiMascot size={32} mood="idle" />
            <span className="text-base font-bold text-stone-900 tracking-tight group-hover:text-sky-600 transition-colors">
              SIKIZANA
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <Link
              href="/books"
              className="bg-sky-600 hover:bg-sky-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition btn-press"
            >
              Try Demo
            </Link>
            <Link
              href="/pricing"
              className="bg-white hover:bg-stone-50 text-stone-700 text-sm font-medium px-4 py-2 rounded-lg transition border border-stone-200 btn-press"
            >
              Pricing
            </Link>
            <Link
              href="/account"
              className="bg-white hover:bg-stone-50 text-stone-700 text-sm font-medium px-4 py-2 rounded-lg transition border border-stone-200 btn-press flex items-center gap-1.5"
            >
              {me?.authenticated ? (
                <>
                  Account <PlanBadge plan={me.plan} />
                </>
              ) : (
                "Sign in"
              )}
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ────────────────────────────────────────────────────── */}
      <section className="relative max-w-5xl mx-auto px-6 pt-20 pb-24 text-center">
        {/* Decorative gradient blob behind mascot */}
        <div className="absolute top-8 left-1/2 -translate-x-1/2 w-72 h-72 bg-gradient-to-br from-sky-200/40 to-emerald-200/30 rounded-full blur-3xl pointer-events-none" />

        {/* Mascot greeting */}
        <div className="relative inline-block mb-6 fade-in-up">
          <SikiMascot size={140} mood={mood} />
          {/* Speech bubble */}
          <div className="absolute -right-20 top-2 bg-white rounded-2xl shadow-lg px-4 py-2 border border-stone-100 hidden sm:block">
            <p className="text-xs font-medium text-stone-700 whitespace-nowrap">
              {mood === "wave" ? "Hi! I'm Siki." : mood === "look" ? "Let me check your books..." : "I watch your books!"}
            </p>
            {/* Bubble tail */}
            <div className="absolute -left-1.5 top-4 w-3 h-3 bg-white border-l border-b border-stone-100 rotate-45" />
          </div>
        </div>

        <div className="inline-block bg-sky-50 text-sky-700 text-[11px] font-semibold uppercase tracking-wide px-3 py-1 rounded-full mb-5 fade-in-up" style={{ animationDelay: "100ms" }}>
          Get Paid Faster · Works with Xero
        </div>

        <h1 className="text-4xl sm:text-6xl font-bold text-stone-900 leading-[1.1] tracking-tight fade-in-up" style={{ animationDelay: "200ms" }}>
          Stop money slipping away.
          <br />
          <span className="bg-gradient-to-r from-sky-600 to-blue-700 bg-clip-text text-transparent">
            Get your invoices paid.
          </span>
        </h1>

        <p className="mt-6 text-lg text-stone-600 max-w-xl mx-auto fade-in-up" style={{ animationDelay: "300ms" }}>
          Siki reads your Xero data, shows exactly who owes you what and for how long,
          tells you what&apos;s normal for your industry, and drafts the chasing emails that
          actually get you paid — plus tax estimates and a plain-English P&amp;L on the side.
        </p>

        <div className="mt-8 flex items-center justify-center gap-3 flex-wrap fade-in-up" style={{ animationDelay: "400ms" }}>
          <Link
            href="/books"
            className="bg-sky-600 hover:bg-sky-700 text-white font-semibold px-7 py-3.5 rounded-xl transition shadow-lg shadow-sky-600/20 btn-press text-base"
          >
            Try with Sample Data
          </Link>
          <Link
            href="/books?connect=1"
            className="bg-white hover:bg-stone-50 text-stone-700 font-medium px-7 py-3.5 rounded-xl transition border border-stone-200 btn-press text-base"
          >
            Connect My Xero
          </Link>
        </div>
        <p className="mt-3 text-xs text-stone-500 fade-in-up" style={{ animationDelay: "500ms" }}>
          Try the demo instantly — no signup needed. Or connect your Xero to see your real numbers.
        </p>
      </section>

      {/* ── Trust signals ───────────────────────────────────────────── */}
      {/* Only shown when the impact fetch returns real (non-demo) numbers.
          In demo mode, showing "£1,250 Money Found" is misleading — it's
          sample data, not real user impact. */}
      {(moneyFound > 0 || discrepanciesFound > 0) && metrics?.mode !== "demo" && (
        <section className="max-w-4xl mx-auto px-6 pb-16">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              {
                label: "Money Found",
                value: `£${moneyFound.toFixed(0)}`,
                sub: "Overdue invoices identified",
              },
              {
                label: "Issues Caught",
                value: String(discrepanciesFound || 0),
                sub: "Discrepancies flagged before accountant",
              },
              {
                label: "Response Time",
                value: "< 30s",
                sub: "From question to answer",
              },
            ].map((stat, i) => (
              <div
                key={stat.label}
                className="bg-white border border-stone-200 rounded-2xl p-5 fade-in-up hover:shadow-md transition-shadow"
                style={{ animationDelay: `${500 + i * 80}ms` }}
              >
                <div className="text-[10px] uppercase tracking-wide text-stone-500 font-semibold">
                  {stat.label}
                </div>
                <div className="text-2xl font-bold text-stone-900 mt-1">
                  {stat.value}
                </div>
                <div className="text-xs text-stone-500 mt-1">
                  {stat.sub}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── How it works ────────────────────────────────────────────── */}
      <section className="max-w-4xl mx-auto px-6 pb-20">
        <h2 className="text-2xl font-bold text-stone-900 text-center mb-2">
          How Siki works
        </h2>
        <p className="text-sm text-stone-500 text-center mb-10">
          Three steps. No accounting degree required.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            {
              step: "1",
              icon: "ask",
              title: "Ask in plain English",
              body: "Type a question like \"What's my net profit?\" or \"Who owes me money?\" No accounting jargon needed.",
            },
            {
              step: "2",
              icon: "analyze",
              title: "Siki investigates",
              body: "The AI reads your live Xero data — transactions, invoices, bank feeds — and traces every number back to its source.",
            },
            {
              step: "3",
              icon: "approve",
              title: "You approve",
              body: "Siki drafts the chasing email or the bookkeeping fix. You review and approve — nothing is sent or posted without you.",
            },
          ].map((item, i) => (
            <div
              key={item.step}
              className="bg-white border border-stone-200 rounded-2xl p-6 fade-in-up hover:shadow-md transition-shadow group"
              style={{ animationDelay: `${i * 100}ms` }}
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 bg-sky-50 text-sky-600 rounded-xl flex items-center justify-center font-bold text-sm group-hover:bg-sky-100 transition-colors">
                  {item.step}
                </div>
                {/* Mini icon */}
                <svg className="w-5 h-5 text-stone-300 group-hover:text-sky-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  {item.icon === "ask" && <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 3v-3z" />}
                  {item.icon === "analyze" && <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />}
                  {item.icon === "approve" && <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />}
                </svg>
              </div>
              <h3 className="text-sm font-semibold text-stone-900 mb-1">
                {item.title}
              </h3>
              <p className="text-xs text-stone-600 leading-relaxed">
                {item.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Feature showcase ────────────────────────────────────────── */}
      <section className="bg-white border-y border-stone-200 py-20">
        <div className="max-w-4xl mx-auto px-6">
          <h2 className="text-2xl font-bold text-stone-900 text-center mb-2">
            What Siki can do
          </h2>
          <p className="text-sm text-stone-500 text-center mb-12">
            Everything an accountant would do — in seconds, not days.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {[
              { title: "See who owes you", desc: "An aged receivables view — 30/60/90 days — of every unpaid invoice, so you know who to chase first and how urgently.", emoji: "💰" },
              { title: "Chase with proven tactics", desc: "Escalating reminder emails built on negotiation psychology, with statutory interest and late-payment compensation calculated for you.", emoji: "✉️" },
              { title: "Know what's normal", desc: "Compares your payment times and overdue rate against typical UK ranges for your sector — so you know if you're being taken advantage of.", emoji: "📊" },
              { title: "Spot bad customers", desc: "Scores every customer's payment reliability (red/amber/green) and flags the ones who cost more to chase than they're worth.", emoji: "🚦" },
              { title: "Estimate your tax bill", desc: "Calculates your UK Corporation Tax, flags non-deductible expenses — and reminds you that you pay tax on invoiced money even before it's paid.", emoji: "🏛️" },
              { title: "Explain your P&L", desc: "Translates your profit & loss into plain English. No more guessing what the numbers mean.", emoji: "📈" },
            ].map((feat, i) => (
              <div
                key={feat.title}
                className="flex gap-4 p-5 rounded-2xl border border-stone-100 hover:border-sky-200 hover:bg-sky-50/30 transition-all fade-in-up"
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <div className="text-2xl shrink-0">{feat.emoji}</div>
                <div>
                  <h3 className="text-sm font-semibold text-stone-900">{feat.title}</h3>
                  <p className="text-xs text-stone-600 mt-1 leading-relaxed">{feat.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ─────────────────────────────────────────────────────── */}
      <section className="max-w-3xl mx-auto px-6 py-20 text-center">
        <div className="relative bg-gradient-to-br from-sky-600 to-blue-700 rounded-3xl p-12 overflow-hidden">
          {/* Decorative mascot in corner */}
          <div className="absolute -right-4 -bottom-4 opacity-20">
            <SikiMascot size={120} mood="celebrate" />
          </div>
          <h2 className="text-3xl font-bold text-white mb-3 relative">
            Ready to get paid?
          </h2>
          <p className="text-sky-100 mb-8 relative">
            Connect your Xero account and see who owes you what — aged by 30/60/90 days,
            with a chasing plan for each debtor — in under 30 seconds.
          </p>
          <Link
            href="/books?connect=1"
            className="inline-block bg-white text-sky-700 font-semibold px-8 py-3.5 rounded-xl transition hover:bg-stone-50 btn-press text-base relative shadow-lg"
          >
            Connect Your Xero
          </Link>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────── */}
      <footer className="border-t border-stone-200 bg-white">
        <div className="max-w-6xl mx-auto px-6 py-8">
          <div className="flex items-center justify-center gap-2 mb-4">
            <SikiMascot size={28} mood="idle" />
            <span className="text-sm font-bold text-stone-900">SIKIZANA</span>
          </div>
          <div className="flex items-center justify-center gap-4 mb-3">
            <Link href="/privacy" className="text-xs text-stone-500 hover:text-stone-700 transition-colors">
              Privacy Policy
            </Link>
            <Link href="/terms" className="text-xs text-stone-500 hover:text-stone-700 transition-colors">
              Terms of Service
            </Link>
            <Link href="/pricing" className="text-xs text-stone-500 hover:text-stone-700 transition-colors">
              Pricing
            </Link>
          </div>
          <p className="text-[11px] text-stone-400 text-center">
            Built for the Xero App &amp; Agent Hackathon · Encode Club · 2026
          </p>
          <p className="text-[10px] text-stone-300 text-center mt-1">
            AI-powered bookkeeping · Human-in-the-loop by design · Your data stays yours
          </p>
        </div>
      </footer>
    </main>
  );
}
