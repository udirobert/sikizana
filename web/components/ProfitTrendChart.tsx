"use client";

import { Sparkline } from "@/components/dither-kit/sparkline";
import type { DitherColor } from "@/components/dither-kit/palette";
import { getTrendBuildingCopy } from "@/lib/persona-theme";

export interface MetricSnapshot {
  captured_at: string;
  total_revenue: number;
  net_margin: number;
  total_overdue: number;
}

interface ProfitTrendChartProps {
  snapshots: MetricSnapshot[];
  /** Which series to plot — net margin % or revenue £ */
  metric?: "net_margin" | "total_revenue";
  className?: string;
}

function trendColor(values: number[]): DitherColor {
  if (values.length < 2) return "grey";
  const delta = values[values.length - 1] - values[0];
  if (delta > 0.001) return "green";
  if (delta < -0.001) return "red";
  return "grey";
}

function TrendBuildingState({
  snapshotCount,
  metric,
  className,
}: {
  snapshotCount: number;
  metric: "net_margin" | "total_revenue";
  className?: string;
}) {
  const copy = getTrendBuildingCopy(snapshotCount);
  const label = metric === "net_margin" ? "Net margin trend" : "Revenue trend";

  return (
    <div className={className}>
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <span className="text-[10px] text-stone-500">{label}</span>
        <span className="text-[10px] font-medium text-stone-400 tabular-nums">
          {snapshotCount === 0 ? "—" : `${snapshotCount} snap${snapshotCount === 1 ? "" : "s"}`}
        </span>
      </div>
      <div className="rounded-lg border border-dashed border-stone-200 bg-stone-50/80 px-2.5 py-2">
        <p className="text-[10px] font-semibold text-stone-600">{copy.title}</p>
        <p className="text-[9px] text-stone-400 mt-0.5 leading-relaxed">{copy.body}</p>
      </div>
    </div>
  );
}

/**
 * Sidebar P&L trend — a calm dither sparkline over stored metric snapshots.
 * Shows an honest building state when fewer than two points exist.
 */
export function ProfitTrendChart({
  snapshots,
  metric = "net_margin",
  className,
}: ProfitTrendChartProps) {
  const values =
    metric === "net_margin"
      ? snapshots.map((s) => Math.round(s.net_margin * 1000) / 10)
      : snapshots.map((s) => s.total_revenue);

  if (values.length < 2) {
    return (
      <TrendBuildingState
        snapshotCount={snapshots.length}
        metric={metric}
        className={className}
      />
    );
  }

  const latest = values[values.length - 1];
  const label = metric === "net_margin" ? "Net margin trend" : "Revenue trend";
  const latestLabel =
    metric === "net_margin"
      ? `${latest.toFixed(1)}%`
      : `£${Math.round(latest).toLocaleString("en-GB")}`;

  return (
    <div className={className}>
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <span className="text-[10px] text-stone-500">{label}</span>
        <span className="text-[10px] font-semibold text-stone-700 tabular-nums">{latestLabel}</span>
      </div>
      <div className="h-10 rounded-lg bg-stone-100/80 border border-stone-200/60 overflow-hidden">
        <Sparkline
          data={values}
          color={trendColor(values)}
          bloom="low"
          bloomOnHover
          animate
          className="h-full w-full"
        />
      </div>
      <p className="text-[9px] text-stone-400 mt-1">
        {snapshots.length} daily snapshots · updated as your books change
      </p>
    </div>
  );
}
