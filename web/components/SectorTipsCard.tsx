"use client";

import { useState } from "react";
import { ChevronDown, ExternalLink } from "lucide-react";
import { SikiMascot } from "@/components/SikiMascot";
import type { SectorTip } from "@/lib/sector-tips";

/**
 * Siki knows — a collapsible card of sector-specific, Siki-voice tips.
 *
 * First slice surface: the QuickCheck post-findings handoff. Per DESIGN.md
 * "Sector intelligence tips", it must be collapsible (no content shift) and
 * shown only after findings are reviewed — never during.
 */
export function SectorTipsCard({
  tips,
  sectorLabel,
}: {
  tips: SectorTip[];
  sectorLabel: string;
}) {
  const [open, setOpen] = useState(false);
  if (tips.length === 0) return null;

  return (
    <div className="overflow-hidden rounded-xl border border-emerald-200 bg-gradient-to-br from-emerald-50/60 to-white fade-in-up">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-start justify-between gap-3 px-4 py-4 text-left"
      >
        <div className="flex items-start gap-2.5">
          <SikiMascot size={30} mood="look" />
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
              Siki knows
            </p>
            <p className="text-sm font-semibold text-stone-900">
              Want to dig deeper into {sectorLabel.toLowerCase()}?
            </p>
            <p className="mt-0.5 text-[11px] text-stone-500">
              {tips.length} free {tips.length === 1 ? "source" : "sources"} to benchmark your business
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
        <div className="mx-4 mb-4 space-y-3 border-t border-emerald-100 pt-3">
          {tips.map((t) => (
            <div key={t.id}>
              <p className="text-xs font-semibold text-stone-800">{t.topic}</p>
              <p className="mt-1 text-xs leading-relaxed text-stone-600">{t.summary}</p>
              {t.sourceLabel && (
                <p className="mt-1.5 text-[11px]">
                  {t.sourceUrl ? (
                    <a
                      href={t.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 font-semibold text-emerald-700 underline-offset-2 transition hover:text-emerald-800 hover:underline"
                    >
                      {t.sourceLabel}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : (
                    <span className="font-semibold text-emerald-700">{t.sourceLabel}</span>
                  )}
                </p>
              )}
            </div>
          ))}
          <p className="pt-1 text-[10px] text-stone-400">
            Public sources only — point-in-time, not a peer dataset.
          </p>
        </div>
      )}
    </div>
  );
}