"use client";

import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import { SikiMascot } from "@/components/SikiMascot";
import { getSectorTips } from "@/lib/sector-tips";
import type { SectorId } from "@/lib/sector-benchmarks";
import type { SectorTip } from "@/lib/sector-tips";

const ROTATION_KEY = "sikizana.sector-note.rotation";
const ROTATION_SECTOR_KEY = "sikizana.sector-note.sector";

/**
 * Siki's sector note — a single ambient tip in the /books sidebar.
 *
 * Shows one tip per visit and rotates on subsequent visits (DESIGN.md
 * "Sector intelligence tips": sidebar = 1 tip per visit, rotates). State is
 * kept in localStorage keyed by sector + rotation index so repeat visitors
 * discover new tips without re-seeing the same one.
 */
export function SectorNoteCard({ sector }: { sector: SectorId }) {
  const [tip, setTip] = useState<SectorTip | null>(null);

  useEffect(() => {
    const tips = getSectorTips(sector, "sidebar");
    if (tips.length === 0) return;

    const readKey = (key: string): number | null => {
      try {
        const raw = localStorage.getItem(key);
        return raw === null ? null : Number(raw);
      } catch {
        return null;
      }
    };
    const readSector = (): string | null => {
      try {
        return localStorage.getItem(ROTATION_SECTOR_KEY);
      } catch {
        return null;
      }
    };

    const lastIndex = readKey(ROTATION_KEY);
    const lastSector = readSector();

    // First visit for this sector → tip 0. Returning visitor → advance one.
    const next =
      lastSector === sector && lastIndex !== null
        ? (lastIndex + 1) % tips.length
        : 0;

    setTip(tips[next]);

    try {
      localStorage.setItem(ROTATION_KEY, String(next));
      localStorage.setItem(ROTATION_SECTOR_KEY, sector);
    } catch {
      /* storage unavailable — tip still shows, rotation just won't persist */
    }
  }, [sector]);

  if (!tip) return null;

  return (
    <div className="rounded-xl border border-emerald-200 bg-gradient-to-br from-emerald-50/50 to-white p-3.5">
      <div className="flex items-start gap-2.5">
        <SikiMascot size={24} mood="look" />
        <div className="min-w-0">
          <p className="text-[9px] font-semibold uppercase tracking-wide text-emerald-700">
            Siki&rsquo;s sector note
          </p>
          <p className="mt-0.5 text-xs font-semibold text-stone-900 leading-snug">
            {tip.topic}
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-stone-600">
            {tip.summary}
          </p>
          {tip.sourceLabel && (
            <p className="mt-1.5 text-[10px]">
              {tip.sourceUrl ? (
                <a
                  href={tip.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-semibold text-emerald-700 underline-offset-2 transition hover:text-emerald-800 hover:underline"
                >
                  {tip.sourceLabel}
                  <ExternalLink className="h-2.5 w-2.5" />
                </a>
              ) : (
                <span className="font-semibold text-emerald-700">{tip.sourceLabel}</span>
              )}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}