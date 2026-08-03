"use client";

import Link from "next/link";
import { useBackendHealth } from "@/hooks/useBackendHealth";

/**
 * MemoryBadge — shows whether Siki's memory store is connected.
 *
 * "Memory: ON" (violet) when the memory backend is up and the agent has
 * persistent cross-session memory. "Memory: OFF" (grey) when the store is
 * unreachable — the app still works, just without memory.
 */
export function MemoryBadge({ className = "" }: { className?: string }) {
  const { memory } = useBackendHealth();

  return (
    <Link
      href="/memory"
      className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full transition-colors ${
        memory
          ? "bg-violet-100 text-violet-700 hover:bg-violet-200"
          : "bg-stone-100 text-stone-400 hover:bg-stone-200"
      } ${memory ? "ring-2 ring-violet-200/50" : ""} ${className}`}
      title={
        memory
          ? "Memory is stored locally — click to see what Siki remembers"
          : "Memory is not available — click to learn more"
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
      <span>{memory ? "Memory: ON" : "Memory: OFF"}</span>
    </Link>
  );
}
