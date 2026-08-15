"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { COMPARE_TYPICALS_HREF } from "@/components/MarketingCtas";

export function checkPathFromQuery(raw: string): string {
  const trimmed = raw.trim().toLowerCase().replace(/\s+/g, "-");
  if (!trimmed) return COMPARE_TYPICALS_HREF;
  return `/check/${encodeURIComponent(trimmed)}`;
}

/** Homepage (and 404-style) entry: type a business → /check/{slug}. */
export function SectorCheckEntry({
  placeholder = "café, plumbing, band…",
  submitLabel = "Compare",
}: {
  placeholder?: string;
  submitLabel?: string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    router.push(checkPathFromQuery(query));
  };

  return (
    <form onSubmit={onSubmit} className="mt-7 fade-in-up fade-in-up-delay-3">
      <label htmlFor="sector-check-entry" className="sr-only">
        What do you run?
      </label>
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          id="sector-check-entry"
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          autoComplete="off"
          className="min-w-0 flex-1 rounded-xl border border-stone-300 bg-white px-4 py-3 text-sm text-stone-950 outline-none placeholder:text-stone-400 focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
        />
        <button
          type="submit"
          className="inline-flex shrink-0 items-center justify-center rounded-xl bg-stone-950 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-stone-900/15 transition hover:bg-stone-800 btn-press"
        >
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
