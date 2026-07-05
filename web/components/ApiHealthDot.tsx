"use client";

import { useBackendHealth } from "@/hooks/useBackendHealth";

/**
 * Live backend + Xero connection indicator.
 * Green dot + "Live · <tenant>" when connected to a real org,
 * amber "Demo data" when the backend is simulating, red "Offline" when down.
 * Shows nothing during the initial probe to avoid layout flicker.
 */
export function ApiHealthDot({ className = "" }: { className?: string }) {
  const { healthy, xeroStatus } = useBackendHealth();
  if (healthy === null) return null;

  const isLive =
    healthy && (xeroStatus?.mode === "live-oauth" || xeroStatus?.mode === "live-cli");

  let dotClass = "bg-red-500 animate-pulse";
  let label = "Offline";
  if (healthy && isLive) {
    dotClass = "bg-emerald-500";
    label = xeroStatus?.tenant_name ? `Live · ${xeroStatus.tenant_name}` : "Live";
  } else if (healthy) {
    dotClass = "bg-amber-500";
    label = "Demo data";
  }

  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotClass}`} />
      <span>{label}</span>
    </span>
  );
}
