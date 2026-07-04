"use client";

import { useEffect, useRef } from "react";

/**
 * SuccessCheck — transitions.dev "success check" pattern.
 *
 * Plays a satisfying checkmark animation: fade in, rotate upright,
 * settle with a Y-bob, and draw the SVG path stroke.
 *
 * Use when a journal entry is approved, a receipt is matched, or
 * any "done" moment needs to feel earned.
 */
export function SuccessCheck({
  show,
  size = 48,
  className = "",
}: {
  show: boolean;
  size?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (show) {
      el.setAttribute("data-state", "out");
      void el.offsetWidth; // force reflow so keyframes restart
      el.setAttribute("data-state", "in");
    } else {
      el.setAttribute("data-state", "out");
    }
  }, [show]);

  return (
    <span
      ref={ref}
      className={`t-success-check ${className}`}
      data-state="out"
      aria-hidden="true"
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 48 48" fill="none" width={size} height={size}>
        <circle
          cx="24"
          cy="24"
          r="20"
          stroke="currentColor"
          strokeWidth="3"
          fill="none"
          className="opacity-20"
        />
        <path
          d="M14 24l7 7 13-14"
          stroke="currentColor"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </svg>
    </span>
  );
}
