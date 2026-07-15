"use client";

import { useState } from "react";
import {
  cleanFindingsCopy,
  findingActionLabel,
  getPersonaTheme,
  type Persona,
} from "@/lib/persona-theme";
import { AnimatedNumber } from "@/components/AnimatedNumber";
import { SkeletonReveal } from "@/components/SkeletonReveal";
import { SikiMascot, ZanaMascot } from "@/components/SikiMascot";
import type {
  Finding,
  FindingKind,
  FindingReviewPayload,
  FindingReviewState,
  FindingsResponse,
} from "@/lib/api";

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
  ap_duplicate_bill: "🔍",
  ap_duplicate_payment: "🔍",
  ap_supplier_detail_change: "🔒",
  ap_payment_anomaly: "🔎",
};

const KIND_LABELS: Record<FindingKind, string> = {
  overdue_invoice: "Overdue invoice",
  overdue_bill: "Overdue bill",
  unreconciled: "Unreconciled",
  tax_flag: "Tax flag",
  ap_duplicate_bill: "Possible duplicate bill",
  ap_duplicate_payment: "Possible duplicate payment",
  ap_supplier_detail_change: "Supplier detail change",
  ap_payment_anomaly: "Payment anomaly",
};

/** Plain-English gloss per kind — the target user isn't an accountant. */
const KIND_GLOSS: Partial<Record<FindingKind, string>> = {
  unreconciled: "A bank transaction Xero can't match to an invoice or bill yet",
  tax_flag: "An expense that may affect what tax you owe",
  ap_duplicate_bill: "Review the matching source bills before paying or requesting a credit",
  ap_duplicate_payment: "Review the matching payment records before requesting a credit or refund",
  ap_supplier_detail_change: "Verify through a supplier contact channel you already trust",
  ap_payment_anomaly: "A conservative prompt to check a high-value first payment",
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
    parts.push(`£${formatMoney(Math.round(data.money_found))} slipping away`);
  } else if (data.counts.overdue > 0) {
    parts.push(`${data.counts.overdue} overdue`);
  }
  if (data.counts.unreconciled > 0) parts.push(`${data.counts.unreconciled} unreconciled`);
  if (data.counts.tax_flags > 0) {
    parts.push(`${data.counts.tax_flags} tax flag${data.counts.tax_flags === 1 ? "" : "s"}`);
  }
  if (data.counts.ap_risks > 0) {
    parts.push(`${data.counts.ap_risks} AP risk${data.counts.ap_risks === 1 ? "" : "s"}`);
  }
  return parts.join(" · ");
}

interface FindingsPanelProps {
  data: FindingsResponse | null;
  loading: boolean;
  /** Findings the user already acted on ("asked" state). */
  askedIds: ReadonlySet<string>;
  /** Findings the user saved (commitment ladder — creates sunk cost). */
  savedIds?: ReadonlySet<string>;
  /** True while the chat is streaming — actions queue-jump nothing. */
  disabled?: boolean;
  /** Send the finding's action prompt into the chat (same path as typed messages). */
  onAct: (finding: Finding) => void;
  /** Save a finding for later (commitment ladder — persists across sessions). */
  onSave?: (finding: Finding) => void;
  /** Schedule automatic follow-ups for an overdue invoice (the chase loop). */
  onAutoChase?: (finding: Finding) => void;
  /** Findings with a chase sequence already scheduled. */
  chasedIds?: ReadonlySet<string>;
  /** Persist a human AP review state; never changes the accounting source. */
  onReview?: (
    finding: Finding,
    state: Exclude<FindingReviewState, "open">,
    outcome?: Omit<FindingReviewPayload, "state">,
  ) => void;
  reviewingIds?: ReadonlySet<string>;
  /** Pre-fill the chat input with a suggested prompt (clean state). */
  onSuggest: (prompt: string) => void;
  /** Suggested prompts for the clean/celebration state. */
  suggestions: Array<{ id: string; title: string; description: string }>;
  /** Compact mode for sidebars: collapsed rows, no inline action buttons,
   *  max 3 visible with a "show more" toggle. */
  compact?: boolean;
  /** Active chat persona — drives accent colour and action labels. */
  persona?: Persona;
  className?: string;
}

export function FindingsPanel({
  data,
  loading,
  askedIds,
  savedIds,
  disabled = false,
  onAct,
  onSave,
  onAutoChase,
  chasedIds,
  onReview,
  reviewingIds,
  onSuggest,
  suggestions,
  compact = false,
  persona = "siki",
  className = "",
}: FindingsPanelProps) {
  const theme = getPersonaTheme(persona);
  const [expanded, setExpanded] = useState(false);
  const [confirmedAmounts, setConfirmedAmounts] = useState<Record<string, string>>({});
  const [dismissalReasons, setDismissalReasons] = useState<Record<string, string>>({});
  const visibleFindings = compact
    ? expanded
      ? data?.findings ?? []
      : (data?.findings ?? []).slice(0, 3)
    : data?.findings ?? [];
  const hiddenCount = compact ? (data?.findings.length ?? 0) - 3 : 0;

  return (
    <section className={className} aria-label="Audit findings">
      <div className="flex items-center gap-1 mb-2">
        <h3 className="text-[10px] font-bold text-stone-500 uppercase tracking-wide">
          {theme.findingsTitle}
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
                  <span className="text-xs text-stone-600 font-medium">slipping away</span>
                </div>
              ) : (
                <div className="text-sm font-bold text-stone-900">
                  {data.findings.length} thing{data.findings.length === 1 ? "" : "s"} need
                  {data.findings.length === 1 ? "s" : ""} a look
                </div>
              )}
              <p className="text-[11px] text-stone-500 mt-1">{findingsSummary(data)}</p>
              {/* The win tally — money the chase loop actually got paid. */}
              {data.recovered && data.recovered.total > 0 && (
                <p className="text-[11px] font-medium text-emerald-700 mt-1">
                  🦉 £{formatMoney(Math.round(data.recovered.total))} recovered by{" "}
                  {persona === "zana" ? "Zana's" : "Siki's"} chasing (
                  {data.recovered.count} invoice{data.recovered.count === 1 ? "" : "s"})
                </p>
              )}
              {data.ap_reviewed && data.ap_reviewed.confirmed_value > 0 && (
                <p className="text-[11px] font-medium text-emerald-700 mt-1">
                  £{formatMoney(Math.round(data.ap_reviewed.confirmed_value))} confirmed by AP
                  review ({data.ap_reviewed.confirmed_count} exception
                  {data.ap_reviewed.confirmed_count === 1 ? "" : "s"})
                </p>
              )}
              {/* Aged-receivables strip — the standard 30/60/90 view of
                  who owes what, right under the money number. */}
              {data.aging && data.aging.total_outstanding > 0 && (
                <div className="mt-2 pt-2 border-t border-stone-100">
                  <div className="flex h-2 rounded-full overflow-hidden bg-stone-100">
                    {data.aging.buckets
                      .filter((b) => b.amount > 0)
                      .map((b) => (
                        <div
                          key={b.key}
                          className={
                            b.key === "current"
                              ? "bg-stone-300"
                              : b.key === "b_1_30"
                                ? "bg-amber-300"
                                : b.key === "b_31_60"
                                  ? "bg-amber-500"
                                  : b.key === "b_61_90"
                                    ? "bg-orange-600"
                                    : "bg-rose-600"
                          }
                          style={{
                            width: `${(b.amount / data.aging!.total_outstanding) * 100}%`,
                          }}
                          title={`${b.label}: £${formatMoney(b.amount)}`}
                        />
                      ))}
                  </div>
                  <p className="text-[10px] text-stone-500 mt-1">
                    {data.aging.buckets
                      .filter((b) => b.amount > 0 && b.key !== "current")
                      .map((b) => `${b.label}: £${formatMoney(Math.round(b.amount))}`)
                      .join(" · ")}
                    {data.aging.dso_days !== null &&
                      ` · paid in ~${Math.round(data.aging.dso_days)}d on avg`}
                  </p>
                </div>
              )}
            </div>
          )}
          {data?.clean && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 flex items-center gap-3">
              {persona === "zana" ? (
                <ZanaMascot size={40} mood="idle" />
              ) : (
                <SikiMascot size={40} mood="celebrate" />
              )}
              <div>
                <p className="text-xs font-semibold text-emerald-800">Your books are clean ✓</p>
                <p className="text-[10px] text-emerald-700 mt-0.5">
                  {cleanFindingsCopy(persona)}
                </p>
                {data.recovered && data.recovered.total > 0 && (
                  <p className="text-[10px] font-medium text-emerald-700 mt-0.5">
                    🦉 £{formatMoney(Math.round(data.recovered.total))} recovered by Siki&apos;s chasing
                  </p>
                )}
                {data.ap_reviewed && data.ap_reviewed.confirmed_value > 0 && (
                  <p className="text-[10px] font-medium text-emerald-700 mt-0.5">
                    £{formatMoney(Math.round(data.ap_reviewed.confirmed_value))} confirmed by AP review
                  </p>
                )}
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
        <ul className="mt-2 space-y-1.5" role="list">
          {visibleFindings.map((finding, i) => {
            const asked = askedIds.has(finding.id);
            const chased = chasedIds?.has(finding.id) ?? false;
            const chaseable =
              finding.kind === "overdue_invoice" && !!finding.invoice_number && !!onAutoChase;
            const reviewable = finding.kind.startsWith("ap_") && !!onReview;
            const reviewing = reviewingIds?.has(finding.id) ?? false;
            const reviewState = finding.review?.state ?? "open";
            const confirmedAmount = confirmedAmounts[finding.id] ?? String(finding.amount || "");
            const dismissalReason = dismissalReasons[finding.id] ?? "";
            const sendReview = (
              state: Exclude<FindingReviewState, "open">,
              outcome?: Omit<FindingReviewPayload, "state">,
            ) => onReview?.(finding, state, outcome);
            if (compact) {
              return (
                <li key={finding.id}>
                  <div
                    className={`rounded-lg border p-2 fade-in-up transition-colors ${severityClasses(finding.severity)} ${
                      asked ? "opacity-60" : "hover:border-stone-300"
                    }`}
                    style={{ animationDelay: `${Math.min(i, 8) * 40}ms`}}
                  >
                    <button
                      onClick={() => onAct(finding)}
                      disabled={asked || disabled}
                      className="w-full text-left btn-press disabled:cursor-not-allowed"
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs leading-none" aria-hidden="true">
                          {KIND_ICONS[finding.kind]}
                        </span>
                        <span className="text-[11px] font-semibold text-stone-800 truncate flex-1">
                          {finding.title}
                        </span>
                        {finding.amount > 0 && (
                          <span className="text-[11px] font-bold text-stone-900 shrink-0">
                            £{formatMoney(finding.amount)}
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-stone-500 mt-0.5 truncate">
                        {KIND_LABELS[finding.kind]} · {finding.detail}
                      </p>
                      {finding.memory_action && !asked && (
                        <p className="text-[10px] text-violet-600 mt-0.5 truncate">
                          {finding.memory_action.label}: {finding.memory_action.policy}
                        </p>
                      )}
                      {asked && (
                        <p className="text-[10px] text-stone-400 mt-0.5">✓ Asked</p>
                      )}
                      {reviewState !== "open" && (
                        <p className="text-[10px] text-emerald-700 mt-0.5 capitalize">
                          Review: {reviewState}
                          {finding.review?.confirmed_amount !== undefined
                            ? ` · £${formatMoney(finding.review.confirmed_amount)} confirmed`
                            : ""}
                          {finding.review?.dismissal_reason
                            ? ` · ${finding.review.dismissal_reason}`
                            : ""}
                        </p>
                      )}
                      {finding.evidence?.slice(0, 2).map((evidence) => (
                        <p key={evidence.source_id} className="text-[10px] text-stone-400 mt-0.5 truncate">
                          {evidence.label}: {evidence.detail}
                        </p>
                      ))}
                    </button>
                    {chaseable && (
                      <button
                        onClick={() => onAutoChase!(finding)}
                        disabled={chased || disabled}
                        aria-label={`Schedule automatic follow-ups — ${finding.title}`}
                        title="Schedule escalating follow-up emails; they stop the moment it's paid"
                        className={`mt-1 text-[10px] font-medium px-1.5 py-0.5 rounded btn-press transition-colors disabled:cursor-not-allowed ${
                          chased
                            ? "text-emerald-600 bg-emerald-50"
                            : "text-amber-700 bg-amber-50 hover:bg-amber-100"
                        }`}
                      >
                        {chased ? "✓ Auto-chase on" : "⚡ Auto-chase"}
                      </button>
                    )}
                    {reviewable && (
                      <div className="mt-1 flex items-center gap-1">
                        <button
                          onClick={() => sendReview("safe")}
                          disabled={reviewing || disabled || reviewState === "safe"}
                          className="text-[10px] font-medium px-1.5 py-0.5 rounded text-emerald-700 bg-emerald-50 hover:bg-emerald-100 disabled:cursor-not-allowed"
                        >
                          {reviewState === "safe" ? "✓ Marked safe" : "Mark safe"}
                        </button>
                        <button
                          onClick={() => sendReview("investigating")}
                          disabled={reviewing || disabled || reviewState === "investigating"}
                          className="text-[10px] font-medium px-1.5 py-0.5 rounded text-amber-700 bg-amber-50 hover:bg-amber-100 disabled:cursor-not-allowed"
                        >
                          {reviewState === "investigating" ? "✓ Investigating" : "Investigate"}
                        </button>
                      </div>
                    )}
                  </div>
                </li>
              );
            }
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
                    {KIND_GLOSS[finding.kind] && (
                      <p className="text-[10px] text-stone-400 mt-0.5 italic">
                        {KIND_GLOSS[finding.kind]}
                      </p>
                    )}
                    {finding.evidence && finding.evidence.length > 0 && (
                      <p className="text-[10px] text-stone-400 mt-0.5">
                        {finding.evidence.length} source record{finding.evidence.length === 1 ? "" : "s"} cited
                      </p>
                    )}
                    {reviewState !== "open" && (
                      <p className="text-[10px] text-emerald-700 mt-0.5 capitalize">
                        Review: {reviewState}
                        {finding.review?.confirmed_amount !== undefined
                          ? ` · £${formatMoney(finding.review.confirmed_amount)} confirmed`
                          : ""}
                        {finding.review?.dismissal_reason
                          ? ` · ${finding.review.dismissal_reason}`
                          : ""}
                      </p>
                    )}
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-2 flex-wrap">
                  <button
                    onClick={() => onAct(finding)}
                    disabled={asked || disabled}
                    aria-label={`${finding.action.label} — ${finding.title}`}
                    className={`text-[11px] font-semibold px-2.5 py-1.5 rounded-lg btn-press transition-colors disabled:cursor-not-allowed ${
                      asked
                        ? "bg-stone-100 text-stone-400"
                        : `${theme.btnPrimary} disabled:opacity-50`
                    }`}
                  >
                    {asked
                      ? "✓ Asked"
                      : findingActionLabel(persona, finding.action.label, finding.kind)}
                  </button>
                  {finding.memory_action && (
                    <button
                      onClick={() => onAct(finding)}
                      disabled={asked || disabled}
                      title={finding.memory_action.policy || finding.memory_action.label}
                      aria-label={`${finding.memory_action.label} — ${finding.title}`}
                      className="text-[11px] font-medium px-2 py-1.5 rounded-lg btn-press transition-colors disabled:cursor-not-allowed text-violet-700 bg-violet-50 hover:bg-violet-100"
                    >
                      {finding.memory_action.label}
                    </button>
                  )}
                  {chaseable && (
                    <button
                      onClick={() => onAutoChase!(finding)}
                      disabled={chased || disabled}
                      aria-label={`Schedule automatic follow-ups — ${finding.title}`}
                      title="Schedule escalating follow-up emails; they stop the moment it's paid"
                      className={`text-[11px] font-medium px-2 py-1.5 rounded-lg btn-press transition-colors disabled:cursor-not-allowed ${
                        chased
                          ? "text-emerald-600 bg-emerald-50"
                          : "text-amber-700 bg-amber-50 hover:bg-amber-100"
                      }`}
                    >
                      {chased ? "✓ Auto-chase on" : "⚡ Auto-chase"}
                    </button>
                  )}
                  {reviewable && (
                    <>
                      <button
                        onClick={() => sendReview("safe")}
                        disabled={reviewing || disabled || reviewState === "safe"}
                        className="text-[10px] font-medium px-2 py-1.5 rounded-lg text-emerald-700 bg-emerald-50 hover:bg-emerald-100 disabled:cursor-not-allowed"
                      >
                        {reviewState === "safe" ? "✓ Marked safe" : "Mark safe"}
                      </button>
                      <button
                        onClick={() => sendReview("investigating")}
                        disabled={reviewing || disabled || reviewState === "investigating"}
                        className="text-[10px] font-medium px-2 py-1.5 rounded-lg text-amber-700 bg-amber-50 hover:bg-amber-100 disabled:cursor-not-allowed"
                      >
                        {reviewState === "investigating" ? "✓ Investigating" : "Investigate"}
                      </button>
                      <div className="flex items-center gap-1 rounded-lg bg-white/70 border border-stone-200 p-1">
                        <input
                          value={confirmedAmount}
                          onChange={(event) =>
                            setConfirmedAmounts((prev) => ({
                              ...prev,
                              [finding.id]: event.target.value,
                            }))
                          }
                          inputMode="decimal"
                          aria-label={`Confirmed value for ${finding.title}`}
                          className="w-20 rounded-md border border-stone-200 bg-white px-1.5 py-1 text-[10px] text-stone-700 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                        />
                        <button
                          onClick={() => {
                            const amount = Number.parseFloat(confirmedAmount);
                            sendReview("confirmed", {
                              confirmed_amount: Number.isFinite(amount) ? amount : finding.amount,
                            });
                          }}
                          disabled={reviewing || disabled || reviewState === "confirmed"}
                          className="text-[10px] font-medium px-2 py-1 rounded-md text-emerald-800 bg-emerald-100 hover:bg-emerald-200 disabled:cursor-not-allowed"
                        >
                          {reviewState === "confirmed" ? "✓ Confirmed" : "Confirm"}
                        </button>
                      </div>
                      <div className="flex items-center gap-1 rounded-lg bg-white/70 border border-stone-200 p-1">
                        <input
                          value={dismissalReason}
                          onChange={(event) =>
                            setDismissalReasons((prev) => ({
                              ...prev,
                              [finding.id]: event.target.value,
                            }))
                          }
                          maxLength={120}
                          aria-label={`Dismissal reason for ${finding.title}`}
                          placeholder="Reason"
                          className="w-24 rounded-md border border-stone-200 bg-white px-1.5 py-1 text-[10px] text-stone-700 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-200"
                        />
                        <button
                          onClick={() =>
                            sendReview("dismissed", {
                              dismissal_reason: dismissalReason.trim() || "Reviewed and dismissed",
                            })
                          }
                          disabled={reviewing || disabled || reviewState === "dismissed"}
                          className="text-[10px] font-medium px-2 py-1 rounded-md text-stone-700 bg-stone-100 hover:bg-stone-200 disabled:cursor-not-allowed"
                        >
                          {reviewState === "dismissed" ? "✓ Dismissed" : "Dismiss"}
                        </button>
                      </div>
                    </>
                  )}
                  {asked && (
                    <span className="text-[10px] text-stone-500">In progress — see chat</span>
                  )}
                  {/* Commitment ladder: Save button creates sunk cost.
                      A saved finding persists across sessions, giving the
                      user a reason to return and a sense of ownership. */}
                  {onSave && !asked && (
                    <button
                      onClick={() => onSave(finding)}
                      disabled={disabled || savedIds?.has(finding.id)}
                      aria-label={`Save finding — ${finding.title}`}
                      className="text-[10px] font-medium px-2 py-1.5 rounded-lg transition-colors disabled:cursor-not-allowed text-stone-400 hover:text-stone-600 hover:bg-stone-100"
                    >
                      {savedIds?.has(finding.id) ? "✓ Saved" : "Save"}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
          {compact && hiddenCount > 0 && !expanded && (
            <li>
              <button
                onClick={() => setExpanded(true)}
                className={`w-full text-center text-[10px] font-medium py-1 transition-colors ${theme.findingsExpand}`}
              >
                + {hiddenCount} more finding{hiddenCount > 1 ? "s" : ""}
              </button>
            </li>
          )}
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
