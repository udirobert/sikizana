"use client";

import { AreaChart } from "@/components/dither-kit/area-chart";
import { Area } from "@/components/dither-kit/area";
import { Grid } from "@/components/dither-kit/grid";
import { XAxis } from "@/components/dither-kit/x-axis";
import { YAxis } from "@/components/dither-kit/y-axis";
import { Tooltip } from "@/components/dither-kit/tooltip";
import type { DitherColor } from "@/components/dither-kit/palette";
import type { MetricSnapshot } from "@/components/ProfitTrendChart";
import { SikiMascot, type MascotMood } from "@/components/SikiMascot";
import { getTrendBuildingCopy } from "@/lib/persona-theme";

type ChartRow = { label: string; overdue: number };

function formatShortDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  } catch {
    return iso.slice(0, 10);
  }
}

function fmtAxis(v: number): string {
  if (v >= 1_000_000) return `£${(v / 1_000_000).toFixed(1)}m`;
  if (v >= 1_000) return `£${Math.round(v / 1_000)}k`;
  return `£${Math.round(v)}`;
}

function fmtTooltip(v: number): string {
  return `£${Math.round(v).toLocaleString("en-GB")}`;
}

function trendColor(rows: ChartRow[]): DitherColor {
  if (rows.length < 2) return "grey";
  const delta = rows[rows.length - 1].overdue - rows[0].overdue;
  if (delta < -0.01) return "green";
  if (delta > 0.01) return "orange";
  return "blue";
}

/** Illustrative downward trend for demo mode before real snapshots exist. */
function demoTrend(currentOverdue: number): ChartRow[] {
  const anchor = currentOverdue > 0 ? currentOverdue : 14_200;
  const labels = ["4 wks", "3 wks", "2 wks", "Last wk", "Today"];
  const factors = [1.35, 1.22, 1.12, 1.05, 1];
  return labels.map((label, i) => ({
    label,
    overdue: Math.round(anchor * factors[i]),
  }));
}

function sikiTrendCaption(
  useSample: boolean,
  deltaPct: number
): { mood: MascotMood; text: string } {
  if (useSample) {
    return {
      mood: "wave",
      text: "This is what getting paid faster looks like — connect Xero and I'll track your real numbers.",
    };
  }
  if (deltaPct < -5) {
    return {
      mood: "celebrate",
      text: "Overdue's coming down. Keep chasing and we'll shrink this line further.",
    };
  }
  if (deltaPct > 5) {
    return {
      mood: "look",
      text: "Overdue's creeping up. Open Sikizana and I'll chase your oldest invoices.",
    };
  }
  return {
    mood: "idle",
    text: "Holding steady for now. I snapshot your books daily so we spot shifts early.",
  };
}

interface ImpactHeroChartProps {
  snapshots: MetricSnapshot[];
  isDemo: boolean;
  currentOverdue: number;
}

/**
 * Impact page hero — dithered area chart of overdue exposure over time.
 * Uses real snapshots when available; demo mode shows a labeled sample curve.
 */
export function ImpactHeroChart({ snapshots, isDemo, currentOverdue }: ImpactHeroChartProps) {
  const fromSnapshots: ChartRow[] = snapshots.map((s) => ({
    label: formatShortDate(s.captured_at),
    overdue: s.total_overdue,
  }));

  const useSample = fromSnapshots.length < 2 && isDemo;
  const rows = useSample ? demoTrend(currentOverdue) : fromSnapshots;
  const color = trendColor(rows);

  if (rows.length < 2) {
    const building = getTrendBuildingCopy(fromSnapshots.length);
    return (
      <section className="mb-8 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm fade-in-up">
        <div className="flex items-start gap-3">
          <SikiMascot size={48} mood="wave" />
          <div>
            <h3 className="text-sm font-bold text-stone-900">Overdue exposure trend</h3>
            <p className="text-xs text-stone-500 mt-1">
              {fromSnapshots.length > 0
                ? `${fromSnapshots.length} snapshot${fromSnapshots.length === 1 ? "" : "s"} captured`
                : "No snapshots yet"}
            </p>
            <p className="text-sm text-stone-500 mt-2 leading-relaxed">
              {building.body}
            </p>
          </div>
        </div>
      </section>
    );
  }

  const latest = rows[rows.length - 1].overdue;
  const first = rows[0].overdue;
  const deltaPct = first > 0 ? Math.round(((latest - first) / first) * 100) : 0;
  const deltaLabel =
    deltaPct === 0
      ? "Flat over the period"
      : deltaPct < 0
        ? `${Math.abs(deltaPct)}% lower than the start of the window`
        : `${deltaPct}% higher than the start of the window`;
  const caption = sikiTrendCaption(useSample, deltaPct);

  return (
    <section className="mb-8 rounded-2xl border border-stone-200 bg-white shadow-sm overflow-hidden fade-in-up">
      <div className="px-5 pt-5 pb-1 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-stone-900">Overdue exposure over time</h3>
          <p className="text-xs text-stone-500 mt-1">
            {useSample
              ? "Illustrative trend — connect Xero to track your real numbers"
              : `${rows.length} daily snapshots · ${deltaLabel}`}
          </p>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-wide text-stone-500 font-semibold">
            Current overdue
          </div>
          <div className="text-xl font-bold text-stone-900 tabular-nums">{fmtTooltip(latest)}</div>
        </div>
      </div>

      <div className="h-52 sm:h-60 px-1 pb-2 text-stone-500">
        <AreaChart
          data={rows}
          config={{
            overdue: { label: "Overdue", color },
          }}
          bloom="low"
          bloomOnHover
          animate
          className="h-full w-full"
          margins={{ top: 10, right: 12, bottom: 30, left: 48 }}
        >
          <Grid horizontal strokeDasharray="2 4" />
          <Area dataKey="overdue" variant="gradient" />
          <XAxis dataKey="label" maxTicks={6} />
          <YAxis tickFormatter={fmtAxis} tickCount={4} />
          <Tooltip labelKey="label" valueFormatter={fmtTooltip} variant="frosted-glass" />
        </AreaChart>
      </div>

      <div className="mx-5 mb-4 mt-1 flex items-start gap-3 rounded-xl bg-stone-50 border border-stone-100 px-3 py-2.5">
        <SikiMascot size={36} mood={caption.mood} />
        <p className="text-xs text-stone-600 leading-relaxed pt-1">{caption.text}</p>
      </div>
    </section>
  );
}
