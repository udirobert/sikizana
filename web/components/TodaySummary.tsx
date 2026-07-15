"use client";

import type { Finding, FindingsResponse } from "@/lib/api";
import type { Persona } from "@/lib/persona-theme";

interface TodaySummaryProps {
  data: FindingsResponse | null;
  loading: boolean;
  persona: Persona;
  disabled?: boolean;
  onReviewPriority: (finding: Finding) => void;
}

function formatMoney(amount: number): string {
  return amount.toLocaleString(undefined, {
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

/**
 * The return-state layer for /books. Findings remains the canonical record;
 * this only answers the first question a returning owner has: what matters now?
 */
export function TodaySummary({
  data,
  loading,
  persona,
  disabled = false,
  onReviewPriority,
}: TodaySummaryProps) {
  if (loading) {
    return (
      <section aria-label="Today" className="border-b border-stone-100 pb-3">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-stone-500">Today</p>
        <p className="mt-1 text-xs text-stone-500 t-shimmer">Checking your finance priorities…</p>
      </section>
    );
  }

  if (!data) {
    return null;
  }

  if (data.clean) {
    return (
      <section aria-label="Today" className="border-b border-emerald-100 pb-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-stone-500">Today</p>
          <span className="text-[10px] font-semibold text-emerald-700">All clear</span>
        </div>
        <p className="mt-1 text-sm font-semibold text-stone-900">Your routine check is complete.</p>
        <p className="mt-1 text-[11px] leading-relaxed text-stone-500">
          Nothing material needs attention right now. Sikizana will surface the next meaningful change.
        </p>
      </section>
    );
  }

  const priority = data.findings[0];
  if (!priority) return null;
  const urgent = priority.severity === "high" || data.money_found > 0;
  const accent = persona === "zana" ? "text-rose-700" : "text-sky-700";
  const button = persona === "zana" ? "bg-rose-600 hover:bg-rose-700" : "bg-sky-600 hover:bg-sky-700";

  return (
    <section aria-label="Today" className="border-b border-stone-100 pb-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-stone-500">Today</p>
        <span className={`text-[10px] font-semibold ${urgent ? "text-amber-700" : accent}`}>
          {urgent ? "Needs attention" : "Routine review"}
        </span>
      </div>
      <p className="mt-1 text-sm font-semibold text-stone-900">{priority.title}</p>
      <div className="mt-1 flex items-start justify-between gap-3">
        <p className="text-[11px] leading-relaxed text-stone-500">{priority.detail}</p>
        {priority.amount > 0 && (
          <span className="shrink-0 text-xs font-bold text-stone-900">£{formatMoney(priority.amount)}</span>
        )}
      </div>
      <button
        onClick={() => onReviewPriority(priority)}
        disabled={disabled}
        className={`mt-3 rounded-lg px-3 py-1.5 text-[11px] font-semibold text-white transition-colors btn-press disabled:cursor-not-allowed disabled:opacity-50 ${button}`}
      >
        Review priority
      </button>
    </section>
  );
}
