"use client";

import { useBackendHealth } from "@/hooks/useBackendHealth";

/**
 * Live backend health indicator. Green dot when reachable, red when down.
 * Shows nothing during the initial probe to avoid layout flicker.
 */
export function ApiHealthDot() {
  const { healthy } = useBackendHealth();
  if (healthy === null) return null;

  return (
    <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-stone-50">
      <span
        className={`w-1.5 h-1.5 rounded-full ${
          healthy ? "bg-emerald-500" : "bg-red-500 animate-pulse"
        }`}
      />
      <span className="text-[10px] font-medium text-stone-600">
        {healthy ? "API Live" : "API Offline"}
      </span>
    </div>
  );
}
