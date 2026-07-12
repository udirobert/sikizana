"use client";

import { useState } from "react";
import type { MemoryRecallData } from "@/lib/types";
import { getPersonaCopy, type Persona } from "@/lib/persona-theme";
import { SikiMascot, ZanaMascot } from "@/components/SikiMascot";
import { endpoints } from "@/lib/api";

interface MemoryRecallTraceProps {
  data: MemoryRecallData;
  persona?: Persona;
}

function isProactiveAlert(data: MemoryRecallData): boolean {
  return data.sources.some((s) => s.label.toLowerCase().includes("proactive"));
}

/**
 * MemoryRecallTrace — shows what Supermemory recalled before the agent responded.
 * Proactive memory alerts get a distinct "Siki noticed" banner so the user sees
 * the memory layer driving value, not just passive recall. Each remembered item
 * can also be forgotten directly from the chat.
 */
export function MemoryRecallTrace({ data, persona = "siki" }: MemoryRecallTraceProps) {
  const [expanded, setExpanded] = useState(false);
  const [forgottenIds, setForgottenIds] = useState<Set<string>>(new Set());
  const copy = getPersonaCopy(persona);

  if (!data.facts.length) return null;

  const isProactive = isProactiveAlert(data);

  const handleForget = async (id: string) => {
    if (!id) return;
    try {
      await endpoints.memory.delete(id);
      setForgottenIds((prev) => new Set(prev).add(id));
    } catch {
      // best-effort
    }
  };

  if (isProactive) {
    const firstId = data.sources[0]?.ids?.[0];
    if (firstId && forgottenIds.has(firstId)) return null;
    return (
      <div className="mb-2 fade-in-up">
        <div className="flex items-start gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
          <div className="shrink-0 mt-0.5">
            {persona === "zana" ? (
              <ZanaMascot size={28} mood="look" />
            ) : (
              <SikiMascot size={28} mood="look" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-semibold text-amber-700 uppercase tracking-wide">
              {copy.name} noticed
            </p>
            <p className="text-[12px] text-amber-900 leading-relaxed mt-0.5">
              {data.facts[0]}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <span className="text-[9px] font-medium text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">
              memory
            </span>
            {firstId && (
              <button
                onClick={() => handleForget(firstId)}
                className="text-[10px] text-amber-600 hover:text-red-600 px-1 py-0.5 rounded hover:bg-amber-100 transition"
                title="Forget this memory"
              >
                Forget
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-2 fade-in-up">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 px-3 py-1.5 bg-violet-50/80 border border-violet-100 rounded-lg w-full text-left transition-colors hover:bg-violet-50"
      >
        <svg
          className="w-3.5 h-3.5 text-violet-500 shrink-0"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
          />
        </svg>

        <span className="text-[11px] font-medium text-violet-800 flex-1">
          {expanded ? copy.memoryRecallExpanded : copy.memoryRecallCompact(data.facts.length)}
        </span>

        <span className="text-[9px] font-medium text-violet-600 bg-violet-100 px-1.5 py-0.5 rounded shrink-0">
          memory
        </span>

        <svg
          className={`w-3 h-3 text-violet-400 transition-transform shrink-0 ${expanded ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded && (
        <div className="mt-1 px-3 py-2.5 bg-violet-50/50 border border-violet-100 rounded-lg space-y-2.5 fade-in-up">
          {data.sources.map((source, i) => (
            <div key={i}>
              <p className="text-[10px] font-semibold text-violet-700 uppercase tracking-wide mb-1">
                {source.label}
              </p>
              <ul className="space-y-1">
                {source.items.map((item, j) => {
                  const id = source.ids?.[j];
                  if (id && forgottenIds.has(id)) return null;
                  return (
                    <li
                      key={j}
                      className="text-[11px] text-violet-900 leading-relaxed flex items-start gap-1.5"
                    >
                      <span className="text-violet-400 shrink-0 mt-0.5">•</span>
                      <span className="flex-1">{item}</span>
                      {id && (
                        <button
                          onClick={() => handleForget(id)}
                          className="text-[10px] text-violet-400 hover:text-red-500 px-1 rounded hover:bg-violet-100 transition"
                          title="Forget this memory"
                        >
                          Forget
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
