"use client";

import Link from "next/link";
import { SkeletonReveal } from "@/components/SkeletonReveal";
import { TodaySummary } from "@/components/TodaySummary";
import { FindingsPanel } from "@/components/FindingsPanel";
import { ProfitTrendChart } from "@/components/ProfitTrendChart";
import { SectorNoteCard } from "@/components/SectorNoteCard";
import type { XeroMode } from "@/lib/api";
import type { SectorId } from "@/lib/sector-benchmarks";
import type { Persona, getPersonaTheme } from "@/lib/persona-theme";
import type {
  FindingsPanelProps,
  MetricSnapshot,
  OrgData,
  ProfitAndLossData,
} from "./types";

export interface BooksSidebarProps {
  xeroMode: XeroMode | "unknown";
  provenance: string;
  orgData: OrgData | null;
  pnLoading: boolean;
  profitAndLoss: ProfitAndLossData | null;
  metricSnapshots: MetricSnapshot[];
  showWelcome: boolean;
  theme: ReturnType<typeof getPersonaTheme>;
  copy: { memoryLink: string; activityLink: string };
  sector: string | null;
  persona: Persona;
  findingsLoading: boolean;
  isLoading: boolean;
  onReviewPriority: FindingsPanelProps["onAct"];
  findingsPanel: FindingsPanelProps;
}

/** Desktop sidebar — org header, P&L, sector note, findings. The mobile
    card reuses the same `findingsPanel` prop bundle so the two surfaces
    share one data path. */
export function BooksSidebar({
  xeroMode,
  provenance,
  orgData,
  pnLoading,
  profitAndLoss,
  metricSnapshots,
  showWelcome,
  theme,
  copy,
  sector,
  persona,
  findingsLoading,
  isLoading,
  onReviewPriority,
  findingsPanel,
}: BooksSidebarProps) {
  return (
    <aside className="hidden lg:flex flex-col w-72 lg:h-[78vh] [&>*]:shrink-0 bg-white rounded-2xl shadow-sm border border-stone-200 p-4 gap-3 overflow-y-auto scroll-thin">
      {/* Org header — skeleton uses SkeletonReveal for consistency */}
      <div className="pb-3 border-b border-stone-100">
        <div className="flex items-center gap-2 mb-1">
          <h2 className="text-xs font-bold text-stone-900 uppercase tracking-wide">
            Finance check
          </h2>
          {xeroMode !== "unknown" && (
            <span
              className={`text-[9px] font-medium px-1.5 py-0.5 rounded ${
                xeroMode === "live-oauth" || xeroMode === "live-cli"
                  ? "bg-emerald-50 text-emerald-600"
                  : "bg-amber-50 text-amber-600"
              }`}
            >
              {xeroMode === "live-oauth" || xeroMode === "live-cli"
                ? "LIVE"
                : provenance === "sandbox"
                  ? "SANDBOX"
                  : "DEMO"}
            </span>
          )}
        </div>
        <SkeletonReveal isLoading={!orgData} className="h-[40px]" skeletonClassName="rounded-md">
          {orgData && (
            <div>
              <p className="text-sm font-semibold text-stone-800">{orgData.name}</p>
              <p className="text-xs text-stone-500 mt-0.5">
                {orgData.baseCurrency} · {orgData.countryCode}
                {orgData.taxNumber ? ` · VAT: ${orgData.taxNumber}` : ""}
              </p>
            </div>
          )}
        </SkeletonReveal>
      </div>

      <TodaySummary
        data={findingsPanel.data}
        loading={findingsLoading}
        persona={persona}
        disabled={isLoading}
        onReviewPriority={onReviewPriority}
      />

      {/* P&L Summary — with contextual hint for first-time users */}
      <div>
        <div className="flex items-center gap-1 mb-1.5">
          <span className="text-xs uppercase tracking-wide text-stone-500 font-semibold">
            Profit &amp; Loss
          </span>
          {showWelcome && (
            <span className={`text-[9px] ${theme.hintText} font-medium`}>← your money at a glance</span>
          )}
        </div>
        <SkeletonReveal
          isLoading={pnLoading}
          className="h-[120px]"
          skeletonClassName="rounded-xl"
        >
          {profitAndLoss && (
            <div className="bg-stone-50 border border-stone-200 rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-stone-500">This month</span>
                <span className="text-xs text-stone-500">
                  as of {new Date(profitAndLoss.reportDate || profitAndLoss.toDate || "").toLocaleDateString("en-GB", { month: "short", day: "numeric" })}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="text-xs text-stone-500">Revenue</div>
                  <div className="text-sm font-bold text-emerald-700">
                    £{(profitAndLoss.revenue ?? profitAndLoss.rows?.filter(r => r.value > 0).reduce((s, r) => s + r.value, 0) ?? 0).toLocaleString(undefined, { minimumFractionDigits: 0 })}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-stone-500">Expenses</div>
                  <div className="text-sm font-bold text-red-600">
                    £{Math.abs(profitAndLoss.expenses ?? profitAndLoss.rows?.filter(r => r.value < 0).reduce((s, r) => s + r.value, 0) ?? 0).toLocaleString(undefined, { minimumFractionDigits: 0 })}
                  </div>
                </div>
              </div>
              <div className="pt-2 border-t border-stone-200">
                <div className="text-xs text-stone-500">Net Profit</div>
                <div className="text-lg font-bold text-stone-900">
                  £{profitAndLoss.netProfit.toLocaleString(undefined, { minimumFractionDigits: 0 })}
                </div>
              </div>
              <ProfitTrendChart snapshots={metricSnapshots} className="pt-2 mt-2" />
            </div>
          )}
        </SkeletonReveal>
      </div>

      {/* Siki's sector note — ambient, one rotating tip per visit */}
      {sector && <SectorNoteCard sector={sector as SectorId} />}

      {/* Findings — the structured audit replaces the old Health Check +
          Needs Attention + Action Center trio. One source of truth,
          shared with the mobile panel. Compact enough for the sidebar. */}
      <div className="flex-1">
        <div className="flex items-center gap-1 mb-1.5">
          <span className="text-xs uppercase tracking-wide text-stone-500 font-semibold">
            Findings
          </span>
          {showWelcome && (
            <span className={`text-[9px] ${theme.hintText} font-medium`}>← things to fix</span>
          )}
        </div>
        <FindingsPanel {...findingsPanel} compact />
      </div>

      <div className="border-t border-stone-100 pt-3 mt-auto space-y-1.5">
        <Link href="/memory" className={`block text-xs text-violet-500 hover:text-violet-700 transition-colors`}>
          {copy.memoryLink}
        </Link>
        <Link href="/activity" className={`block text-xs text-stone-500 hover:text-stone-700 transition-colors`}>
          {copy.activityLink}
        </Link>
      </div>
    </aside>
  );
}
