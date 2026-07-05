"use client";

import { SikiMascot } from "@/components/SikiMascot";
import { AnimatedNumber } from "@/components/AnimatedNumber";
import { SkeletonReveal } from "@/components/SkeletonReveal";
import type { Finding, FindingKind, FindingsResponse } from "@/lib/api";

/**
 * FindingsPanel — the structured audit at the heart of the books page.
 *
 * Fed by GET /api/xero/findings: a summary header where the money number
 * dominates (the product's aha moment), then one card per finding with a
 * single primary action that drops the server-provided prompt straight
 * into the chat. When the books are clean, it celebrates instead.
 *
 * Rendered twice by the books page (desktop sidebar + mobile top block),
 * so all state (asked findings, loading) is lifted to the page.
 */

const KIND_ICONS: Record<FindingKind, string> = {
  overdue_invoice: "💷",
  overdue_bill: "📄",
  unreconciled: "🔗",
  tax_flag: "🏛️",
};

const KIND_LABELS: Record<FindingKind, string> = {
  overdue_invoice: "Overdue invoice",
  overdue_bill: "Overdue bill",
  unreconciled: "Unreconciled",
  tax_flag: "Tax flag",
};

function severityClasses(severity: Finding["severity"]): string {
  // High = amber/red-tinted left accent; medium/low = stone.
  if (severity === "high") {
    return "border-l-4 border-l-amber-500 border-y-amber-200 border-r-amber-200 bg-amber-50/40";
  }
  return "border-l-4 border-l-stone-300 border-y-stone-200 border-r-stone-200 bg-white";
}

function formatMoney(amount: number): string {
  return amount.toLocaleString(undefined, {
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

export function findingsSummary(data: FindingsResponse): string {
  const parts: string[] = [];
  if (data.money_found > 0) {
    parts.push(`£${formatMoney(Math.round(data.money_found))} you're owed`);
  } else if (data.counts.overdue > 0) {
    parts.push(`${data.counts.overdue} overdue`);
  }
  if (data.counts.unreconciled > 0) parts.push(`${data.counts.unreconciled} unreconciled`);
  if (data.counts.tax_flags > 0) {
    parts.push(`${data.counts.tax_flags} tax flag${data.counts.tax_flags === 1 ? "" : "s"}`);
  }
  return parts.join(" · ");
}

interface FindingsPanelProps {
  data: FindingsResponse | null;
  loading: boolean;
  /** Findings the user already acted on ("asked" state). */
  askedIds: ReadonlySet<string>;
  /** True while the chat is streaming — actions queue-jump nothing. */
  disabled?: boolean;
  /** Send the finding's action prompt into the chat (same path as typed messages). */
  onAct: (finding: Finding) => void;
  /** Pre-fill the chat input with a suggested prompt (clean state). */
  onSuggest: (prompt: string) => void;
  /** Suggested prompts for the clean/celebration state. */
  suggestions: Array<{ id: string; title: string; description: string }>;
  className?: string;
}

export function FindingsPanel({
  data,
  loading,
  askedIds,
  disabled = false,
  onAct,
  onSuggest,
  suggestions,
  className = "",
}: FindingsPanelProps) {
  return (
    <section className={className} aria-label="Audit findings">
      <div className="flex items-center gap-1 mb-2">
        <h3 className="text-[10px] font-bold text-stone-500 uppercase tracking-wide">
          What Siki Found
        </h3>
        {data && (
          <span
            className={`text-[9px] font-medium px-1.5 py-0.5 rounded ${
              data.mode === "demo"
                ? "bg-amber-50 text-amber-600"
                : "bg-emerald-50 text-emerald-600"
            }`}
          >
            {data.mode === "demo" ? "DEMO" : "LIVE"}
          </span>
        )}
      </div>

      {/* Summary header — announced when it first loads */}
      <div aria-live="polite">
        <SkeletonReveal isLoading={loading} className="h-[56px]" skeletonClassName="rounded-xl">
          {data && !data.clean && (
            <div className="rounded-xl border border-stone-200 bg-white p-3">
              {data.money_found > 0 ? (
                <div className="flex items-baseline gap-1.5">
                  <span className="text-2xl font-bold text-stone-900 leading-none">
                    <AnimatedNumber prefix="£" value={Math.round(data.money_found)} />
                  </span>
                  <span className="text-xs text-stone-600 font-medium">you&apos;re owed</span>
                </div>
              ) : (
                <div className="text-sm font-bold text-stone-900">
                  {data.findings.length} thing{data.findings.length === 1 ? "" : "s"} need
                  {data.findings.length === 1 ? "s" : ""} a look
                </div>
              )}
              <p className="text-[11px] text-stone-500 mt-1">{findingsSummary(data)}</p>
            </div>
          )}
          {data?.clean && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 flex items-center gap-3">
              <SikiMascot size={40} mood="celebrate" />
              <div>
                <p className="text-xs font-semibold text-emerald-800">Your books are clean ✓</p>
                <p className="text-[10px] text-emerald-700 mt-0.5">
                  Nothing overdue, nothing unreconciled.
                </p>
              </div>
            </div>
          )}
          {!data && !loading && (
            <div className="rounded-xl border border-stone-200 bg-stone-50 p-3">
              <p className="text-[11px] text-stone-500">
                Couldn&apos;t load the audit right now — the chat below still works.
              </p>
            </div>
          )}
        </SkeletonReveal>
      </div>

      {/* One card per finding */}
      {data && !data.clean && (
        <ul className="mt-2 space-y-2" role="list">
          {data.findings.map((finding, i) => {
            const asked = askedIds.has(finding.id);
            return (
              <li
                key={finding.id}
                className={`rounded-xl border p-2.5 fade-in-up ${severityClasses(finding.severity)} ${
                  asked ? "opacity-70" : ""
                }`}
                style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
              >
                <div className="flex items-start gap-2">
                  <span className="text-sm leading-none mt-0.5" aria-hidden="true">
                    {KIND_ICONS[finding.kind]}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-xs font-semibold text-stone-800 truncate">
                        {finding.title}
                      </span>
                      {finding.amount > 0 && (
                        <span className="text-xs font-bold text-stone-900 shrink-0">
                          £{formatMoney(finding.amount)}
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-stone-500 mt-0.5">
                      {KIND_LABELS[finding.kind]} · {finding.detail}
                    </p>
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <button
                    onClick={() => onAct(finding)}
                    disabled={asked || disabled}
                    aria-label={`${finding.action.label} — ${finding.title}`}
                    className={`text-[11px] font-semibold px-2.5 py-1.5 rounded-lg btn-press transition-colors disabled:cursor-not-allowed ${
                      asked
                        ? "bg-stone-100 text-stone-400"
                        : "bg-sky-600 text-white hover:bg-sky-700 disabled:opacity-50"
                    }`}
                  >
                    {asked ? "✓ Asked" : finding.action.label}
                  </button>
                  {asked && (
                    <span className="text-[10px] text-stone-500">In progress — see chat</span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* Clean state — suggested prompts keep the session going */}
      {data?.clean && suggestions.length > 0 && (
        <div className="mt-2 space-y-1.5">
          <p className="text-[10px] uppercase tracking-wide text-stone-500 font-semibold">
            Try asking
          </p>
          {suggestions.map((s) => (
            <button
              key={s.id}
              onClick={() => onSuggest(s.description)}
              className="w-full text-left text-xs bg-stone-50 hover:bg-stone-100 border border-stone-200 rounded-lg px-2.5 py-2 transition-colors btn-press"
            >
              <span className="font-medium text-stone-800">{s.title}</span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
