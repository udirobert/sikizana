"use client";

import { useEffect, useState } from "react";

/**
 * ProactiveAlert — polls Xero webhook events and shows a toast-style
 * notification when Xero sends a webhook (new invoice, bank transaction,
 * payment, etc.). This is the "Active Arbitrator" pattern: the agent
 * doesn't wait to be asked, it proactively alerts the user.
 */
export function ProactiveAlert() {
  const [events, setEvents] = useState<
    Array<{ message: string; timestamp: string; id: string }>
  >([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  useEffect(() => {
    let since = 0;
    let active = true;

    const poll = async () => {
      // Skip hidden tabs — webhook alerts aren't sub-minute urgent, and a
      // backgrounded tab polling forever is pure waste.
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
    // Catch up promptly when the user returns to the tab.
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
          className="bg-white border border-sky-200 rounded-xl shadow-lg p-3 flex items-start gap-3 fade-in-up"
        >
          <div className="w-8 h-8 bg-sky-50 rounded-lg flex items-center justify-center shrink-0">
            <svg
              className="w-4 h-4 text-sky-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
              />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-stone-800">{evt.message}</p>
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
