"use client";

import { useEffect, useState } from "react";
import { endpoints } from "@/lib/api";

/**
 * Polls the backend /health endpoint and exposes a `healthy` boolean so the
 * UI can surface a clear "API offline" indicator instead of failing silently.
 */
export function useBackendHealth(intervalMs = 30_000) {
  const [healthy, setHealthy] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      try {
        const res = await endpoints.health();
        if (!cancelled) setHealthy(res.status === "healthy");
      } catch {
        if (!cancelled) setHealthy(false);
      }
    };

    check();
    const id = setInterval(check, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [intervalMs]);

  return { healthy };
}
