"use client";

/**
 * DemoBadge — a small, consistent indicator for demo/sample data.
 * Use anywhere financial data is shown that could be confused as real.
 *
 * Props:
 *   - size: "xs" (default) or "sm"
 *   - label: override the default "Sample data" text
 */
interface DemoBadgeProps {
  size?: "xs" | "sm";
  label?: string;
}

export function DemoBadge({ size = "xs", label = "Sample data" }: DemoBadgeProps) {
  const sizeClasses =
    size === "sm"
      ? "text-[10px] px-2 py-0.5"
      : "text-[9px] px-1.5 py-0.5";
  return (
    <span
      className={`inline-flex items-center gap-1 font-medium rounded ${sizeClasses} bg-amber-50 text-amber-700 border border-amber-200`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
      {label}
    </span>
  );
}

/**
 * LiveBadge — green indicator for real, connected data.
 */
export function LiveBadge({ size = "xs", label = "Live" }: DemoBadgeProps) {
  const sizeClasses =
    size === "sm"
      ? "text-[10px] px-2 py-0.5"
      : "text-[9px] px-1.5 py-0.5";
  return (
    <span
      className={`inline-flex items-center gap-1 font-medium rounded ${sizeClasses} bg-emerald-50 text-emerald-700 border border-emerald-200`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
      {label}
    </span>
  );
}

/**
 * ModeBadge — shows DemoBadge or LiveBadge based on isDemo flag.
 */
export function ModeBadge({
  isDemo,
  size = "xs",
}: {
  isDemo: boolean;
  size?: "xs" | "sm";
}) {
  return isDemo ? (
    <DemoBadge size={size} />
  ) : (
    <LiveBadge size={size} />
  );
}
