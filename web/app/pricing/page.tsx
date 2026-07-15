"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SikiMascot, ZanaMascot } from "@/components/SikiMascot";
import { RotatedReveal } from "@/components/RotatedReveal";
import { ApiError, endpoints } from "@/lib/api";
import type { FindingsResponse, PaidPlan, Plan } from "@/lib/api";
import { useMe } from "@/hooks/useMe";
import { PLAN_LABELS } from "@/components/PlanBadge";
import { getPricingTryLinks } from "@/lib/persona-theme";

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
    tagline: "Let Zana chase what you're owed",
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
  const tryLinks = getPricingTryLinks();
  const [busyPlan, setBusyPlan] = useState<PaidPlan | null>(null);
  const [ctaError, setCtaError] = useState<string | null>(null);
  // Personalized anchor: THEIR overdue number makes the price concrete.
  // Live modes only — quoting sample-data figures here would be dishonest.
  const [findings, setFindings] = useState<FindingsResponse | null>(null);
  useEffect(() => {
    void endpoints.xero
      .findings()
      .then(setFindings)
      .catch(() => {});
  }, []);
  const liveOverdue =
    findings && findings.mode !== "demo" && findings.money_found > 0
      ? findings.money_found
      : null;

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
        <div className="mt-6 space-y-2">
          <div className="flex flex-col gap-2">
            <Link
              href={tryLinks.sikiDemo}
              className="text-center text-sm font-semibold py-2.5 rounded-lg btn-press transition-colors bg-sky-600 text-white hover:bg-sky-700"
            >
              Try with Siki
            </Link>
            <Link
              href={tryLinks.zanaDemo}
              className="text-center text-sm font-semibold py-2.5 rounded-lg btn-press transition-colors bg-rose-600 text-white hover:bg-rose-700"
            >
              Try with Zana
            </Link>
          </div>
          <Link
            href={tryLinks.sikiConnect}
            className="block text-center text-[11px] font-medium text-stone-500 hover:text-stone-700 transition-colors"
          >
            Or connect Xero →
          </Link>
        </div>
      );
    }

    // Business keeps the mailto fallback until Stripe is configured.
    if (tier.plan === "business" && !stripeConfigured) {
      return (
        <a href="mailto:hello@persidian.com" className={ctaClass(tier.highlight)}>
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
        className={`${ctaClass(tier.highlight)} disabled:opacity-50 disabled:cursor-wait ${
          tier.plan === "pro" ? "bg-rose-600 hover:bg-rose-700" : ""
        }`}
      >
        {busyPlan === paidPlan
          ? "Redirecting to checkout…"
          : tier.plan === "pro"
            ? "Upgrade to chase with Zana"
            : `Upgrade to ${PLAN_LABELS[paidPlan]}`}
      </button>
    );
  };

  return (
    <main className="min-h-screen bg-stone-100 flex flex-col">
      <RotatedReveal />
      <nav className="bg-white border-b border-stone-200 px-4 py-3">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-2">
          <Link href="/" aria-label="Sikizana home" className="flex items-center gap-3 group">
            <SikiMascot size={36} mood="idle" />
            <div>
              <h1 className="text-base font-bold text-stone-900 leading-none transition-colors group-hover:text-sky-600">SIKIZANA</h1>
              <p className="text-[10px] text-stone-500 leading-none mt-0.5">
                Get paid faster · Works with Xero
              </p>
            </div>
          </Link>
          <div className="flex items-center gap-2">
            <Link
              href="/"
              className="text-[10px] font-medium text-stone-500 hover:text-stone-800 px-2 py-1 rounded hover:bg-stone-100 btn-press"
            >
              Home
            </Link>
            <Link
              href="/books?flow=check"
              className="text-[10px] font-medium text-stone-500 hover:text-sky-600 px-2 py-1 rounded hover:bg-stone-100 btn-press"
            >
              Open check
            </Link>
            <Link
              href="/account"
              className="text-[10px] text-stone-500 hover:text-stone-700 px-2 py-1 rounded hover:bg-stone-100 btn-press"
            >
              {me?.authenticated ? "Account" : "Sign in"}
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
          {liveOverdue !== null && (
            <p className="mt-3 text-sm font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 inline-block fade-in-up">
              Right now you have £{Math.round(liveOverdue).toLocaleString()} in overdue invoices.
              Pro is £29/month — let Zana chase it while you run the business.
            </p>
          )}
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
                  ? "border-rose-300 shadow-lg ring-2 ring-rose-100"
                  : "border-stone-200"
              }`}
              style={{ animationDelay: `${i * 80}ms` }}
            >
              {tier.highlight && (
                <div className="text-[10px] font-bold text-rose-600 uppercase tracking-wide mb-2">
                  Most Popular · Zana chases
                </div>
              )}
              {/* Each tier belongs to an owl: Free = Siki watches, Pro =
                  Zana acts. The mascots carry the story, not just the copy. */}
              <div className="flex items-center gap-2.5">
                {tier.plan === "free" && <SikiMascot size={36} mood="idle" />}
                {tier.plan === "pro" && <ZanaMascot size={36} mood="look" />}
                {tier.plan === "business" && (
                  <span className="flex items-center -space-x-1.5">
                    <SikiMascot size={30} mood="idle" />
                    <ZanaMascot size={30} mood="idle" />
                  </span>
                )}
                <div>
                  <h3 className="text-lg font-bold text-stone-900">{tier.name}</h3>
                  <p className="text-[11px] text-stone-400 mt-0.5">{tier.tagline}</p>
                </div>
              </div>
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
            All plans include both Siki and Zana — explain your books or chase what's owed.
            Human-in-the-loop by design. No long-term contracts. Cancel anytime.
          </p>
          <p className="text-[11px] text-stone-400 max-w-md mx-auto mt-1.5">
            On Free, after your 5 monthly queries the audit keeps running — upgrading unlocks
            unlimited chat, auto-chase, and journal write-back.
          </p>
          <div className="flex items-center justify-center gap-3 mt-4">
            <Link
              href={tryLinks.zanaConnect}
              className="text-xs font-semibold text-rose-600 hover:text-rose-700 transition-colors"
            >
              Connect with Zana →
            </Link>
            <span className="text-stone-300">·</span>
            <Link
              href={tryLinks.sikiConnect}
              className="text-xs font-semibold text-sky-600 hover:text-sky-700 transition-colors"
            >
              Connect with Siki →
            </Link>
          </div>
          <div className="flex items-center justify-center gap-3 mt-3">
            <Link href="/privacy" className="text-xs text-stone-500 hover:text-stone-700 transition-colors">
              Privacy Policy
            </Link>
            <Link href="/terms" className="text-xs text-stone-500 hover:text-stone-700 transition-colors">
              Terms of Service
            </Link>
          </div>
          <p className="text-[10px] text-stone-300 mt-2">
            Sikizana · AI finance assistant for Xero · Human-in-the-loop by design
          </p>
        </div>
      </div>
    </main>
  );
}
