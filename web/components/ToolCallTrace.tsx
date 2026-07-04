"use client";

import { useEffect, useState } from "react";
import type { ToolCallEvent } from "@/lib/types";

/**
 * ToolCallTrace — shows the agent's tool calls in real-time.
 *
 * This is the "agent transparency" component. As the agent calls Xero
 * tools, they appear here with a spinner while running and a checkmark
 * when done. This makes the agentic reasoning visible to the user.
 */
export function ToolCallTrace({ calls }: { calls: ToolCallEvent[] }) {
  const [visibleCount, setVisibleCount] = useState(0);

  // Stagger the appearance of each tool call
  useEffect(() => {
    if (visibleCount < calls.length) {
      const timer = setTimeout(() => setVisibleCount(visibleCount + 1), 50);
      return () => clearTimeout(timer);
    }
  }, [visibleCount, calls.length]);

  if (calls.length === 0) return null;

  return (
    <div className="flex flex-col gap-1.5 mb-2">
      {calls.slice(0, visibleCount).map((call, i) => (
        <div
          key={i}
          className="flex items-center gap-2.5 px-3 py-2 bg-sky-50/70 border border-sky-100 rounded-lg fade-in-up"
        >
          {/* Status icon */}
          <div className="shrink-0">
            {call.status === "calling" ? (
              <svg className="w-3.5 h-3.5 text-sky-500 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M4 12a8 8 0 018-8" />
              </svg>
            ) : (
              <svg className="w-3.5 h-3.5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            )}
          </div>

          {/* Tool label */}
          <div className="flex-1 min-w-0">
            <span className="text-[11px] font-medium text-sky-800">
              {call.label}
            </span>
            {call.summary && call.status === "done" && (
              <span className="text-[10px] text-stone-500 ml-2 truncate">
                {call.summary}
              </span>
            )}
          </div>

          {/* Xero badge */}
          <span className="text-[9px] font-medium text-sky-600 bg-sky-100 px-1.5 py-0.5 rounded shrink-0">
            Xero
          </span>
        </div>
      ))}
    </div>
  );
}
