"use client";

import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Search, ArrowRight, BookOpen, Sparkles, Coffee } from "lucide-react";
import { SikiMascot } from "@/components/SikiMascot";
import { SiteNav } from "@/components/SiteNav";
import { MarketingFooter } from "@/components/MarketingFooter";
import { checkPathFromQuery } from "@/components/SectorCheckEntry";

const POPULAR_SECTOR_CHECKS = [
  { label: "Hospitality / Café", slug: "hospitality" },
  { label: "Retail / Shop", slug: "retail" },
  { label: "Agency / Services", slug: "professional_services" },
  { label: "Construction", slug: "construction" },
  { label: "Music & Creative", slug: "music" },
  { label: "Wholesale", slug: "wholesale" },
];

export default function NotFound() {
  const pathname = usePathname();
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");

  // Extract the slug from pathname if it's a simple one-segment path like /hotel
  const rawSlug = pathname ? pathname.replace(/^\/+|\/+$/g, "") : "";
  const isLikelySectorQuery =
    rawSlug &&
    !rawSlug.includes("/") &&
    rawSlug.length >= 2 &&
    rawSlug.length <= 30 &&
    !["404", "not-found"].includes(rawSlug);

  const cleanSlugLabel = isLikelySectorQuery
    ? decodeURIComponent(rawSlug).replace(/[-_]/g, " ")
    : "";

  const handleSearchSubmit = (e: FormEvent) => {
    e.preventDefault();
    router.push(checkPathFromQuery(searchQuery));
  };

  return (
    <main className="min-h-screen bg-stone-50 flex flex-col justify-between text-stone-900">
      <SiteNav variant="marketing" />

      <div className="flex-1 max-w-4xl mx-auto w-full px-6 py-12 flex flex-col justify-center">
        {/* Siki Hero Card */}
        <div className="relative bg-white rounded-3xl border border-stone-200 shadow-sm p-6 sm:p-8 mb-8 fade-in-up">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5">
            <div className="shrink-0">
              <SikiMascot size={72} mood="look" />
            </div>

            <div className="flex-1 min-w-0">
              <div className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 border border-amber-200 px-2.5 py-0.5 text-[11px] font-semibold text-amber-800 uppercase tracking-wide mb-2">
                Page not found · 404
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold text-stone-950 tracking-tight">
                {isLikelySectorQuery ? (
                  <>Looking for a {cleanSlugLabel} check?</>
                ) : (
                  <>I couldn&apos;t find that page in the books.</>
                )}
              </h1>
              <p className="mt-1.5 text-sm text-stone-600 leading-relaxed max-w-xl">
                {isLikelySectorQuery ? (
                  <>
                    I noticed you visited <code className="bg-stone-100 px-1.5 py-0.5 rounded text-stone-800 font-mono text-xs">/{cleanSlugLabel}</code>.
                    I can run a full AP integrity scan and benchmark comparison for {cleanSlugLabel} right away.
                  </>
                ) : (
                  <>
                    The link might be outdated or mistyped. Tell me your business type and I&apos;ll check your sector margins, or explore sample books below.
                  </>
                )}
              </p>
            </div>
          </div>

          {/* Quick-Match Sector Callout (if path looks like a sector) */}
          {isLikelySectorQuery && (
            <div className="mt-6 pt-6 border-t border-stone-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-sky-50/50 -mx-6 -mb-6 p-6 rounded-b-3xl border-sky-100">
              <div>
                <p className="text-xs font-semibold text-sky-900">
                  Instant sector check ready
                </p>
                <p className="text-xs text-sky-700 mt-0.5">
                  See typical UK margins and sample AP findings for {cleanSlugLabel}.
                </p>
              </div>
              <Link
                href={`/check/${encodeURIComponent(rawSlug.toLowerCase())}`}
                className="inline-flex items-center gap-2 rounded-xl bg-stone-950 hover:bg-stone-800 text-white text-xs font-semibold px-4 py-2.5 shadow-sm transition btn-press shrink-0"
              >
                Run {cleanSlugLabel} check
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          )}
        </div>

        {/* Search for any sector */}
        <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-sm mb-8 fade-in-up fade-in-up-delay-1">
          <label htmlFor="sector-search" className="block text-xs font-bold uppercase tracking-wider text-stone-500 mb-2">
            Check any business sector
          </label>
          <form onSubmit={handleSearchSubmit} className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
              <input
                id="sector-search"
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Type a business type (e.g. coffee shop, dental clinic, plumber, music studio)..."
                className="w-full bg-stone-50 border border-stone-200 rounded-xl pl-9 pr-4 py-2.5 text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 transition"
              />
            </div>
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 rounded-xl bg-stone-900 hover:bg-stone-800 text-white text-xs font-semibold px-4 py-2.5 transition btn-press shrink-0"
            >
              Check
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </form>

          <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-stone-500">
            <span className="text-stone-400">Popular:</span>
            {POPULAR_SECTOR_CHECKS.map((s) => (
              <Link
                key={s.slug}
                href={`/check/${s.slug}`}
                className="inline-block px-2 py-0.5 rounded-md bg-stone-100 hover:bg-stone-200 text-stone-700 font-medium transition"
              >
                {s.label}
              </Link>
            ))}
          </div>
        </div>

        {/* Helpful Destinations Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 fade-in-up fade-in-up-delay-2">
          <Link
            href="/books?flow=check"
            className="group rounded-2xl border border-stone-200 bg-white p-4 hover:border-sky-300 hover:shadow-sm transition"
          >
            <div className="flex items-center gap-2 text-sky-700 mb-1.5">
              <BookOpen className="w-4 h-4" />
              <span className="text-xs font-bold uppercase tracking-wide">Try Books</span>
            </div>
            <p className="text-sm font-semibold text-stone-900 group-hover:text-sky-700 transition">
              Sample Xero Books →
            </p>
            <p className="text-xs text-stone-500 mt-1 leading-snug">
              Chat with Siki &amp; Zana, review overdue invoices and AP exceptions.
            </p>
          </Link>

          <Link
            href="/cafe"
            className="group rounded-2xl border border-stone-200 bg-white p-4 hover:border-emerald-300 hover:shadow-sm transition"
          >
            <div className="flex items-center gap-2 text-emerald-700 mb-1.5">
              <Coffee className="w-4 h-4" />
              <span className="text-xs font-bold uppercase tracking-wide">Café Briefing</span>
            </div>
            <p className="text-sm font-semibold text-stone-900 group-hover:text-emerald-700 transition">
              Monday Till Intelligence →
            </p>
            <p className="text-xs text-stone-500 mt-1 leading-snug">
              Live case study on menu items, attach rates, and competitor pricing.
            </p>
          </Link>

          <Link
            href="/pricing"
            className="group rounded-2xl border border-stone-200 bg-white p-4 hover:border-amber-300 hover:shadow-sm transition"
          >
            <div className="flex items-center gap-2 text-amber-700 mb-1.5">
              <Sparkles className="w-4 h-4" />
              <span className="text-xs font-bold uppercase tracking-wide">Plans</span>
            </div>
            <p className="text-sm font-semibold text-stone-900 group-hover:text-amber-700 transition">
              Pricing &amp; Free Plan →
            </p>
            <p className="text-xs text-stone-500 mt-1 leading-snug">
              Free 5 queries/month. Connect Xero and protect your books.
            </p>
          </Link>
        </div>

        <div className="mt-8 text-center">
          <Link
            href="/"
            className="text-xs font-semibold text-stone-500 hover:text-stone-800 transition underline underline-offset-4"
          >
            ← Back to Sikizana homepage
          </Link>
        </div>
      </div>

      <MarketingFooter />
    </main>
  );
}
