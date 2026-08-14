"use client";

import { useEffect, useRef, useState } from "react";

export interface TraceStep {
  text: string;
  /** How long this step takes to "complete" (ms). Default 600. */
  durationMs?: number;
}

type StepState = "pending" | "running" | "done";

/**
 * ThinkingTrace — animated agent-reasoning indicator.
 *
 * Shows 2–5 lines of simulated agent steps, revealed one at a time.
 * Supports early completion: when `forceComplete` flips to true, all
 * remaining steps are marked done immediately (honest trace — doesn't
 * pad time when the API responds fast).
 *
 * Zone A component (Siki voice, persona accent allowed).
 */
export function ThinkingTrace({
  steps,
  forceComplete = false,
  onComplete,
  className = "",
}: {
  steps: TraceStep[];
  /** When true, instantly complete all remaining steps. */
  forceComplete?: boolean;
  /** Called when all steps finish (naturally or forced). */
  onComplete?: () => void;
  className?: string;
}) {
  const [stepStates, setStepStates] = useState<StepState[]>(() =>
    steps.map((_, i) => (i === 0 ? "running" : "pending")),
  );
  const completedRef = useRef(false);

  // Natural progression
  useEffect(() => {
    if (forceComplete) return; // don't run timers if already force-completing

    let cancelled = false;
    let timeout: ReturnType<typeof setTimeout>;

    const advance = (index: number) => {
      if (cancelled) return;

      setStepStates((prev) => {
        const next = [...prev];
        next[index] = "done";
        if (index + 1 < steps.length) next[index + 1] = "running";
        return next;
      });

      if (index + 1 < steps.length) {
        const delay = steps[index + 1].durationMs ?? 600;
        timeout = setTimeout(() => advance(index + 1), delay);
      } else {
        timeout = setTimeout(() => {
          if (!cancelled && !completedRef.current) {
            completedRef.current = true;
            onComplete?.();
          }
        }, 200);
      }
    };

    const firstDelay = steps[0]?.durationMs ?? 600;
    timeout = setTimeout(() => advance(0), firstDelay);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [steps, forceComplete, onComplete]);

  // Force completion — instantly mark all steps done
  useEffect(() => {
    if (!forceComplete) return;
    setStepStates(steps.map(() => "done"));
    if (!completedRef.current) {
      completedRef.current = true;
      // Small delay so the user sees the final state before transition
      const t = setTimeout(() => onComplete?.(), 150);
      return () => clearTimeout(t);
    }
  }, [forceComplete, steps, onComplete]);

  return (
    <div className={`space-y-2.5 ${className}`} role="status" aria-label="Agent working">
      {steps.map((step, i) => {
        const state = stepStates[i];
        if (state === "pending") return null;

        return (
          <div
            key={step.text}
            className="flex items-start gap-2.5 fade-in-up"
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center">
              {state === "running" ? (
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sky-400 opacity-60" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-sky-500" />
                </span>
              ) : (
                <svg
                  className="h-3.5 w-3.5 text-emerald-500"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={3}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
            </span>
            <span
              className={`text-sm leading-snug transition-colors duration-200 ${
                state === "running"
                  ? "text-stone-700 font-medium"
                  : "text-stone-400"
              }`}
            >
              {step.text}
            </span>
          </div>
        );
      })}
    </div>
  );
}
