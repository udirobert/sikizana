"use client";

import { useEffect, useRef, useState } from "react";

/**
 * AnimatedNumber — transitions.dev "number pop-in" pattern.
 *
 * Renders each digit as a separate span that animates in with a blurred
 * slide. The last two digits stagger slightly for a natural feel.
 *
 * Pass `value` as a number or string. When the value changes, the digits
 * re-animate. Uses the .t-digit-group / .t-digit classes from globals.css.
 */
export function AnimatedNumber({
  value,
  prefix = "",
  suffix = "",
  className = "",
}: {
  value: number | string;
  prefix?: string;
  suffix?: string;
  className?: string;
}) {
  const groupRef = useRef<HTMLSpanElement>(null);
  const [animating, setAnimating] = useState(false);
  const str = typeof value === "number" ? value.toLocaleString() : String(value);
  const chars = `${prefix}${str}${suffix}`.split("");

  // Re-trigger animation whenever the value changes.
  useEffect(() => {
    const el = groupRef.current;
    if (!el) return;
    setAnimating(false);
    // Force reflow so the animation replays.
    void el.offsetHeight;
    setAnimating(true);
  }, [str]);

  return (
    <span
      ref={groupRef}
      className={`t-digit-group ${animating ? "is-animating" : ""} ${className}`}
    >
      {chars.map((ch, i) => {
        const isLast = i === chars.length - 1;
        const isSecondLast = i === chars.length - 2;
        return (
          <span
            key={`${i}-${ch}`}
            className="t-digit"
            data-stagger={isSecondLast ? "1" : isLast ? "2" : undefined}
          >
            {ch}
          </span>
        );
      })}
    </span>
  );
}
