"use client";

import Link from "next/link";
import { SikiMascot } from "@/components/SikiMascot";
import { RotatedReveal } from "@/components/RotatedReveal";

const TIERS = [
  {
    name: "Free",
    price: "£0",
    period: "forever",
    tagline: "Try it out with demo data",
    features: [
      "Demo company data (UK)",
      "5 AI queries per month",
      "P&L explanation in plain English",
      "Health check dashboard",
    ],
    cta: "Start Free",
    href: "/books",
    highlight: false,
  },
  {
    name: "Pro",
    price: "£29",
    period: "per month",
    tagline: "For small businesses with one Xero org",
    features: [
      "Connect your real Xero org",
      "Unlimited AI queries",
      "Proactive discrepancy alerts",
      "Tax insights (Corporation Tax estimate)",
      "Journal entries posted to Xero",
      "Receipt scanning & matching",
      "Email support",
    ],
    cta: "Connect Your Xero",
    href: "/books",
    highlight: true,
  },
  {
    name: "Business",
    price: "£79",
    period: "per month",
    tagline: "For multi-org & teams",
    features: [
      "Everything in Pro",
      "Connect multiple Xero orgs",
      "Team access (up to 5 users)",
      "Priority support",
      "Custom report scheduling",
      "API access",
    ],
    cta: "Contact Us",
    href: "mailto:hello@sikizana.com",
    highlight: false,
  },
];

export default function PricingPage() {
  return (
    <main className="min-h-screen bg-stone-100 flex flex-col">
      <RotatedReveal />
      <nav className="bg-white border-b border-stone-200 px-4 py-3">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <SikiMascot size={36} mood="idle" />
            <div>
              <h1 className="text-base font-bold text-stone-900 leading-none">SIKIZANA BOOKS</h1>
              <p className="text-[10px] text-stone-500 leading-none mt-0.5">
                AI Bookkeeper for Xero
              </p>
            </div>
          </div>
          <Link
            href="/books"
            className="text-[10px] text-stone-500 hover:text-stone-700 px-2 py-1 rounded hover:bg-stone-100 btn-press"
          >
            Try Demo →
          </Link>
        </div>
      </nav>

      <div className="flex-1 flex flex-col items-center justify-center p-6">
        <div className="text-center mb-10 fade-in-up">
          <h2 className="text-3xl font-bold text-stone-900 mb-2">
            Simple pricing that pays for itself
          </h2>
          <p className="text-sm text-stone-500 max-w-lg mx-auto">
            One hour of an accountant&apos;s time costs £40-60. Sikizana replaces 3-5 hours
            of bookkeeping every month — for less than the cost of a single hour.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 max-w-4xl w-full">
          {TIERS.map((tier, i) => (
            <div
              key={tier.name}
              className={`bg-white rounded-2xl shadow-sm border p-6 flex flex-col fade-in-up ${
                tier.highlight
                  ? "border-sky-400 shadow-lg ring-2 ring-sky-100"
                  : "border-stone-200"
              }`}
              style={{ animationDelay: `${i * 80}ms` }}
            >
              {tier.highlight && (
                <div className="text-[10px] font-bold text-sky-600 uppercase tracking-wide mb-2">
                  Most Popular
                </div>
              )}
              <h3 className="text-lg font-bold text-stone-900">{tier.name}</h3>
              <p className="text-[11px] text-stone-400 mt-0.5">{tier.tagline}</p>
              <div className="mt-4 mb-4">
                <span className="text-3xl font-bold text-stone-900">{tier.price}</span>
                <span className="text-sm text-stone-400 ml-1">/ {tier.period}</span>
              </div>
              <ul className="space-y-2 flex-1">
                {tier.features.map((f) => (
                  <li key={f} className="text-xs text-stone-600 flex items-start gap-2">
                    <span className="text-emerald-500 mt-0.5">✓</span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <a
                href={tier.href}
                className={`mt-6 text-center text-sm font-semibold py-2.5 rounded-lg btn-press transition-colors ${
                  tier.highlight
                    ? "bg-sky-600 text-white hover:bg-sky-700"
                    : "bg-stone-100 text-stone-700 hover:bg-stone-200"
                }`}
              >
                {tier.cta}
              </a>
            </div>
          ))}
        </div>

        <div className="mt-10 text-center fade-in-up">
          <p className="text-[11px] text-stone-400 max-w-md mx-auto">
            All plans include the AI bookkeeper agent, plain-English explanations, and
            human-in-the-loop journal entries. No long-term contracts. Cancel anytime.
          </p>
          <div className="flex items-center justify-center gap-3 mt-3">
            <Link href="/privacy" className="text-xs text-stone-500 hover:text-stone-700 transition-colors">
              Privacy Policy
            </Link>
            <Link href="/terms" className="text-xs text-stone-500 hover:text-stone-700 transition-colors">
              Terms of Service
            </Link>
          </div>
          <p className="text-[10px] text-stone-300 mt-2">
            Built for the Xero App &amp; Agent Hackathon · Encode Club · London 2026
          </p>
        </div>
      </div>
    </main>
  );
}
