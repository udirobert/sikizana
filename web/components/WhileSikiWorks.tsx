"use client";

import { useEffect, useRef, useState } from "react";
import type { ContextResult, FindingsResponse } from "@/lib/api";
import { endpoints } from "@/lib/api";
import { getTipsForTool, getPersonalizedInsight, type EduTip } from "@/lib/edu-tips";

/**
 * WhileSikiWorks — replaces the plain "Thinking…" spinner with a rotating
 * stream of educational content, personalized insights, and live HMRC
 * guidance. Turns dead wait time into value delivery.
 *
 * Three layers:
 * 1. Curated tips relevant to the current tool call (rotates every 4s)
 * 2. Personalized insight from the user's findings data (static per session)
 * 3. Live HMRC content from Exa search (fetched once per query)
 */

interface WhileSikiWorksProps {
  /** The user's original query — used for Exa search. */
  userQuery: string;
  /** Current tool being executed (drives which tips to show). */
  currentTool: string | null;
  /** Thinking message from the agent loop (e.g. "Auditing books…"). */
  thinkingMessage: string;
  /** Findings data for personalized insights. */
  findings: FindingsResponse | null;
}

export function WhileSikiWorks({
  userQuery,
  currentTool,
  thinkingMessage,
  findings,
}: WhileSikiWorksProps) {
  const [tipIndex, setTipIndex] = useState(0);
  const [contextResults, setContextResults] = useState<ContextResult[]>([]);
  const [showContext, setShowContext] = useState(false);
  const fetchedRef = useRef<string | null>(null);

  // Layer 1: Rotate through tips relevant to the current tool
  const tips: EduTip[] = currentTool ? getTipsForTool(currentTool) : getTipsForTool("default");
  const currentTip = tips[tipIndex % tips.length];

  // Layer 2: Personalized insight from findings
  const insight = getPersonalizedInsight(findings);

  // Layer 3: Fetch live HMRC content once per query
  useEffect(() => {
    if (!userQuery.trim() || fetchedRef.current === userQuery) return;
    fetchedRef.current = userQuery;
    void endpoints
      .contextSearch(userQuery)
      .then((data) => {
        if (data.results.length > 0) {
          setContextResults(data.results);
          // Show context after a brief delay so the tips get seen first
          setTimeout(() => setShowContext(true), 6000);
        }
      })
      .catch(() => {});
  }, [userQuery]);

  // Rotate tips every 4 seconds
  useEffect(() => {
    const timer = setInterval(() => setTipIndex((i) => i + 1), 4000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="flex gap-2.5 fade-in-up">
      <div className="shrink-0">
        <span className="thinking-pulse" />
      </div>
      <div className="flex-1 space-y-2">
        {/* Status line — what Siki is doing right now */}
        <p className="text-sm text-stone-600 t-shimmer">
          {thinkingMessage || "Thinking…"}
        </p>

        {/* Layer 1: Rotating educational tip */}
        <div
          key={tipIndex}
          className="text-[11px] text-stone-500 leading-relaxed bg-stone-50 rounded-lg px-3 py-2 fade-in-up"
        >
          <span className="text-stone-400 mr-1">💡</span>
          {currentTip.text}
        </div>

        {/* Layer 2: Personalized insight (shown once, doesn't rotate) */}
        {insight && (
          <div className="text-[11px] text-sky-700 leading-relaxed bg-sky-50 rounded-lg px-3 py-2 fade-in-up">
            <span className="text-sky-400 mr-1">📊</span>
            {insight}
          </div>
        )}

        {/* Layer 3: Live HMRC content from Exa + Firecrawl */}
        {showContext && contextResults.length > 0 && (
          <div className="text-[11px] leading-relaxed bg-violet-50 rounded-lg px-3 py-2 fade-in-up">
            <p className="text-violet-600 font-medium mb-1">
              <span className="mr-1">🔗</span>
              Relevant HMRC guidance
            </p>
            {contextResults.slice(0, 2).map((r) => (
              <div key={r.url} className="mb-1.5 last:mb-0">
                {/* Deep content from Firecrawl — the actual guidance text */}
                {r.deep_content && (
                  <p className="text-violet-800 text-[10px] leading-relaxed mb-1 italic">
                    &ldquo;{r.deep_content}&rdquo;
                  </p>
                )}
                <a
                  href={r.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-violet-700 hover:text-violet-900 transition-colors font-medium underline"
                >
                  {r.title}
                </a>
                {!r.deep_content && r.snippet && (
                  <span className="text-violet-500 block text-[10px] mt-0.5 line-clamp-2">
                    {r.snippet}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
