/** Shared “where you sit vs typical” logic for /check, /b snapshots, and chat cards. */

export type MetricTone = "band" | "above" | "below" | "risk";

export const METRIC_TONE_CLASSES: Record<MetricTone, { text: string; dot: string }> = {
  band: { text: "text-emerald-700", dot: "bg-emerald-500" },
  above: { text: "text-sky-700", dot: "bg-sky-500" },
  below: { text: "text-amber-700", dot: "bg-amber-500" },
  risk: { text: "text-rose-700", dot: "bg-rose-500" },
};

export const METRIC_STATUS_LABEL: Record<MetricTone, string> = {
  band: "In band",
  above: "Above typical",
  below: "Below typical",
  risk: "Well off typical",
};

export function compareMetricTone(opts: {
  typical: number;
  value: number;
  range?: [number, number];
  nearBand?: number;
}): MetricTone {
  const { typical, value, range, nearBand = 4 } = opts;
  if (range) {
    const [lo, hi] = range;
    if (value >= lo && value <= hi) return "band";
    return value > hi ? "above" : "below";
  }
  const diff = value - typical;
  if (Math.abs(diff) <= nearBand) return "band";
  return diff > 0 ? "above" : "below";
}

export function scaleCap(
  typical: number,
  yours: number | null,
  range?: [number, number],
  unit?: string,
): number {
  if (unit === "%") {
    return Math.max(100, yours ?? 0, range?.[1] ?? 0, typical);
  }
  return Math.max(typical * 1.35, range ? range[1] * 1.15 : 0, yours ?? 0, 1);
}

export type BenchmarkMetricInput = {
  shortLabel: string;
  typical: number;
  value: number | null;
  range?: [number, number];
  nearBand?: number;
};

/** One-sentence Siki read: outlier only. Null when nothing has been typed. */
export function synthesizeBenchmarkRead(
  metrics: BenchmarkMetricInput[],
  sectorLabel: string,
): string | null {
  const filled = metrics.filter((m): m is BenchmarkMetricInput & { value: number } => m.value !== null);
  if (filled.length === 0) return null;

  const outliers = filled.filter((m) => compareMetricTone(m) !== "band");
  if (outliers.length === 0) {
    return `You're in the typical ${sectorLabel.toLowerCase()} shape.`;
  }
  if (outliers.length === 1) {
    const o = outliers[0];
    const tone = compareMetricTone(o);
    const dir = tone === "above" ? "high" : "low";
    return `${o.shortLabel} is ${dir} vs typical — the thing I'd look at first.`;
  }
  const names = outliers.map((o) => o.shortLabel);
  if (names.length === 2) {
    return `${names[0]} and ${names[1]} sit off typical — I'd start there.`;
  }
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]} sit off typical — I'd start with those.`;
}

export function verdictToTone(verdict: string): MetricTone {
  const key = verdict.replace(/ /g, "_").toUpperCase();
  if (key === "SIGNIFICANTLY_WORSE") return "risk";
  if (key === "WORSE") return "below";
  if (key === "BETTER") return "above";
  return "band";
}
