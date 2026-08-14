"use client";

import { useState } from "react";
import { ArrowUpRight, ChevronDown, ExternalLink } from "lucide-react";
import { SikiMascot } from "@/components/SikiMascot";
import { getSectorBenchmark } from "@/lib/sector-benchmarks";
import { getSectorTips } from "@/lib/sector-tips";
import type { SectorId } from "@/lib/sector-benchmarks";
import type { SectorTip } from "@/lib/sector-tips";

/**
 * Turn a tip into a natural question Siki can answer in chat.
 * Seeds the composer — the user still hits send, so it feels like a
 * conversation, not a popup.
 */
function askPrompt(tip: SectorTip, sectorLabel: string): string {
  return `I run a ${sectorLabel.toLowerCase()} business \u2014 talk me through "${tip.topic.toLowerCase()}": how should I apply this to my books?`;
}

/**
 * Siki knows — an on-demand sector knowledge bank in the /books chat
 * empty state. Shows the FULL methodology (tip.body) — the "chat" phase
 * of the sector-intelligence layer. Collapsible, not pushed; the user
 * opens it and can seed a follow-up question to Siki from any tip.
 *
 * See DESIGN.md "Sector intelligence tips (mascot knowledge layer)".
 */
export function SectorChatKnows({
  sector,
  onAsk,
}: {
  sector: SectorId;
  onAsk: (question: string) => void;
}) {
  const tips = getSectorTips(sector, "chat");
  const [open, setOpen] = useState(false);
  const sectorLabel = getSectorBenchmark(sector)?.label ?? sector;

  if (tips.length === 0) return null;

  return (
    <div className="w-full max-w-sm mt-6">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-start justify-between gap-3 rounded-2xl border border-emerald-200 bg-white p-4 text-left shadow-sm transition hover:shadow-md"
      >
        <div className="flex items-start gap-2.5">
          <SikiMascot size={28} mood="look" />
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
              Siki knows
            </p>
            <p className="text-sm font-semibold text-stone-900">
              Benchmarking your {sectorLabel.toLowerCase()} business
            </p>
            <p className="mt-0.5 text-[11px] text-stone-500">
              {tips.length} free methods &amp; sources — read or ask me
            </p>
          </div>
        </div>
        <ChevronDown
          className={`mt-1 h-4 w-4 shrink-0 text-stone-400 transition-transform duration-150 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open && (
        <div className="mt-2 space-y-2.5">
          {tips.map((t) => (
            <div key={t.id} className="rounded-xl border border-stone-200 bg-white p-3.5">
              <p className="text-xs font-semibold text-stone-900">{t.topic}</p>
              <p className="mt-1 text-[11px] leading-relaxed text-stone-600">{t.body}</p>
              {t.sourceLabel && (
                <p className="mt-1.5 text-[10px]">
                  {t.sourceUrl ? (
                    <a
                      href={t.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 font-semibold text-emerald-700 underline-offset-2 transition hover:text-emerald-800 hover:underline"
                    >
                      {t.sourceLabel}
                      <ExternalLink className="h-2.5 w-2.5" />
                    </a>
                  ) : (
                    <span className="font-semibold text-emerald-700">{t.sourceLabel}</span>
                  )}
                </p>
              )}
              <button
                type="button"
                onClick={() => onAsk(askPrompt(t, sectorLabel))}
                className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-sky-700 underline-offset-2 transition hover:text-sky-800 hover:underline"
              >
                Ask Siki about this
                <ArrowUpRight className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}