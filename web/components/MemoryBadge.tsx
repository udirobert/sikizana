"use client";

import { useBackendHealth } from "@/hooks/useBackendHealth";

/**
 * MemoryBadge — shows whether Supermemory Local is connected.
 *
 * "Memory: ON" (violet) when Supermemory is running and the agent has
 * persistent cross-session memory. "Memory: OFF" (grey) when it's not
 * configured or unreachable — the app still works, just without memory.
 *
 * This makes the Supermemory integration visible at a glance and makes
 * the graceful-degradation demo self-evident: kill the server, the badge
 * flips to OFF, and the audience understands what just happened.
 */
export function MemoryBadge({ className = "" }: { className?: string }) {
  const { supermemory } = useBackendHealth();

  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full transition-colors ${
        supermemory
          ? "bg-violet-100 text-violet-700"
          : "bg-stone-100 text-stone-400"
      } ${className}`}
      title={
        supermemory
          ? "Supermemory Local is connected — the agent remembers across sessions"
          : "Supermemory is not connected — the agent works without memory"
      }
    >
      {/* Brain icon */}
      <svg
        className="w-2.5 h-2.5"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2.5}
          d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
        />
      </svg>
      <span>{supermemory ? "Memory: ON" : "Memory: OFF"}</span>
    </span>
  );
}
