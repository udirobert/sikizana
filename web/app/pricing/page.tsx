"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SikiMascot } from "@/components/SikiMascot";
import { RotatedReveal } from "@/components/RotatedReveal";
import { ApiError, endpoints } from "@/lib/api";
import type { PaidPlan, Plan } from "@/lib/api";
import { useMe } from "@/hooks/useMe";
import { PLAN_LABELS } from "@/components/PlanBadge";

const TIERS: Array<{
  name: string;
  plan: Plan;
  price: string;
  period: string;
  tagline: string;
  features: string[];
  highlight: boolean;
}> = [
  {
    name: "Free",
    plan: "free",
    price: "£0",
    period: "forever",
    tagline: "See who owes you money",
    features: [
      "Connect your Xero — free audit of your real books",
      "Aged receivables: who owes what, 30/60/90 days",
      "Finds overdue invoices & unreconciled transactions",
      "P&L explanation in plain English",
      "5 AI queries per month",
    ],
    highlight: false,
  },
  {
    name: "Pro",
    plan: "pro",
    price: "£29",
    period: "per month",
    tagline: "Let Siki chase what you're owed",
    features: [
      "Everything in Free, plus:",
      "Invoice chasing — escalating reminders with statutory interest & compensation",
      "Customer payment scoring — spot who's costing you money",
      "Sector benchmarks — know what's normal for your industry",
      "Unlimited AI queries",
      "Bookkeeping fixes posted to Xero (with your approval)",
      "Tax insights (Corporation Tax estimate)",
      "Weekly email digest",
    ],
    highlight: true,
  },
  {
    name: "Business",
    plan: "business",
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
    highlight: false,
  },
];

export default function PricingPage() {
  const router = useRouter();
  const { me } = useMe();
  const [busyPlan, setBusyPlan] = useState<PaidPlan | null>(null);
  const [ctaError, setCtaError] = useState<string | null>(null);

  const stripeConfigured = me?.stripe_configured === true;

  const handlePaidCta = async (plan: PaidPlan) => {
    setCtaError(null);
    if (!me?.authenticated) {
      // Account page reads ?intent and auto-starts checkout after login/signup.
      router.push(`/account?intent=${plan}`);
      return;
    }
    setBusyPlan(plan);
    try {
      const { url } = await endpoints.billing.checkout(plan);
      window.location.assign(url);
      return; // keep the busy state during navigation
    } catch (err) {
      setCtaError(
        err instanceof ApiError && err.status === 503
          ? "Billing is not yet enabled — check back soon."
          : err instanceof ApiError
            ? err.message
            : "Could not start checkout. Please try again.",
      );
      setBusyPlan(null);
    }
  };

  const ctaClass = (highlight: boolean) =>
    `mt-6 text-center text-sm font-semibold py-2.5 rounded-lg btn-press transition-colors ${
      highlight
        ? "bg-sky-600 text-white hover:bg-sky-700"
        : "bg-stone-100 text-stone-700 hover:bg-stone-200"
    }`;

  const renderCta = (tier: (typeof TIERS)[number]) => {
    if (tier.plan === "free") {
      return (
        <Link href="/books" className={ctaClass(tier.highlight)}>
          Start Free
        </Link>
      );
    }

    // Business keeps the mailto fallback until Stripe is configured.
    if (tier.plan === "business" && !stripeConfigured) {
      return (
        <a href="mailto:hello@sikizana.com" className={ctaClass(tier.highlight)}>
          Contact Us
        </a>
      );
    }

    const paidPlan = tier.plan as PaidPlan;
    const isCurrent = me?.authenticated === true && me.plan === paidPlan;
    if (isCurrent) {
      return (
        <span
          className={`mt-6 text-center text-sm font-semibold py-2.5 rounded-lg bg-emerald-50 text-emerald-700`}
        >
          Your current plan
        </span>
      );
    }

    return (
      <button
        onClick={() => void handlePaidCta(paidPlan)}
        disabled={busyPlan !== null}
        className={`${ctaClass(tier.highlight)} disabled:opacity-50 disabled:cursor-wait`}
      >
        {busyPlan === paidPlan
          ? "Redirecting to checkout…"
          : `Upgrade to ${PLAN_LABELS[paidPlan]}`}
      </button>
    );
  };

  return (
    <main className="min-h-screen bg-stone-100 flex flex-col">
      <RotatedReveal />
      <nav className="bg-white border-b border-stone-200 px-4 py-3">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <SikiMascot size={36} mood="idle" />
            <div>
              <h1 className="text-base font-bold text-stone-900 leading-none">SIKIZANA</h1>
              <p className="text-[10px] text-stone-500 leading-none mt-0.5">
                Get paid faster · Works with Xero
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/account"
              className="text-[10px] text-stone-500 hover:text-stone-700 px-2 py-1 rounded hover:bg-stone-100 btn-press"
            >
              {me?.authenticated ? "Account" : "Sign in"}
            </Link>
            <Link
              href="/books"
              className="text-[10px] text-stone-500 hover:text-stone-700 px-2 py-1 rounded hover:bg-stone-100 btn-press"
            >
              Try Demo →
            </Link>
          </div>
        </div>
      </nav>

      <div className="flex-1 flex flex-col items-center justify-center p-6">
        <div className="text-center mb-10 fade-in-up">
          <h2 className="text-3xl font-bold text-stone-900 mb-2">
            Cheaper than one written-off invoice
          </h2>
          <p className="text-sm text-stone-500 max-w-lg mx-auto">
            The average small business writes off hundreds of pounds a year in invoices
            that were never chased properly. Sikizana chases what you&apos;re owed, shows
            you what&apos;s normal for your industry — and costs less than losing one of them.
          </p>
          {me?.authenticated && me.email && (
            <p className="text-[11px] text-stone-400 mt-2">
              Signed in as {me.email} · Current plan: {PLAN_LABELS[me.plan]}
            </p>
          )}
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
              {renderCta(tier)}
            </div>
          ))}
        </div>

        {/* aria-live so checkout errors are announced */}
        <div aria-live="polite" role="status" className="mt-4">
          {ctaError && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 fade-in-up">
              {ctaError}
            </p>
          )}
        </div>

        <div className="mt-10 text-center fade-in-up">
          <p className="text-[11px] text-stone-400 max-w-md mx-auto">
            All plans include the AI bookkeeper agent, plain-English explanations, and
            human-in-the-loop journal entries. No long-term contracts. Cancel anytime.
          </p>
          <p className="text-[11px] text-stone-400 max-w-md mx-auto mt-1.5">
            On Free, after your 5 monthly queries Siki keeps auditing your books — upgrading
            unlocks unlimited chat and the fixes.
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
