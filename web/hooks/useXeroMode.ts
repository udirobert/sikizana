"use client";

import { useEffect, useState } from "react";
import { endpoints, type XeroMode } from "@/lib/api";

/**
 * Shared hook for detecting demo vs. live mode.
 * Any page that displays financial data should use this to determine
 * whether to show a "sample data" indicator.
 *
 * Returns:
 *   - "demo" | "live-oauth" | "live-cli" when loaded
 *   - "unknown" while loading
 *   - isDemo: boolean (true when mode === "demo")
 *   - isLive: boolean (true when mode is live-oauth or live-cli)
 */
export function useXeroMode() {
  const [mode, setMode] = useState<XeroMode | "unknown">("unknown");

  useEffect(() => {
    void endpoints.xero
      .status()
      .then((s) => setMode(s.mode))
      .catch(() => setMode("unknown"));
  }, []);

  const isDemo = mode === "demo";
  const isLive = mode === "live-oauth" || mode === "live-cli";

  return { mode, isDemo, isLive };
}
