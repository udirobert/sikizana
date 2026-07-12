"use client";

import { useMemo } from "react";
import type { FindingsResponse } from "@/lib/api";
import { getResponseSummaryCopy, type Persona } from "@/lib/persona-theme";

/**
 * ResponseSummary — the "peak-end" card shown after the agent responds.
 *
 * Behavioral principle: peak-end rule. People judge experiences by their
 * peak moment and their ending. The agent's text response is the peak;
 * this card is the end — a clean, satisfying close that feels like progress.
 *
 * Shows: issues found · money at stake · action recommended
 * Only appears when there are findings to summarize.
 */
interface ResponseSummaryProps {
  findings: FindingsResponse | null;
  /** Whether the agent is currently streaming. */
  isStreaming: boolean;
  persona?: Persona;
}

export function ResponseSummary({
  findings,
  isStreaming,
  persona = "siki",
}: ResponseSummaryProps) {
  const copy = getResponseSummaryCopy(persona);

  const summary = useMemo(() => {
    if (!findings || findings.clean) return null;

    const parts: string[] = [];
    if (findings.counts.overdue > 0) {
      parts.push(`${findings.counts.overdue} overdue`);
    }
    if (findings.counts.unreconciled > 0) {
      parts.push(`${findings.counts.unreconciled} unreconciled`);
    }
    if (findings.counts.tax_flags > 0) {
      parts.push(`${findings.counts.tax_flags} tax flag${findings.counts.tax_flags === 1 ? "" : "s"}`);
    }
    if (parts.length === 0) return null;

    return {
      issues: parts.join(" · "),
      money: findings.money_found,
      total: findings.findings.length,
      highCount: findings.findings.filter((f) => f.severity === "high").length,
    };
  }, [findings]);

  if (!summary || isStreaming) return null;

  return (
    <div className={`mt-2 rounded-xl border p-3 fade-in-up ${copy.panelClass}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-stone-400 mb-1">
            {copy.label}
          </p>
          <p className="text-xs text-stone-700 font-medium">{summary.issues}</p>
          {summary.highCount > 0 && (
            <p className={`text-[10px] mt-0.5 ${persona === "zana" ? "text-rose-600" : "text-amber-600"}`}>
              {copy.urgentLine(summary.highCount)}
            </p>
          )}
        </div>
        {summary.money > 0 && (
          <div className="text-right shrink-0">
            <div className="text-lg font-bold text-stone-900 leading-none">
              £{Math.round(summary.money).toLocaleString()}
            </div>
            <div className="text-[9px] text-stone-500 mt-0.5">{copy.atStake}</div>
          </div>
        )}
      </div>
    </div>
  );
}
