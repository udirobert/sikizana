"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { SikiMascot, ZanaMascot, type MascotMood } from "@/components/SikiMascot";
import { useImpactMetrics } from "@/hooks/useRevenue";
import { useMe } from "@/hooks/useMe";
import { PlanBadge } from "@/components/PlanBadge";
import { getLandingPersonaPaths } from "@/lib/persona-theme";

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
  const personaPaths = getLandingPersonaPaths();

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

      {/* ── Hero — dual persona paths ───────────────────────────────── */}
      <section className="relative max-w-5xl mx-auto px-6 pt-16 pb-20 text-center">
        <div className="absolute top-8 left-1/4 w-48 h-48 bg-sky-200/30 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute top-16 right-1/4 w-48 h-48 bg-rose-200/25 rounded-full blur-3xl pointer-events-none" />

        <div className="relative flex items-center justify-center gap-3 mb-6 fade-in-up">
          <SikiMascot size={56} mood={mood} />
          <span className="text-stone-300 text-sm font-medium">+</span>
          <ZanaMascot size={56} mood="look" />
        </div>

        <div className="inline-block bg-stone-100 text-stone-600 text-[11px] font-semibold uppercase tracking-wide px-3 py-1 rounded-full mb-5 fade-in-up fade-in-up-delay-1">
          Two owls · One Xero connection · Your money
        </div>

        <h1 className="text-4xl sm:text-5xl font-bold text-stone-900 leading-[1.1] tracking-tight fade-in-up fade-in-up-delay-2">
          Stop money slipping away.
          <br />
          <span className="bg-gradient-to-r from-sky-600 via-stone-700 to-rose-600 bg-clip-text text-transparent">
            Explain it or chase it.
          </span>
        </h1>

        <p className="mt-5 text-lg text-stone-600 max-w-2xl mx-auto fade-in-up fade-in-up-delay-3">
          Sikizana reads your Xero data with two AI personas — Siki explains your books in plain
          English; Zana drafts the chasing emails and escalates until overdue invoices get paid.
        </p>

        <div className="mt-10 grid grid-cols-1 md:grid-cols-2 gap-5 max-w-3xl mx-auto text-left fade-in-up fade-in-up-delay-4">
          {personaPaths.map((path, i) => (
            <div
              key={path.persona}
              className={`bg-white border-2 rounded-2xl p-6 transition-shadow ${path.cardClass} fade-in-up`}
              style={{ animationDelay: `${400 + i * 80}ms` }}
            >
              <div className="flex items-center gap-3 mb-4">
                {path.persona === "siki" ? (
                  <SikiMascot size={52} mood="wave" />
                ) : (
                  <ZanaMascot size={52} mood="look" />
                )}
                <div>
                  <h2 className="text-lg font-bold text-stone-900">{path.headline}</h2>
                  <p className={`text-[10px] font-bold uppercase tracking-wide ${path.badgeClass.split(" ")[1]}`}>
                    {path.name} · {path.role}
                  </p>
                </div>
              </div>
              <p className="text-sm text-stone-600 leading-relaxed mb-4">{path.description}</p>
              <ul className="space-y-1.5 mb-4">
                {path.bullets.map((b) => (
                  <li key={b} className="text-xs text-stone-500 flex items-start gap-2">
                    <span className={`mt-0.5 shrink-0 ${path.persona === "zana" ? "text-rose-400" : "text-sky-400"}`}>•</span>
                    {b}
                  </li>
                ))}
              </ul>
              <p className="text-[11px] text-stone-400 italic mb-4 leading-relaxed">
                &quot;{path.quote}&quot;
              </p>
              <div className="flex flex-col sm:flex-row gap-2">
                <Link
                  href={path.demoHref}
                  className={`flex-1 text-center font-semibold px-4 py-2.5 rounded-xl transition shadow-lg btn-press text-sm ${path.btnClass}`}
                >
                  {path.cta} — demo
                </Link>
                <Link
                  href={path.connectHref}
                  className="flex-1 text-center font-medium px-4 py-2.5 rounded-xl transition border border-stone-200 bg-stone-50 hover:bg-stone-100 text-stone-700 btn-press text-sm"
                >
                  Connect Xero
                </Link>
              </div>
            </div>
          ))}
        </div>

        <p className="mt-6 text-xs text-stone-500 fade-in-up fade-in-up-delay-5">
          Try sample data instantly — no signup. Or connect Xero to see your real numbers in under 30 seconds.
        </p>
        <p className="mt-1.5 text-xs text-stone-400 fade-in-up fade-in-up-delay-6">
          Read-only until you approve an action · never sold or shared ·{" "}
          <Link href="/security" className="underline hover:text-stone-600 transition-colors">
            how your data is protected
          </Link>
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
          How it works
        </h2>
        <p className="text-sm text-stone-500 text-center mb-10">
          Pick your owl. Switch any time. Nothing sends without your OK.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            {
              step: "1",
              icon: "ask",
              title: "Choose Siki or Zana",
              body: "Start with the explainer or the enforcer — the landing page remembers your choice. Toggle freely in the chat.",
            },
            {
              step: "2",
              icon: "analyze",
              title: "They read your Xero",
              body: "Live invoices, bank feeds, and P&L — traced back to source. Daily snapshots build your trend charts over time.",
            },
            {
              step: "3",
              icon: "approve",
              title: "You approve every action",
              body: "Chase emails, journal fixes, and auto-escalation only run after you click — human-in-the-loop by design.",
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

      {/* ── Meet the duo (compact) ──────────────────────────────────── */}
      <section className="max-w-4xl mx-auto px-6 pb-20">
        <h2 className="text-2xl font-bold text-stone-900 text-center mb-2">
          Good cop, firm cop
        </h2>
        <p className="text-sm text-stone-500 text-center mb-8">
          Same Xero data. Different voice. One product.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {personaPaths.map((path) => (
            <Link
              key={path.persona}
              href={path.demoHref}
              className={`block bg-white border rounded-2xl p-5 fade-in-up hover:shadow-md transition-shadow ${path.cardClass}`}
            >
              <div className="flex items-center gap-3 mb-2">
                {path.persona === "siki" ? (
                  <SikiMascot size={48} mood="wave" />
                ) : (
                  <ZanaMascot size={48} mood="look" />
                )}
                <div>
                  <h3 className="text-base font-bold text-stone-900">{path.name}</h3>
                  <p className={`text-[10px] font-semibold uppercase tracking-wide ${path.badgeClass.split(" ")[1]}`}>
                    {path.role}
                  </p>
                </div>
              </div>
              <p className="text-sm text-stone-600 leading-relaxed">{path.description}</p>
            </Link>
          ))}
        </div>
      </section>

      {/* ── Feature showcase ────────────────────────────────────────── */}
      <section className="bg-white border-y border-stone-200 py-20">
        <div className="max-w-4xl mx-auto px-6">
          <h2 className="text-2xl font-bold text-stone-900 text-center mb-2">
            What Sikizana can do
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
        <div className="relative bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 rounded-3xl p-12 overflow-hidden">
          <div className="absolute -right-2 -bottom-2 opacity-15 flex gap-1">
            <SikiMascot size={100} mood="celebrate" />
            <ZanaMascot size={100} mood="look" />
          </div>
          <h2 className="text-3xl font-bold text-white mb-3 relative">
            Pick your owl. Connect Xero.
          </h2>
          <p className="text-stone-300 mb-8 relative max-w-lg mx-auto">
            See who owes you what — aged 30/60/90 days — with a chasing plan for each debtor,
            or a plain-English read on your P&amp;L and tax.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 relative">
            <Link
              href="/books?persona=siki&connect=1"
              className="inline-block bg-sky-600 hover:bg-sky-500 text-white font-semibold px-7 py-3 rounded-xl transition btn-press text-base shadow-lg"
            >
              Connect with Siki
            </Link>
            <Link
              href="/books?persona=zana&connect=1"
              className="inline-block bg-rose-600 hover:bg-rose-500 text-white font-semibold px-7 py-3 rounded-xl transition btn-press text-base shadow-lg"
            >
              Connect with Zana
            </Link>
          </div>
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
            <Link href="/security" className="text-xs text-stone-500 hover:text-stone-700 transition-colors">
              Security
            </Link>
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
