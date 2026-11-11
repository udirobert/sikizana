"use client";

import type { Finding, XeroMode } from "@/lib/api";
import type { getPersonaTheme } from "@/lib/persona-theme";

export interface FinanceCheckHandoffProps {
  open: boolean;
  finding: Finding | undefined;
  provenance: string;
  platformName: string;
  xeroMode: XeroMode | "unknown";
  seapointOffered: boolean;
  sandboxSwitching: boolean;
  theme: ReturnType<typeof getPersonaTheme>;
  isLoading: boolean;
  onConnectSandbox: () => void;
  onReview: (finding: Finding) => void;
  onViewAll: () => void;
}

/** Landing-page handoff: a focused first check rather than an empty
    conversation. It deliberately reuses the canonical finding and its
    server-supplied action, so demo and live books follow one lifecycle. */
export function FinanceCheckHandoff({
  open,
  finding,
  provenance,
  platformName,
  xeroMode,
  seapointOffered,
  sandboxSwitching,
  theme,
  isLoading,
  onConnectSandbox,
  onReview,
  onViewAll,
}: FinanceCheckHandoffProps) {
  if (!open || !finding) return null;

  const evidence = finding.evidence?.slice(0, 2) ?? [];
  const amount = finding.amount
    ? `£${finding.amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
    : null;

  return (
    <section className="w-full border-b border-stone-200 bg-white px-4 py-5">
      <div className="mx-auto grid max-w-6xl gap-5 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
            {provenance === "sandbox"
              ? `Your ${platformName} sandbox check`
              : xeroMode === "demo"
                ? "Your sample finance check"
                : "Your finance check"}
          </p>
          <h2 className="mt-1 text-2xl font-bold tracking-tight text-stone-950">
            Start with the issue that needs attention.
          </h2>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-stone-600">
            Sikizana has ranked this first because it is material, actionable, and linked to the records behind it.
          </p>
          {provenance === "sample" && seapointOffered && (
            <div className="mt-3">
              <button
                onClick={onConnectSandbox}
                disabled={sandboxSwitching}
                className={`text-xs font-semibold px-4 py-2 rounded-lg ${theme.btnPrimary} btn-press transition-colors disabled:opacity-50`}
              >
                {sandboxSwitching ? "Connecting…" : "Try it on the Seapoint sandbox"}
              </button>
              <p className="mt-1 text-xs text-stone-500">
                Read-only · dummy data · nothing is written
              </p>
            </div>
          )}
        </div>

        <div className="border-y border-stone-200 py-4 lg:border-l lg:border-y-0 lg:pl-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-stone-400">Detected</p>
              <p className="mt-1 text-sm font-bold text-stone-950">{finding.title}</p>
              <p className="mt-1 text-xs leading-relaxed text-stone-600">{finding.detail}</p>
            </div>
            {amount && (
              <p className="text-xl font-bold text-stone-950">{amount}</p>
            )}
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <div className="border-l-2 border-sky-300 pl-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-stone-400">Evidence</p>
              {evidence.length > 0 ? (
                evidence.map((ev) => (
                  <p key={ev.source_id} className="mt-1 text-xs leading-relaxed text-stone-700">
                    <span className="font-semibold">{ev.label}</span> · {ev.detail}
                  </p>
                ))
              ) : (
                <p className="mt-1 text-xs leading-relaxed text-stone-700">
                  The source record is available in the findings panel and chat review.
                </p>
              )}
            </div>
            <div className="border-l-2 border-emerald-300 pl-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-stone-400">Next step</p>
              <p className="mt-1 text-xs leading-relaxed text-stone-700">Review the evidence, then decide whether to chase, investigate, or dismiss it.</p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              onClick={() => {
                onReview(finding);
                onViewAll();
              }}
              disabled={isLoading}
              className={`text-xs font-semibold px-4 py-2 rounded-lg ${theme.btnPrimary} btn-press transition-colors disabled:opacity-50`}
            >
              Review this finding
            </button>
            <button
              onClick={onViewAll}
              className="text-xs font-medium text-stone-500 transition-colors hover:text-stone-800"
            >
              View all findings
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
