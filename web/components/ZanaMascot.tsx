"use client";

import type { MascotMood } from "@/components/SikiMascot";

/**
 * Zana the Owl — Siki's alter ego. The enforcer.
 *
 * Same owl silhouette but darker, cooler tones — slate/charcoal body
 * with rose-red eyes. The "bad cop" to Siki's "good cop."
 * Where Siki finds savings, Zana chases payments.
 *
 * Shares Siki's `siki-*` CSS animation namespace (globals.css); the mood
 * vocabulary is the same for both.
 */
export function ZanaMascot({
  size = 120,
  mood = "idle",
  className = "",
}: {
  size?: number;
  mood?: MascotMood;
  className?: string;
}) {
  return (
    <div
      className={`siki-mascot siki-${mood} ${className}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 120 120"
        width={size}
        height={size}
        xmlns="http://www.w3.org/2000/svg"
        shapeRendering="crispEdges"
      >
        <defs>
          <clipPath id="zana-body-clip">
            <rect x="28" y="30" width="64" height="70" rx="20" />
          </clipPath>
        </defs>

        <g className="siki-group">
          {/* FEET — dark steel */}
          <g className="siki-feet">
            <rect x="40" y="98" width="14" height="6" fill="#4A5568" />
            <rect x="38" y="102" width="4" height="4" fill="#4A5568" />
            <rect x="44" y="102" width="4" height="4" fill="#4A5568" />
            <rect x="50" y="102" width="4" height="4" fill="#4A5568" />
            <rect x="66" y="98" width="14" height="6" fill="#4A5568" />
            <rect x="64" y="102" width="4" height="4" fill="#4A5568" />
            <rect x="70" y="102" width="4" height="4" fill="#4A5568" />
            <rect x="76" y="102" width="4" height="4" fill="#4A5568" />
          </g>

          {/* BODY — dark slate */}
          <g className="siki-body">
            <rect x="28" y="30" width="64" height="70" rx="20" fill="#2D3748" />
            {/* Belly patch — slightly lighter slate */}
            <rect x="42" y="52" width="36" height="40" rx="14" fill="#4A5568" />
            <rect x="48" y="58" width="6" height="6" fill="#3A4556" opacity="0.5" />
            <rect x="60" y="58" width="6" height="6" fill="#3A4556" opacity="0.5" />
            <rect x="54" y="66" width="6" height="6" fill="#3A4556" opacity="0.5" />
            <rect x="66" y="66" width="6" height="6" fill="#3A4556" opacity="0.5" />
            <rect x="48" y="74" width="6" height="6" fill="#3A4556" opacity="0.5" />
            <rect x="60" y="74" width="6" height="6" fill="#3A4556" opacity="0.5" />
            <rect x="54" y="82" width="6" height="6" fill="#3A4556" opacity="0.5" />

            {/* Ear tufts — darker */}
            <rect x="30" y="24" width="10" height="12" rx="3" fill="#2D3748" />
            <rect x="80" y="24" width="10" height="12" rx="3" fill="#2D3748" />
            <rect x="32" y="22" width="6" height="6" rx="2" fill="#1A202C" />
            <rect x="82" y="22" width="6" height="6" rx="2" fill="#1A202C" />
          </g>

          {/* EYES — rose red, sharp */}
          <g className="siki-eyes">
            <g className="siki-eye siki-eye-left">
              <rect x="36" y="38" width="22" height="22" rx="11" fill="#FFFFFF" />
              <rect x="38" y="40" width="18" height="18" rx="9" fill="#1A1A2E" />
              <rect x="42" y="42" width="6" height="6" rx="3" fill="#E11D48" />
              <rect x="44" y="44" width="3" height="3" fill="#FB7185" opacity="0.8" />
            </g>
            <g className="siki-eye siki-eye-right">
              <rect x="62" y="38" width="22" height="22" rx="11" fill="#FFFFFF" />
              <rect x="64" y="40" width="18" height="18" rx="9" fill="#1A1A2E" />
              <rect x="68" y="42" width="6" height="6" rx="3" fill="#E11D48" />
              <rect x="70" y="44" width="3" height="3" fill="#FB7185" opacity="0.8" />
            </g>
          </g>

          {/* BEAK — dark steel */}
          <g className="siki-beak">
            <rect x="56" y="56" width="8" height="6" rx="2" fill="#4A5568" />
            <rect x="54" y="58" width="12" height="4" rx="2" fill="#2D3748" />
          </g>

          {/* WINGS — darker */}
          <g className="siki-wing siki-wing-left" style={{ transformOrigin: "32px 55px" }}>
            <rect x="22" y="48" width="14" height="34" rx="6" fill="#1A202C" />
            <rect x="24" y="52" width="10" height="26" rx="4" fill="#0F1419" />
            <rect x="26" y="56" width="6" height="4" fill="#000000" opacity="0.3" />
            <rect x="26" y="64" width="6" height="4" fill="#000000" opacity="0.3" />
            <rect x="26" y="72" width="6" height="4" fill="#000000" opacity="0.3" />
          </g>
          <g className="siki-wing siki-wing-right" style={{ transformOrigin: "88px 55px" }}>
            <rect x="84" y="48" width="14" height="34" rx="6" fill="#1A202C" />
            <rect x="86" y="52" width="10" height="26" rx="4" fill="#0F1419" />
            <rect x="88" y="56" width="6" height="4" fill="#000000" opacity="0.3" />
            <rect x="88" y="64" width="6" height="4" fill="#000000" opacity="0.3" />
            <rect x="88" y="72" width="6" height="4" fill="#000000" opacity="0.3" />
          </g>
        </g>
      </svg>
    </div>
  );
}
