"use client";

/**
 * AnalysisCard — renders structured analysis data from three tools:
 * - get_sector_benchmarks → BenchmarkCard (comparison bars)
 * - score_customers → CustomerScorecard (colored ratings)
 * - get_trend_analysis → TrendChart (sparklines + trend arrows)
 *
 * Parses the ANALYSIS_DATA...END_ANALYSIS_DATA block from the agent's
 * response, same pattern as JournalEntryCard and NegotiationEmailCard.
 */

interface BenchmarkMetric {
  label: string;
  user_value: number | null;
  sector_value: number;
  unit: string;
  verdict: string;
}

interface BenchmarkData {
  type: "sector_benchmark";
  sector: string;
  source: string;
  metrics: BenchmarkMetric[];
  chasing_threshold_days: number;
}

interface CustomerScore {
  name: string;
  rating: string;
  on_time_rate: number;
  avg_days_late: number;
  total_invoices: number;
  total_revenue: number;
  outstanding: number;
  chasing_cost: number;
  interest_lost: number;
  total_cost: number;
  fire_recommendation: boolean;
}

interface ScorecardData {
  type: "customer_scorecard";
  customers: CustomerScore[];
  portfolio: {
    total_revenue: number;
    total_cost: number;
    red_count: number;
    fire_count: number;
  };
}

interface TrendMetric {
  label: string;
  key: string;
  values: number[];
  first: number;
  latest: number;
  trend: string;
}

interface TrendData {
  type: "trend_analysis";
  snapshot_count: number;
  metrics: TrendMetric[];
}

type AnalysisData = BenchmarkData | ScorecardData | TrendData;

export function parseAnalysisData(text: string): AnalysisData | null {
  const marker = text.indexOf("ANALYSIS_DATA");
  if (marker === -1) return null;
  const endMarker = text.indexOf("END_ANALYSIS_DATA", marker);
  if (endMarker === -1) return null;
  const jsonStr = text.slice(marker + "ANALYSIS_DATA".length, endMarker).trim();
  try {
    return JSON.parse(jsonStr) as AnalysisData;
  } catch {
    return null;
  }
}

const VERDICT_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  BETTER: { bg: "bg-emerald-100", text: "text-emerald-700", label: "Better" },
  IN_LINE: { bg: "bg-sky-100", text: "text-sky-700", label: "In line" },
  WORSE: { bg: "bg-amber-100", text: "text-amber-700", label: "Worse" },
  SIGNIFICANTLY_WORSE: { bg: "bg-rose-100", text: "text-rose-700", label: "Much worse" },
  N_A: { bg: "bg-stone-100", text: "text-stone-500", label: "N/A" },
};

function fmtMoney(v: number): string {
  return "£" + v.toLocaleString("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function fmtMoney2(v: number): string {
  return "£" + v.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ─── Benchmark Card ──────────────────────────────────────────────────

function BenchmarkCard({ data }: { data: BenchmarkData }) {
  return (
    <div className="mt-2 rounded-xl border border-stone-200 bg-white overflow-hidden fade-in-up">
      <div className="px-3 py-2.5 border-b border-stone-100 bg-stone-50/50">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-sky-100 text-sky-700">
            📊 Sector Benchmark
          </span>
          <span className="text-[10px] font-medium text-stone-600">{data.sector}</span>
          <span className="text-[9px] text-stone-400">
            {data.source === "live_ons" ? "live ONS data" : "curated averages"}
          </span>
        </div>
      </div>
      <div className="px-3 py-2.5 space-y-2.5">
        {data.metrics.map((m) => {
          const verdictKey = m.verdict.replace(/ /g, "_").toUpperCase();
          const style = VERDICT_STYLES[verdictKey] || VERDICT_STYLES.N_A;
          const userStr = m.user_value !== null ? `${m.user_value}${m.unit === "£" ? "" : m.unit === "%" ? "%" : ""}` : "N/A";
          const sectorStr = `${m.unit === "£" ? "£" : ""}${m.sector_value}${m.unit === "days" ? " days" : m.unit === "%" ? "%" : ""}`;
          // Bar width: user value relative to sector average (capped at 200%)
          const barWidth = m.user_value !== null && m.sector_value > 0
            ? Math.min((m.user_value / m.sector_value) * 100, 200)
            : 100;
          return (
            <div key={m.label}>
              <div className="flex items-center justify-between text-[10px] mb-1">
                <span className="font-medium text-stone-700">{m.label}</span>
                <span className={`font-semibold px-1.5 py-0.5 rounded ${style.bg} ${style.text}`}>
                  {style.label}
                </span>
              </div>
              <div className="flex items-center gap-2 text-[10px]">
                <div className="flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-stone-500 w-12 shrink-0">You:</span>
                    <div className="flex-1 h-3 bg-stone-100 rounded-full overflow-hidden relative">
                      <div
                        className={`h-full rounded-full ${style.bg}`}
                        style={{ width: `${Math.min(barWidth, 100)}%` }}
                      />
                    </div>
                    <span className="font-semibold text-stone-700 w-16 text-right shrink-0">
                      {m.unit === "£" ? fmtMoney(m.user_value || 0) : userStr}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-stone-400 w-12 shrink-0">Sector:</span>
                    <div className="flex-1 h-3 bg-stone-50 rounded-full overflow-hidden relative">
                      <div className="h-full bg-stone-200 rounded-full" style={{ width: "50%" }} />
                    </div>
                    <span className="text-stone-500 w-16 text-right shrink-0">{sectorStr}</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="px-3 py-2 border-t border-stone-100 bg-stone-50/50">
        <p className="text-[10px] text-stone-500">
          Sector chasing threshold: <span className="font-medium text-stone-700">{data.chasing_threshold_days} days</span>
        </p>
      </div>
    </div>
  );
}

// ─── Customer Scorecard ──────────────────────────────────────────────

const RATING_STYLES: Record<string, { dot: string; bg: string; text: string }> = {
  RED: { dot: "bg-rose-500", bg: "bg-rose-50", text: "text-rose-700" },
  AMBER: { dot: "bg-amber-500", bg: "bg-amber-50", text: "text-amber-700" },
  GREEN: { dot: "bg-emerald-500", bg: "bg-emerald-50", text: "text-emerald-700" },
};

function CustomerScorecard({ data }: { data: ScorecardData }) {
  return (
    <div className="mt-2 rounded-xl border border-stone-200 bg-white overflow-hidden fade-in-up">
      <div className="px-3 py-2.5 border-b border-stone-100 bg-stone-50/50">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-violet-100 text-violet-700">
            👥 Customer Scorecard
          </span>
          <span className="text-[10px] text-stone-500">
            {data.portfolio.red_count} red · {data.portfolio.fire_count} firing candidates
          </span>
        </div>
      </div>
      <div className="divide-y divide-stone-100">
        {data.customers.map((c) => {
          const style = RATING_STYLES[c.rating] || RATING_STYLES.GREEN;
          return (
            <div key={c.name} className={`px-3 py-2.5 ${c.fire_recommendation ? style.bg + " bg-opacity-30" : ""}`}>
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${style.dot}`} />
                  <span className="text-xs font-semibold text-stone-900 truncate">{c.name}</span>
                </div>
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${style.bg} ${style.text} shrink-0`}>
                  {c.rating}
                </span>
              </div>
              <div className="grid grid-cols-4 gap-2 text-[10px]">
                <div>
                  <p className="text-stone-400">On-time</p>
                  <p className="font-semibold text-stone-700">{c.on_time_rate}%</p>
                </div>
                <div>
                  <p className="text-stone-400">Avg late</p>
                  <p className="font-semibold text-stone-700">{c.avg_days_late}d</p>
                </div>
                <div>
                  <p className="text-stone-400">Revenue</p>
                  <p className="font-semibold text-stone-700">{fmtMoney(c.total_revenue)}</p>
                </div>
                <div>
                  <p className="text-stone-400">Cost</p>
                  <p className="font-semibold text-stone-700">{fmtMoney(c.total_cost)}</p>
                </div>
              </div>
              {c.fire_recommendation && (
                <p className="text-[10px] text-rose-600 mt-1.5 font-medium">
                  ⚠️ Firing candidate — cost exceeds 10% of revenue
                </p>
              )}
            </div>
          );
        })}
      </div>
      <div className="px-3 py-2.5 border-t border-stone-100 bg-stone-50/50">
        <div className="grid grid-cols-3 gap-2 text-[10px]">
          <div>
            <p className="text-stone-400">Total revenue</p>
            <p className="font-semibold text-stone-700">{fmtMoney(data.portfolio.total_revenue)}</p>
          </div>
          <div>
            <p className="text-stone-400">Total cost</p>
            <p className="font-semibold text-stone-700">{fmtMoney(data.portfolio.total_cost)}</p>
          </div>
          <div>
            <p className="text-stone-400">Cost %</p>
            <p className="font-semibold text-stone-700">
              {data.portfolio.total_revenue > 0
                ? ((data.portfolio.total_cost / data.portfolio.total_revenue) * 100).toFixed(1) + "%"
                : "N/A"}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Trend Chart ─────────────────────────────────────────────────────

const TREND_STYLES: Record<string, { icon: string; text: string }> = {
  IMPROVING: { icon: "↓", text: "text-emerald-600" },
  WORSENING: { icon: "↑", text: "text-rose-600" },
  STABLE: { icon: "→", text: "text-stone-500" },
};

function Sparkline({ values, trend }: { values: number[]; trend: string }) {
  if (values.length < 2) return null;
  const max = Math.max(...values, 0.001);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const width = 60;
  const height = 20;
  const points = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * width;
      const y = height - ((v - min) / range) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const strokeColor = trend === "IMPROVING" ? "#059669" : trend === "WORSENING" ? "#e11d48" : "#78716c";
  return (
    <svg width={width} height={height} className="shrink-0">
      <polyline
        fill="none"
        stroke={strokeColor}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  );
}

function TrendChart({ data }: { data: TrendData }) {
  return (
    <div className="mt-2 rounded-xl border border-stone-200 bg-white overflow-hidden fade-in-up">
      <div className="px-3 py-2.5 border-b border-stone-100 bg-stone-50/50">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-indigo-100 text-indigo-700">
            📈 Trend Analysis
          </span>
          <span className="text-[10px] text-stone-500">
            {data.snapshot_count} snapshots over time
          </span>
        </div>
      </div>
      <div className="divide-y divide-stone-100">
        {data.metrics.map((m) => {
          const style = TREND_STYLES[m.trend] || TREND_STYLES.STABLE;
          const isMoney = m.key === "total_overdue" || m.key === "total_revenue";
          const isPct = m.key === "overdue_rate" || m.key === "net_margin";
          const fmtVal = (v: number) => {
            if (isMoney) return fmtMoney2(v);
            if (isPct) return (v * 100).toFixed(1) + "%";
            if (m.key === "avg_receivables_days") return Math.round(v) + "d";
            return Math.round(v).toString();
          };
          return (
            <div key={m.key} className="px-3 py-2.5 flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-[10px] text-stone-500">{m.label}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs font-semibold text-stone-700">{fmtVal(m.latest)}</span>
                  <span className={`text-[10px] font-medium ${style.text}`}>
                    {style.icon} {m.trend.toLowerCase()}
                  </span>
                </div>
              </div>
              <Sparkline values={m.values} trend={m.trend} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────

interface AnalysisCardProps {
  data: AnalysisData;
}

export function AnalysisCard({ data }: AnalysisCardProps) {
  if (data.type === "sector_benchmark") {
    return <BenchmarkCard data={data} />;
  }
  if (data.type === "customer_scorecard") {
    return <CustomerScorecard data={data} />;
  }
  if (data.type === "trend_analysis") {
    return <TrendChart data={data} />;
  }
  return null;
}
