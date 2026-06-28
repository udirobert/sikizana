"use client";

import { useEffect, useState } from "react";
import { endpoints } from "@/lib/api";
import type { RevenueSummary } from "@/lib/api";

/**
 * Polls /api/revenue so the header badge stays current.
 */
export function useRevenue(intervalMs = 15_000) {
  const [revenue, setRevenue] = useState<RevenueSummary | null>(null);

  useEffect(() => {
    let cancelled = false;

    const fetch_ = async () => {
      try {
        const data = await endpoints.revenue();
        if (!cancelled) setRevenue(data);
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

  return revenue;
}
