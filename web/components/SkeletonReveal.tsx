"use client";

import { useEffect, useRef, useState } from "react";

/**
 * SkeletonReveal — transitions.dev "skeleton loader and reveal" pattern.
 *
 * Shows a pulsing skeleton placeholder while `isLoading` is true, then
 * cross-fades + cross-blurs to the real content when data arrives.
 *
 * Usage:
 * <SkeletonReveal isLoading={!data} className="h-8 w-32">
 *   <div>{data.value}</div>
 * </SkeletonReveal>
 */
export function SkeletonReveal({
  isLoading,
  children,
  className = "",
  skeletonClassName = "",
}: {
  isLoading: boolean;
  children: React.ReactNode;
  className?: string;
  skeletonClassName?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    if (!isLoading && !revealed) {
      // Small delay so the skeleton pulse is visible at least once.
      const timer = setTimeout(() => setRevealed(true), 200);
      return () => clearTimeout(timer);
    }
  }, [isLoading, revealed]);

  return (
    <div ref={ref} className={`t-skel ${revealed ? "is-revealed" : ""} ${className}`}>
      <div className={`t-skel-skeleton is-pulsing ${skeletonClassName}`}>
        <div className="h-full w-full rounded-lg bg-stone-200/60" />
      </div>
      <div className="t-skel-content">{children}</div>
    </div>
  );
}
