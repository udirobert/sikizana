"use client";

import { useEffect, useRef, useState } from "react";
import type { ContextResult, FindingsResponse } from "@/lib/api";
import { endpoints } from "@/lib/api";
import { getTipsForTool, getPersonalizedInsight, type EduTip } from "@/lib/edu-tips";
import { getPersonaTheme, type Persona } from "@/lib/persona-theme";
import { SikiMascot, ZanaMascot } from "@/components/SikiMascot";

interface WhileAgentWorksProps {
  /** The user's original query — used for Exa search. */
  userQuery: string;
  /** Current tool being executed (drives which tips to show). */
  currentTool: string | null;
  /** Thinking message from the agent loop (e.g. "Auditing books…"). */
  thinkingMessage: string;
  /** Findings data for personalized insights. */
  findings: FindingsResponse | null;
  /** Active persona — mascot + accent on insight strip. */
  persona?: Persona;
  /** Called when HMRC context results are fetched — lets the page
   *  persist them under the agent's response after loading completes. */
  onContextResults?: (results: ContextResult[]) => void;
}

export function WhileAgentWorks({
  userQuery,
  currentTool,
  thinkingMessage,
  findings,
  persona = "siki",
  onContextResults,
}: WhileAgentWorksProps) {
  const theme = getPersonaTheme(persona);
  const [tipIndex, setTipIndex] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [contextResults, setContextResults] = useState<ContextResult[]>([]);
  const [showContext, setShowContext] = useState(false);
  const fetchedRef = useRef<string | null>(null);

  const tips: EduTip[] = currentTool ? getTipsForTool(currentTool) : getTipsForTool("default");
  const currentTip = tips[tipIndex % tips.length];
  const insight = getPersonalizedInsight(findings);

  useEffect(() => {
    const timer = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!userQuery.trim() || fetchedRef.current === userQuery) return;
    fetchedRef.current = userQuery;
    void endpoints
      .contextSearch(userQuery)
      .then((data) => {
        if (data.results.length > 0) {
          setContextResults(data.results);
          onContextResults?.(data.results);
          setTimeout(() => setShowContext(true), 6000);
        }
      })
      .catch(() => {});
  }, [userQuery, onContextResults]);

  useEffect(() => {
    const timer = setInterval(() => setTipIndex((i) => i + 1), 4000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="flex gap-2.5 fade-in-up">
      <div className="shrink-0" aria-hidden="true">
        {persona === "zana" ? (
          <ZanaMascot size={32} mood="look" />
        ) : (
          <SikiMascot size={32} mood="look" />
        )}
      </div>
      <div className="flex-1 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm text-stone-600 t-shimmer">
            {thinkingMessage || "Thinking…"}
          </p>
          <span className="text-[10px] text-stone-400 tabular-nums shrink-0">
            {elapsed}s
          </span>
        </div>

        <div
          key={tipIndex}
          className="text-[11px] text-stone-500 leading-relaxed bg-stone-50 rounded-lg px-3 py-2 fade-in-up"
        >
          <span className="text-stone-400 mr-1">💡</span>
          {currentTip.text}
        </div>

        {insight && (
          <div
            className={`text-[11px] leading-relaxed rounded-lg px-3 py-2 fade-in-up ${theme.insightBox}`}
          >
            <span className={`mr-1 ${theme.insightIcon}`}>📊</span>
            {insight}
          </div>
        )}

        {showContext && contextResults.length > 0 && (
          <div className="text-[11px] leading-relaxed bg-violet-50 rounded-lg px-3 py-2 fade-in-up">
            <p className="text-violet-600 font-medium mb-0.5">
              <span className="mr-1">📖</span>
              Did you know?
            </p>
            {contextResults.slice(0, 1).map((r) => (
              <div key={r.url}>
                <p className="text-violet-800 text-[10px] leading-relaxed">
                  {r.summary || r.snippet}
                </p>
                <a
                  href={r.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-violet-400 hover:text-violet-600 transition-colors text-[9px] mt-0.5 inline-block"
                >
                  Source: {r.title.length > 40 ? r.title.slice(0, 40) + "…" : r.title} ↗
                </a>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
