"use client";

import { useEffect, useState } from "react";
import { endpoints } from "@/lib/api";
import type { ImpactMetrics } from "@/lib/api";

/**
 * Polls /api/impact for live impact metrics (money found, discrepancies, tax).
 * Used by the homepage stats and the /impact page.
 */
export function useImpactMetrics(intervalMs = 30_000) {
  const [metrics, setMetrics] = useState<ImpactMetrics | null>(null);

  useEffect(() => {
    let cancelled = false;

    const fetch_ = async () => {
      try {
        const data = await endpoints.impact();
        if (!cancelled) setMetrics(data);
      } catch {
        // Non-critical; keep previous value silently.
      }
    };

    fetch_();
    const id = setInterval(fetch_, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [intervalMs]);

  return metrics;
}
