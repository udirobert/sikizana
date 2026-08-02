"use client";

import Link from "next/link";
import { SikiMascot, ZanaMascot } from "@/components/SikiMascot";
import { SiteNav } from "@/components/SiteNav";

/**
 * Music landing page — the sector beachhead entry point.
 *
 * Opens on the music-specific story (MTD is pushing musicians onto Xero;
 * their money arrives from many fragmented payers) and lands visitors on the
 * music sample books (Ember & Oak Ltd) via ?demo=music. This is a marketing
 * layer: it reuses the same finance-check flow and findings engine as the
 * main landing page, and makes no claim the product can't deliver
 * (docs/MUSIC_LANDING_COPY.md + docs/BRAND.md).
 */
export default function MusicLandingPage() {
  return (
    <main className="min-h-screen bg-stone-50 overflow-x-hidden">
      <SiteNav variant="marketing" />

      {/* ── Hero — split, music-led ─────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-6 pt-14 pb-16">
        <div className="grid grid-cols-1 lg:grid-cols-[1.05fr_0.95fr] gap-12 items-center">
          <div className="text-left">
            <div className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-rose-700 fade-in-up">
              Built for music · Read-only Xero checks
            </div>

            <h1 className="mt-5 text-4xl sm:text-6xl font-bold text-stone-950 leading-[1.03] tracking-tight fade-in-up fade-in-up-delay-1">
              MTD is coming.
              <br />
              Your books still aren&rsquo;t watched.
            </h1>

            <p className="mt-5 text-lg text-stone-600 max-w-xl leading-relaxed fade-in-up fade-in-up-delay-2">
              From April 2026 you&rsquo;ll need digital records. Getting onto Xero is the easy
              part — who notices the backline hire you paid twice, or the festival that&rsquo;s
              gone quiet on a £2,400 invoice? Siki does.
            </p>

            <div className="mt-7 flex flex-col sm:flex-row gap-3 fade-in-up fade-in-up-delay-3">
              <Link
                href="/books?flow=check&demo=music"
                className="inline-flex items-center justify-center rounded-xl bg-stone-950 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-stone-900/15 transition hover:bg-stone-800 btn-press"
              >
                Try the music sample books
              </Link>
              <Link
                href="/books?flow=check&demo=music&connect=1"
                className="inline-flex items-center justify-center rounded-xl border border-stone-300 bg-white px-6 py-3 text-sm font-semibold text-stone-800 transition hover:bg-stone-100 btn-press"
              >
                Connect your Xero
              </Link>
            </div>

            <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-stone-600 fade-in-up fade-in-up-delay-4">
              {[
                "No signup for demo",
                "No changes without approval",
                "No data sold or shared",
              ].map((item) => (
                <div key={item} className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  {item}
                </div>
              ))}
            </div>
          </div>

          {/* Proof card — what Siki actually finds in the sample books */}
          <div className="fade-in-up fade-in-up-delay-3">
            <div className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-xl shadow-stone-900/8">
              <div className="border-b border-stone-200 bg-stone-950 px-5 py-4 text-white">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-400">
                      Ember &amp; Oak Ltd · sample books
                    </p>
                    <p className="mt-1 text-lg font-bold">3 things need a look</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <SikiMascot size={38} mood="look" />
                    <ZanaMascot size={38} mood="idle" />
                  </div>
                </div>
              </div>

              <div className="divide-y divide-stone-100">
                {[
                  {
                    label: "Late festival invoice",
                    value: "£2,400",
                    detail: "Field Day Festival, 30 days past due. A chase draft is ready.",
                    tone: "bg-rose-50 text-rose-700 border-rose-100",
                    evidence: "ageing",
                  },
                  {
                    label: "Possible duplicate payment",
                    value: "£680",
                    detail: "Same backline hire, same reference, two BACS payments a day apart.",
                    tone: "bg-amber-50 text-amber-700 border-amber-100",
                    evidence: "duplicate",
                  },
                  {
                    label: "Books explained",
                    value: "Ready to review",
                    detail: "P&L, cash position, and a plain-English read on what's normal for music.",
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
                          ["Field Day Festival", "30d", "£2,400"],
                          ["Roundhouse", "due now", "£1,850"],
                          ["Roundhouse", "in 20d", "£1,200"],
                        ].map(([customer, days, amount]) => (
                          <div key={customer + days} className="border-l-2 border-rose-300 pl-2">
                            <p className="truncate text-[10px] font-medium text-stone-600">{customer}</p>
                            <p className="mt-0.5 text-xs font-bold text-stone-900">{amount}</p>
                            <p className="text-[10px] text-rose-700">{days}</p>
                          </div>
                        ))}
                      </div>
                    )}

                    {item.evidence === "duplicate" && (
                      <div className="mt-4 overflow-hidden rounded-lg border border-amber-100 bg-amber-50/40 text-[11px]">
                        {[
                          ["24 Jun", "SoundStage Backline", "-£680"],
                          ["25 Jun", "SoundStage Backline", "-£680"],
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
                          ["Revenue", "£14.2k", "last 90 days"],
                          ["Net profit", "£1.1k", "thin but positive"],
                          ["Owed to you", "£2,400", "Field Day"],
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
                  Every finding links back to source records. This is sample data — connect
                  your Xero to run it on your own books.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── The why — fragmented payers ─────────────────────────────── */}
      <section className="border-y border-stone-200 bg-white">
        <div className="max-w-6xl mx-auto px-6 py-16">
          <div className="grid grid-cols-1 gap-8 md:grid-cols-[0.8fr_1.2fr] md:items-end">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">
                Why music, why now
              </p>
              <h2 className="mt-2 text-3xl font-bold text-stone-900">
                Your money comes from everywhere. We watch all of it.
              </h2>
            </div>
            <p className="text-sm leading-relaxed text-stone-600">
              Session fees, royalties, merch, door splits — your income arrives from a dozen
              payers into one set of books. That&apos;s exactly where money goes missing. Siki
              watches the same Xero data your accountant uses, between tax returns.
            </p>
          </div>
        </div>
      </section>

      {/* ── The duo — Siki & Zana for music ─────────────────────────── */}
      <section className="border-b border-stone-300 bg-stone-100" id="demo">
        <div className="max-w-6xl mx-auto px-6 py-16">
          <div className="mb-8 max-w-xl">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">
              One Xero connection, two operating modes
            </p>
            <h2 className="mt-2 text-2xl font-bold text-stone-900">
              Siki watches. Zana chases.
            </h2>
          </div>

          <div className="grid grid-cols-1 border-y border-stone-300 md:grid-cols-2 md:divide-x md:divide-stone-300">
            <Link
              href="/books?flow=check&persona=siki&demo=music"
              className="group block py-6 first:md:pr-8 last:md:pl-8 fade-in-up hover:text-sky-700"
            >
              <div className="flex items-center gap-3 mb-2">
                <SikiMascot size={48} mood="wave" />
                <div>
                  <h3 className="text-base font-bold text-stone-900">Siki — watch my money</h3>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-sky-700">
                    The Explainer
                  </p>
                </div>
              </div>
              <p className="text-sm text-stone-600 leading-relaxed">
                She reads your Xero for the quiet leaks that only surface at tax time: a session
                fee paid twice, a supplier&apos;s bank details suddenly different, a first payment to
                somewhere new. She shows you the evidence and the amount at risk — and flags it
                as something to check, never as fraud.
              </p>
              <p className="mt-4 text-xs font-semibold text-stone-400 transition-colors group-hover:text-current">
                Open Siki →
              </p>
            </Link>

            <Link
              href="/books?flow=check&persona=zana&demo=music"
              className="group block py-6 first:md:pr-8 last:md:pl-8 fade-in-up hover:text-rose-700"
            >
              <div className="flex items-center gap-3 mb-2">
                <ZanaMascot size={48} mood="look" />
                <div>
                  <h3 className="text-base font-bold text-stone-900">Zana — chase what&apos;s owed</h3>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-rose-700">
                    The Enforcer
                  </p>
                </div>
              </div>
              <p className="text-sm text-stone-600 leading-relaxed">
                When a promoter, label, or venue is late, she works your aged receivables and
                drafts the reminder — negotiation-tactic emails up to the formal Letter Before
                Action, with statutory interest built in. In your business&apos;s name, and only when
                you approve.
              </p>
              <p className="mt-4 text-xs font-semibold text-stone-400 transition-colors group-hover:text-current">
                Open Zana →
              </p>
            </Link>
          </div>

          <p className="mt-6 text-sm font-medium text-stone-600">
            Siki can&rsquo;t change anything, Zana can&rsquo;t chase anyone — without you.
          </p>
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
            Start with the Ember &amp; Oak sample books, then connect your Xero when you want
            Sikizana to inspect your real gigs, royalties, bills, and receivables.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href="/books?flow=check&demo=music"
              className="inline-block bg-sky-600 hover:bg-sky-500 text-white font-semibold px-7 py-3 rounded-xl transition btn-press text-base shadow-lg"
            >
              Try the music sample books
            </Link>
            <Link
              href="/books?flow=check&demo=music&connect=1"
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
