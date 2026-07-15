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

      {/* ── Hero ────────────────────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-6 pt-14 pb-16">
        <div className="grid grid-cols-1 lg:grid-cols-[1.02fr_0.98fr] gap-10 items-center">
          <div className="text-left">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-700 fade-in-up">
              Read-only Xero checks
            </div>

            <h1 className="mt-5 text-4xl sm:text-6xl font-bold text-stone-950 leading-[1.03] tracking-tight fade-in-up fade-in-up-delay-1">
              Find money hiding in your Xero books.
            </h1>

            <p className="mt-5 text-lg text-stone-600 max-w-xl leading-relaxed fade-in-up fade-in-up-delay-2">
              Sikizana checks invoices, payments, receivables, and P&amp;L movements for the
              things busy owners miss: duplicate supplier payments, overdue customers, tax flags,
              and numbers that need plain-English explanation.
            </p>

            <div className="mt-7 flex flex-col sm:flex-row gap-3 fade-in-up fade-in-up-delay-3">
              <Link
                href="/books?flow=check"
                className="inline-flex items-center justify-center rounded-xl bg-stone-950 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-stone-900/15 transition hover:bg-stone-800 btn-press"
              >
                Try sample books
              </Link>
              <Link
                href="/books?flow=check&connect=1"
                className="inline-flex items-center justify-center rounded-xl border border-stone-300 bg-white px-6 py-3 text-sm font-semibold text-stone-800 transition hover:bg-stone-100 btn-press"
              >
                Connect Xero
              </Link>
            </div>

            <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-stone-600 fade-in-up fade-in-up-delay-4">
              {["No signup for demo", "No changes without approval", "No data sold or shared"].map((item) => (
                <div key={item} className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  {item}
                </div>
              ))}
            </div>
          </div>

          <div className="fade-in-up fade-in-up-delay-3">
            <div className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-xl shadow-stone-900/8">
              <div className="border-b border-stone-200 bg-stone-950 px-5 py-4 text-white">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-400">
                      This week's Xero check
                    </p>
                    <p className="mt-1 text-lg font-bold">3 recoverable issues found</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <SikiMascot size={38} mood={mood} />
                    <ZanaMascot size={38} mood="look" />
                  </div>
                </div>
              </div>

              <div className="divide-y divide-stone-100">
                {[
                  {
                    label: "Overdue receivables",
                    value: "£4,200",
                    detail: "Three customers are 30+ days late. Chase drafts are ready.",
                    tone: "bg-rose-50 text-rose-700 border-rose-100",
                    evidence: "ageing",
                  },
                  {
                    label: "Possible duplicate payment",
                    value: "£680",
                    detail: "Same supplier, same bill, two payments one day apart.",
                    tone: "bg-amber-50 text-amber-700 border-amber-100",
                    evidence: "duplicate",
                  },
                  {
                    label: "Books explained",
                    value: "Ready to review",
                    detail: "P&L, cash position, sector benchmarks, and tax flags summarized.",
                    tone: "bg-sky-50 text-sky-700 border-sky-100",
                    evidence: "summary",
                  },
                ].map((item) => (
                  <div key={item.label} className="p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm font-semibold text-stone-950">{item.label}</p>
                        <p className="mt-1 text-xs leading-relaxed text-stone-500">{item.detail}</p>
                      </div>
                      <div className={`rounded-full border px-3 py-1 text-xs font-bold ${item.tone}`}>
                        {item.value}
                      </div>
                    </div>
                    {item.evidence === "ageing" && (
                      <div className="mt-4 grid grid-cols-3 gap-2">
                        {[
                          ["Aster Studio", "45d", "£1,800"],
                          ["Hinton & Co", "38d", "£1,400"],
                          ["North Works", "31d", "£1,000"],
                        ].map(([customer, days, amount]) => (
                          <div key={customer} className="border-l-2 border-rose-300 pl-2">
                            <p className="truncate text-[10px] font-medium text-stone-600">{customer}</p>
                            <p className="mt-0.5 text-xs font-bold text-stone-900">{amount}</p>
                            <p className="text-[10px] text-rose-700">{days} overdue</p>
                          </div>
                        ))}
                      </div>
                    )}

                    {item.evidence === "duplicate" && (
                      <div className="mt-4 overflow-hidden rounded-lg border border-amber-100 bg-amber-50/40 text-[11px]">
                        {[
                          ["13 Jun", "Cobalt Electrical", "-£680"],
                          ["14 Jun", "Cobalt Electrical", "-£680"],
                        ].map(([date, supplier, amount], index) => (
                          <div
                            key={date}
                            className={`grid grid-cols-[3.5rem_1fr_auto] items-center gap-2 px-3 py-2 ${index ? "border-t border-amber-100" : ""}`}
                          >
                            <span className="text-stone-500">{date}</span>
                            <span className="font-medium text-stone-800">{supplier}</span>
                            <span className="font-bold text-amber-800">{amount}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {item.evidence === "summary" && (
                      <div className="mt-4 grid grid-cols-3 divide-x divide-stone-200 border-y border-stone-100 py-2.5">
                        {[
                          ["Cash", "£18.4k", "up £1.2k"],
                          ["Operating profit", "£6.3k", "this month"],
                          ["VAT due", "£2.1k", "in 12 days"],
                        ].map(([metric, amount, context]) => (
                          <div key={metric} className="px-2.5 first:pl-0 last:pr-0">
                            <p className="text-[10px] text-stone-500">{metric}</p>
                            <p className="mt-0.5 text-xs font-bold text-stone-900">{amount}</p>
                            <p className="text-[10px] text-sky-700">{context}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div className="bg-stone-50 px-5 py-4">
                <p className="text-xs leading-relaxed text-stone-500">
                  Every finding links back to source records. Sikizana suggests the next step;
                  you decide what gets sent or changed.
                </p>
              </div>
            </div>
          </div>
        </div>
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

      {/* ── Jobs ────────────────────────────────────────────────────── */}
      <section className="border-y border-stone-200 bg-white">
        <div className="max-w-6xl mx-auto px-6 py-6">
          <p className="mb-4 text-[11px] font-semibold uppercase tracking-wide text-stone-500">
            Start where the money is stuck
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 md:divide-x md:divide-stone-200">
          {[
            {
              title: "Recover overdue invoices",
              body: "See who owes you, how long they have owed it, and the exact chase email to send next.",
              href: "/books?flow=check&persona=zana",
            },
            {
              title: "Catch duplicate payments",
              body: "Review supplier bills and payments for duplicate amounts, dates, and references before cash disappears.",
              href: "/books?flow=check&persona=siki",
            },
            {
              title: "Understand your numbers",
              body: "Turn P&L, balance sheet, tax estimates, and sector benchmarks into a clear operating summary.",
              href: "/books?flow=check&persona=siki",
            },
          ].map((job, i) => (
            <Link
              key={job.title}
              href={job.href}
              className="group py-3 md:px-6 first:pl-0 last:pr-0 transition-colors hover:text-sky-700 fade-in-up"
              style={{ animationDelay: `${i * 80}ms` }}
            >
              <p className="text-sm font-bold text-stone-950 transition-colors group-hover:text-sky-700">{job.title}</p>
              <p className="mt-2 text-sm leading-relaxed text-stone-600">{job.body}</p>
              <p className="mt-4 text-xs font-semibold text-stone-400 transition-colors group-hover:text-sky-700">
                Try this workflow →
              </p>
            </Link>
          ))}
          </div>
        </div>
      </section>

      {/* ── Trust ───────────────────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-6 py-16">
        <div className="grid grid-cols-1 gap-6 border-y border-stone-200 py-6 sm:grid-cols-3 sm:divide-x sm:divide-stone-200 sm:gap-0">
          {[
            ["Read-only by default", "Sikizana inspects your books without changing them."],
            ["Evidence before advice", "Every finding links back to invoices, payments, or reports."],
            ["You approve every action", "Nothing sends, posts, or escalates without your say-so."],
          ].map(([title, detail], index) => (
            <div key={title} className={`fade-in-up ${index ? "sm:px-6" : "sm:pr-6"}`} style={{ animationDelay: `${index * 70}ms` }}>
              <p className="text-sm font-bold text-stone-950">{title}</p>
              <p className="mt-1 text-sm leading-relaxed text-stone-600">{detail}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Assistant modes ─────────────────────────────────────────── */}
      <section className="border-y border-stone-200 bg-stone-100">
        <div className="max-w-6xl mx-auto px-6 py-16">
          <div className="mb-8 max-w-xl">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">One Xero connection, two operating modes</p>
            <h2 className="mt-2 text-2xl font-bold text-stone-900">Decide with context. Collect with conviction.</h2>
          </div>
          <div className="grid grid-cols-1 border-y border-stone-300 md:grid-cols-2 md:divide-x md:divide-stone-300">
          {personaPaths.map((path) => (
            <Link
              key={path.persona}
              href={path.demoHref}
              className={`group block py-6 first:md:pr-8 last:md:pl-8 fade-in-up ${path.persona === "siki" ? "hover:text-sky-700" : "hover:text-rose-700"}`}
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
              <p className="mt-4 text-xs font-semibold text-stone-400 transition-colors group-hover:text-current">Open {path.name} →</p>
            </Link>
          ))}
          </div>
        </div>
      </section>

      {/* ── Feature showcase ────────────────────────────────────────── */}
      <section className="bg-white py-20">
        <div className="max-w-5xl mx-auto px-6">
          <div className="grid grid-cols-1 gap-8 md:grid-cols-[0.75fr_1.25fr] md:items-end">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">Your financial watchlist</p>
              <h2 className="mt-2 text-3xl font-bold text-stone-900">The checks that compound.</h2>
            </div>
            <p className="text-sm leading-relaxed text-stone-600">The recurring finance checks most teams do manually, rushed, or too late. Sikizana keeps the routine work visible so small issues do not become expensive surprises.</p>
          </div>
          <div className="mt-10 border-y border-stone-200">
            {[
              { title: "Overdue invoices", desc: "Aged 30/60/90 day receivables, ranked by who needs attention first.", mark: "AR", group: "Get paid" },
              { title: "Chase drafts", desc: "Escalating email drafts with statutory interest and compensation included where relevant.", mark: "CX", group: "Get paid" },
              { title: "Duplicate supplier payments", desc: "Possible duplicate bills and payments with source evidence for review.", mark: "AP", group: "Protect spend" },
              { title: "Customer risk", desc: "Payment reliability and cost-to-serve signals so repeat late payers stand out.", mark: "R", group: "Protect spend" },
              { title: "Tax flags", desc: "Corporation Tax estimates and non-deductible expense checks in plain English.", mark: "T", group: "Know your position" },
              { title: "P&L explanation", desc: "A readable summary of what changed, what matters, and what to inspect next.", mark: "PL", group: "Know your position" },
            ].map((feat, i) => (
              <div
                key={feat.title}
                className="group grid grid-cols-[3.5rem_1fr] gap-3 border-b border-stone-100 py-4 last:border-0 sm:grid-cols-[8rem_2.5rem_1fr] sm:items-center sm:gap-5 fade-in-up"
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <p className="pt-1 text-[10px] font-semibold uppercase tracking-wide text-stone-400 sm:pt-0">{feat.group}</p>
                <p className="hidden text-[11px] font-bold text-stone-400 sm:block">{feat.mark}</p>
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-stone-900 transition-colors group-hover:text-sky-700">{feat.title}</h3>
                  <p className="mt-1 text-xs leading-relaxed text-stone-600">{feat.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ─────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-stone-950 px-6 py-20 text-center">
        <div className="absolute right-8 bottom-0 flex gap-1 opacity-15">
            <SikiMascot size={100} mood="celebrate" />
            <ZanaMascot size={100} mood="look" />
        </div>
        <div className="relative mx-auto max-w-3xl">
          <h2 className="text-3xl font-bold text-white mb-3">
            Run the check on your own books.
          </h2>
          <p className="text-stone-300 mb-8 max-w-lg mx-auto">
            Start with sample data, then connect Xero when you want Sikizana to inspect real
            invoices, payments, receivables, and reports.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href="/books?flow=check"
              className="inline-block bg-sky-600 hover:bg-sky-500 text-white font-semibold px-7 py-3 rounded-xl transition btn-press text-base shadow-lg"
            >
              Try sample books
            </Link>
            <Link
              href="/books?flow=check&connect=1"
              className="inline-block bg-rose-600 hover:bg-rose-500 text-white font-semibold px-7 py-3 rounded-xl transition btn-press text-base shadow-lg"
            >
              Connect Xero
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
            <Link href="/tax" className="text-xs text-stone-500 hover:text-stone-700 transition-colors">
              Tax Assistant
            </Link>
            <Link href="/pricing" className="text-xs text-stone-500 hover:text-stone-700 transition-colors">
              Pricing
            </Link>
          </div>
          <p className="text-[11px] text-stone-400 text-center">
            AI finance assistant for Xero. Human-in-the-loop by design.
          </p>
        </div>
      </footer>
    </main>
  );
}
