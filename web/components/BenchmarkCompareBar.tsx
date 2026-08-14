import {
  METRIC_TONE_CLASSES,
  scaleCap,
  type MetricTone,
} from "@/lib/benchmark-compare";

/**
 * Zone B proof: typical tick + optional range band + yours marker.
 * Shared by /check, margin snapshots, and chat sector-benchmark cards.
 */
export function BenchmarkCompareBar({
  typical,
  yours,
  range,
  tone,
  unit,
}: {
  typical: number;
  yours: number | null;
  range?: [number, number];
  tone: MetricTone | null;
  unit?: string;
}) {
  const cap = scaleCap(typical, yours, range, unit);
  const pos = (v: number) => Math.min(100, Math.max(0, (v / cap) * 100));
  const dotColor = tone ? METRIC_TONE_CLASSES[tone].dot : "bg-stone-400";

  return (
    <div className="relative mt-2.5 h-2 rounded-full bg-stone-100" aria-hidden>
      {range && (
        <span
          className="absolute top-0 h-full rounded-full bg-emerald-100"
          style={{ left: `${pos(range[0])}%`, width: `${Math.max(0, pos(range[1]) - pos(range[0]))}%` }}
        />
      )}
      <span
        className="absolute top-1/2 h-3.5 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-stone-500 ring-1 ring-white"
        style={{ left: `${pos(typical)}%` }}
      />
      {yours !== null && (
        <span
          className={`absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-white ${dotColor} transition-colors duration-150`}
          style={{ left: `${pos(yours)}%` }}
        />
      )}
    </div>
  );
}
