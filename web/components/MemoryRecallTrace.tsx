"use client";

import { useState } from "react";
import type { MemoryRecallData } from "@/lib/types";

/**
 * MemoryRecallTrace — shows what Supermemory recalled before the agent responded.
 *
 * This is the "memory transparency" component. When Supermemory returns past
 * context (customer patterns, chasing outcomes, user preferences), it appears
 * here as a collapsible panel above the agent's response — making the invisible
 * memory layer visible to the user and to hackathon judges.
 *
 * Appears with a brief brain/sparkle icon and "Recalling past conversations…"
 * label, then expands to show the specific facts recalled.
 */
export function MemoryRecallTrace({ data }: { data: MemoryRecallData }) {
  const [expanded, setExpanded] = useState(false);

  if (!data.facts.length) return null;

  return (
    <div className="mb-2 fade-in-up">
      {/* Compact bar — always visible when memory was recalled */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 px-3 py-1.5 bg-violet-50/80 border border-violet-100 rounded-lg w-full text-left transition-colors hover:bg-violet-50"
      >
        {/* Brain icon */}
        <svg
          className="w-3.5 h-3.5 text-violet-500 shrink-0"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
          />
        </svg>

        <span className="text-[11px] font-medium text-violet-800 flex-1">
          {expanded ? "What Siki remembered" : `Recalled ${data.facts.length} ${data.facts.length === 1 ? "memory" : "memories"} from past sessions`}
        </span>

        {/* Supermemory badge */}
        <span className="text-[9px] font-medium text-violet-600 bg-violet-100 px-1.5 py-0.5 rounded shrink-0">
          memory
        </span>

        {/* Expand/collapse chevron */}
        <svg
          className={`w-3 h-3 text-violet-400 transition-transform shrink-0 ${expanded ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Expanded panel — shows the recalled facts grouped by source */}
      {expanded && (
        <div className="mt-1 px-3 py-2.5 bg-violet-50/50 border border-violet-100 rounded-lg space-y-2.5 fade-in-up">
          {data.sources.map((source, i) => (
            <div key={i}>
              <p className="text-[10px] font-semibold text-violet-700 uppercase tracking-wide mb-1">
                {source.label}
              </p>
              <ul className="space-y-1">
                {source.items.map((item, j) => (
                  <li
                    key={j}
                    className="text-[11px] text-violet-900 leading-relaxed flex items-start gap-1.5"
                  >
                    <span className="text-violet-400 shrink-0 mt-0.5">•</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
