"use client";

import { useEffect, useState } from "react";
import { endpoints, type XeroStatus } from "@/lib/api";

/**
 * Polls the backend /health endpoint and exposes a `healthy` boolean so the
 * UI can surface a clear "API offline" indicator instead of failing silently.
 * Also polls /api/xero/status so the indicator can say whether we're talking
 * to a real Xero org (live-oauth / live-cli) or simulated demo data.
 */
export function useBackendHealth(intervalMs = 30_000) {
  const [healthy, setHealthy] = useState<boolean | null>(null);
  const [xeroStatus, setXeroStatus] = useState<XeroStatus | null>(null);
  const [supermemory, setSupermemory] = useState<boolean>(false);

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      try {
        const res = await endpoints.health();
        if (!cancelled) {
          setHealthy(res.status === "healthy");
          setSupermemory(res.supermemory ?? false);
        }
      } catch {
        if (!cancelled) setHealthy(false);
        return; // backend down — status fetch would fail too
      }
      try {
        const status = await endpoints.xero.status();
        if (!cancelled) setXeroStatus(status);
      } catch {
        if (!cancelled) setXeroStatus(null);
      }
    };

    check();
    const id = setInterval(check, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [intervalMs]);

  return { healthy, xeroStatus, supermemory };
}
