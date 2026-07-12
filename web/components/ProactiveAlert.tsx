"use client";

import { useEffect, useState } from "react";
import { SikiMascot, ZanaMascot } from "@/components/SikiMascot";
import { getPersonaTheme, type Persona } from "@/lib/persona-theme";

interface ProactiveAlertProps {
  persona?: Persona;
}

/**
 * ProactiveAlert — polls Xero webhook events and shows a toast-style
 * notification when Xero sends a webhook (new invoice, bank transaction,
 * payment, etc.). This is the "Active Arbitrator" pattern: the agent
 * doesn't wait to be asked, it proactively alerts the user.
 */
export function ProactiveAlert({ persona = "siki" }: ProactiveAlertProps) {
  const theme = getPersonaTheme(persona);
  const [events, setEvents] = useState<
    Array<{ message: string; timestamp: string; id: string }>
  >([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  useEffect(() => {
    let since = 0;
    let active = true;

    const poll = async () => {
      if (!active || document.visibilityState === "hidden") return;
      try {
        const { endpoints } = await import("@/lib/api");
        const data = await endpoints.xero.webhookEvents(since);
        if (data.events.length > 0 && active) {
          const newEvents = data.events.map((e, i) => ({
            message: e.message,
            timestamp: e.timestamp,
            id: `${data.total - data.events.length + i}_${e.timestamp}`,
          }));
          setEvents((prev) => [...prev, ...newEvents]);
          since = data.total;
        }
      } catch {
        // Silently ignore — webhook polling is best-effort
      }
    };

    poll();
    const interval = setInterval(poll, 30_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void poll();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      active = false;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  const visible = events.filter((e) => !dismissed.has(e.id));
  if (visible.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 space-y-2 max-w-sm">
      {visible.slice(-3).map((evt) => (
        <div
          key={evt.id}
          className={`bg-white border rounded-xl shadow-lg p-3 flex items-start gap-3 fade-in-up ${theme.toastBorder}`}
          role="status"
        >
          <div
            className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${theme.toastIconBg}`}
            aria-hidden="true"
          >
            {persona === "zana" ? (
              <ZanaMascot size={28} mood="look" />
            ) : (
              <SikiMascot size={28} mood="look" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-semibold text-stone-500 uppercase tracking-wide">
              {theme.proactiveLabel}
            </p>
            <p className="text-xs font-medium text-stone-800 mt-0.5">{evt.message}</p>
            <p className="text-[10px] text-stone-400 mt-0.5">
              {new Date(evt.timestamp).toLocaleTimeString()}
            </p>
          </div>
          <button
            onClick={() =>
              setDismissed((prev) => new Set([...prev, evt.id]))
            }
            className="text-stone-300 hover:text-stone-500 btn-press shrink-0"
            aria-label="Dismiss"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
}
