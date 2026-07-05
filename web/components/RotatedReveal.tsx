"use client";

import { useLayoutEffect, useState } from "react";

/**
 * RotatedReveal — a Codrops-inspired page reveal transition.
 *
 * When a user navigates to a page that wraps this component, a dark overlay
 * slides away (rotated -4deg) to reveal the page underneath. The overlay's
 * content moves in the opposite direction, creating a "cut off" look.
 *
 * Structure (3 layers, per Codrops technique):
 *   .reveal-overlay          — rotated container, oversized to prevent gaps
 *     .reveal-overlay-content  — moves opposite to parent, stays "steady"
 *
 * The overlay auto-removes after the animation completes, and only plays
 * on the first visit per browser session — repeat client-side navigations
 * skip it (sessionStorage flag).
 */
const REVEAL_PLAYED_KEY = "sikizana.reveal_played";

export function RotatedReveal({ color = "#0a0a0a" }: { color?: string }) {
  const [show, setShow] = useState(true);

  // useLayoutEffect so a repeat navigation hides the overlay before paint.
  useLayoutEffect(() => {
    try {
      if (window.sessionStorage.getItem(REVEAL_PLAYED_KEY)) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setShow(false);
        return;
      }
      window.sessionStorage.setItem(REVEAL_PLAYED_KEY, "1");
    } catch {
      // sessionStorage unavailable (private mode) — just play the reveal
    }
    // Remove from DOM after animation completes
    const timer = setTimeout(() => setShow(false), 900);
    return () => clearTimeout(timer);
  }, []);

  if (!show) return null;

  return (
    <div className="reveal-overlay" style={{ background: color }} aria-hidden="true">
      <div className="reveal-overlay-content">
        {/* Mascot peeking during the reveal */}
        <div className="flex flex-col items-center gap-3">
          <svg
            viewBox="0 0 120 120"
            width="80"
            height="80"
            xmlns="http://www.w3.org/2000/svg"
            shapeRendering="crispEdges"
          >
            {/* Simplified Siki face for the reveal */}
            <rect x="28" y="30" width="64" height="70" rx="20" fill="#D4843A" />
            <rect x="42" y="52" width="36" height="40" rx="14" fill="#F0C088" />
            <rect x="30" y="24" width="10" height="12" rx="3" fill="#D4843A" />
            <rect x="80" y="24" width="10" height="12" rx="3" fill="#D4843A" />
            {/* Eyes */}
            <rect x="36" y="38" width="22" height="22" rx="11" fill="#FFFFFF" />
            <rect x="38" y="40" width="18" height="18" rx="9" fill="#1A1A2E" />
            <rect x="42" y="42" width="6" height="6" rx="3" fill="#FFFFFF" />
            <rect x="62" y="38" width="22" height="22" rx="11" fill="#FFFFFF" />
            <rect x="64" y="40" width="18" height="18" rx="9" fill="#1A1A2E" />
            <rect x="68" y="42" width="6" height="6" rx="3" fill="#FFFFFF" />
            {/* Beak */}
            <rect x="56" y="56" width="8" height="6" rx="2" fill="#E8954A" />
          </svg>
          <p className="text-white/60 text-xs font-medium tracking-wide uppercase">
            Opening your books...
          </p>
        </div>
      </div>
    </div>
  );
}
