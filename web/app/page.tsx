"use client";

import Link from "next/link";
import { useRevenue } from "@/hooks/useRevenue";

/**
 * Public landing page. Sets expectations, builds trust, and routes to the
 * arbitration chat. Uses the shared useRevenue hook to surface real numbers
 * when available.
 */
export default function LandingPage() {
  const revenue = useRevenue(60_000);

  const paidCount = revenue?.confirmed_count ?? 0;
  const totalKes = revenue?.total_revenue_kes ?? 0;

  return (
    <main className="min-h-screen bg-stone-50">
      <nav className="bg-white border-b border-stone-200 px-4 py-3">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-gradient-to-br from-emerald-600 to-emerald-800 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">S</span>
            </div>
            <span className="text-base font-bold text-stone-900">SIKIZANA</span>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/books"
              className="bg-sky-600 hover:bg-sky-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition btn-press"
            >
              Sikizana Books (Xero)
            </Link>
            <Link
              href="/arbitrate"
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition btn-press"
            >
              Anza Sasa
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-3xl mx-auto px-6 py-16 text-center">
        <div className="inline-block bg-emerald-50 text-emerald-700 text-[11px] font-semibold uppercase tracking-wide px-3 py-1 rounded-full mb-6">
          AI-Native · Money & Financial Access
        </div>
        <h1 className="text-4xl sm:text-5xl font-bold text-stone-900 leading-tight tracking-tight">
          Resolve chama disputes in minutes, not weeks.
        </h1>
        <p className="mt-5 text-lg text-stone-600 max-w-2xl mx-auto">
          Sikizana is your impartial AI arbitrator. Trained on Kenyan bylaws and
          Sheng/Kiswahili, it analyses M-Pesa records, bylaw citations, and
          member testimonies to render a fair verdict — then commits it to the
          Vara Network for permanent proof.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3 flex-wrap">
          <Link
            href="/books"
            className="bg-sky-600 hover:bg-sky-700 text-white font-semibold px-6 py-3 rounded-xl transition shadow-md btn-press"
          >
            Sikizana Books (Xero)
          </Link>
          <Link
            href="/arbitrate"
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-6 py-3 rounded-xl transition shadow-md btn-press"
          >
            Anza Mazungumzo
          </Link>
          <Link
            href="/arbitrate?sample=unpaid-contributions"
            className="bg-white hover:bg-stone-50 text-stone-700 font-medium px-6 py-3 rounded-xl transition border border-stone-200"
          >
            Try a sample dispute
          </Link>
        </div>
      </section>

      {/* Trust signals */}
      <section className="max-w-4xl mx-auto px-6 pb-12">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white border border-stone-200 rounded-2xl p-5">
            <div className="text-[10px] uppercase tracking-wide text-stone-400 font-semibold">
              Paid Audits
            </div>
            <div className="text-2xl font-bold text-stone-900 mt-1">
              {paidCount > 0 ? paidCount : "0"}
            </div>
            <div className="text-xs text-stone-500 mt-1">
              {totalKes > 0 ? `${totalKes.toLocaleString()} KES collected` : "Live revenue tracking"}
            </div>
          </div>
          <div className="bg-white border border-stone-200 rounded-2xl p-5">
            <div className="text-[10px] uppercase tracking-wide text-stone-400 font-semibold">
              Response Time
            </div>
            <div className="text-2xl font-bold text-stone-900 mt-1">&lt; 30s</div>
            <div className="text-xs text-stone-500 mt-1">
              Average time to first verdict
            </div>
          </div>
          <div className="bg-white border border-stone-200 rounded-2xl p-5">
            <div className="text-[10px] uppercase tracking-wide text-stone-400 font-semibold">
              Languages
            </div>
            <div className="text-2xl font-bold text-stone-900 mt-1">3</div>
            <div className="text-xs text-stone-500 mt-1">
              English · Kiswahili · Sheng
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="max-w-4xl mx-auto px-6 pb-16">
        <h2 className="text-2xl font-bold text-stone-900 text-center mb-10">
          Jinsi inavyofanya kazi
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            {
              step: "1",
              title: "Sema mzozo",
              body: "Andika kuhusu mzozo wako kwa Kiswahili, Sheng, au English. Sikizana inaelewa nuance za mtaa.",
            },
            {
              step: "2",
              title: "AI inachambua",
              body: "AI inalinganisha ushuhuda wako na bylaws za chama na rekodi za M-Pesa.",
            },
            {
              step: "3",
              title: "Uamuzi wa kudumu",
              body: "Premium deep audit inarekodi uamuzi kwenye Vara Network — uthibitisho wa kidigitali ambao benki zinaweza kuthibitisha.",
            },
          ].map((item) => (
            <div
              key={item.step}
              className="bg-white border border-stone-200 rounded-2xl p-6"
            >
              <div className="w-8 h-8 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center font-bold text-sm mb-3">
                {item.step}
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

      {/* Pricing */}
      <section className="max-w-2xl mx-auto px-6 pb-16">
        <h2 className="text-2xl font-bold text-stone-900 text-center mb-3">
          Bei rahisi
        </h2>
        <p className="text-sm text-stone-500 text-center mb-8">
          Standard mediation is free. Premium deep audit is paid once per dispute.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-white border border-stone-200 rounded-2xl p-6">
            <div className="text-[11px] uppercase tracking-wide text-stone-400 font-semibold">
              Standard
            </div>
            <div className="text-3xl font-bold text-stone-900 mt-1">
              Free
            </div>
            <ul className="mt-4 space-y-2 text-xs text-stone-600">
              <li>✓ Basic bylaw retrieval</li>
              <li>✓ Bilingual (English/Swahili)</li>
              <li>✓ AI-guided mediation suggestions</li>
            </ul>
          </div>
          <div className="bg-gradient-to-br from-amber-500 to-amber-600 text-white rounded-2xl p-6 shadow-lg">
            <div className="text-[11px] uppercase tracking-wide text-amber-100 font-semibold">
              Premium Deep Audit
            </div>
            <div className="text-3xl font-bold mt-1">
              100 KES
              <span className="text-sm font-normal text-amber-100"> / dispute</span>
            </div>
            <ul className="mt-4 space-y-2 text-xs text-amber-50">
              <li>✓ Full M-Pesa statement analysis</li>
              <li>✓ Bylaw citations (Vara on-chain)</li>
              <li>✓ Verdict committed immutably</li>
              <li>✓ Bank Readiness Report</li>
            </ul>
          </div>
        </div>
      </section>

      <footer className="border-t border-stone-200 bg-white">
        <div className="max-w-6xl mx-auto px-6 py-6 text-center">
          <p className="text-[11px] text-stone-400">
            Built by @udirobert · Hosted on Google Cloud · Secured on Vara Network · Data stays in your country
          </p>
          <p className="text-[10px] text-stone-300 mt-1">
            Solo build with AI assistance · Open source · MIT/Apache 2.0
          </p>
        </div>
      </footer>
    </main>
  );
}
