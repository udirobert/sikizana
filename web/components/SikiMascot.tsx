"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Siki the Owl — Sikizana Books mascot.
 *
 * Built entirely from SVG <rect> elements (pixel art style), inspired by
 * Claude AI's mascot approach. No images, no GIFs — just code.
 *
 * Animations are CSS keyframe-based (no GSAP dependency):
 * - idle: subtle breathing
 * - look: eyes shift left/right (searching your books)
 * - wave: wing rotates up and down (greeting)
 * - walk: body bobs + legs alternate (strolling through your transactions)
 *
 * The owl symbolizes wisdom, vigilance, and seeing in the dark —
 * finding the discrepancies others miss.
 */

export type MascotMood = "idle" | "look" | "wave" | "walk" | "celebrate";

interface SikiMascotProps {
  size?: number;
  mood?: MascotMood;
  className?: string;
}

export function SikiMascot({ size = 120, mood = "idle", className = "" }: SikiMascotProps) {
  return (
    <div
      className={`siki-mascot siki-${mood} ${className}`}
      style={{ width: size, height: size }}
    >
      <svg
        viewBox="0 0 120 120"
        width={size}
        height={size}
        xmlns="http://www.w3.org/2000/svg"
        shapeRendering="crispEdges"
      >
        <defs>
          <clipPath id="siki-body-clip">
            <rect x="28" y="30" width="64" height="70" rx="20" />
          </clipPath>
        </defs>

        {/* === GROUP: entire owl (for walk bob + breathe) === */}
        <g className="siki-group">

          {/* === FEET === */}
          <g className="siki-feet">
            <rect x="40" y="98" width="14" height="6" fill="#E8954A" />
            <rect x="38" y="102" width="4" height="4" fill="#E8954A" />
            <rect x="44" y="102" width="4" height="4" fill="#E8954A" />
            <rect x="50" y="102" width="4" height="4" fill="#E8954A" />
            <rect x="66" y="98" width="14" height="6" fill="#E8954A" />
            <rect x="64" y="102" width="4" height="4" fill="#E8954A" />
            <rect x="70" y="102" width="4" height="4" fill="#E8954A" />
            <rect x="76" y="102" width="4" height="4" fill="#E8954A" />
          </g>

          {/* === BODY (rounded rect) === */}
          <g className="siki-body">
            {/* Main body */}
            <rect x="28" y="30" width="64" height="70" rx="20" fill="#D4843A" />
            {/* Belly patch (lighter) */}
            <rect x="42" y="52" width="36" height="40" rx="14" fill="#F0C088" />
            {/* Belly pixel texture */}
            <rect x="48" y="58" width="6" height="6" fill="#E8B070" opacity="0.5" />
            <rect x="60" y="58" width="6" height="6" fill="#E8B070" opacity="0.5" />
            <rect x="54" y="66" width="6" height="6" fill="#E8B070" opacity="0.5" />
            <rect x="66" y="66" width="6" height="6" fill="#E8B070" opacity="0.5" />
            <rect x="48" y="74" width="6" height="6" fill="#E8B070" opacity="0.5" />
            <rect x="60" y="74" width="6" height="6" fill="#E8B070" opacity="0.5" />
            <rect x="54" y="82" width="6" height="6" fill="#E8B070" opacity="0.5" />

            {/* Ear tufts */}
            <rect x="30" y="24" width="10" height="12" rx="3" fill="#D4843A" />
            <rect x="80" y="24" width="10" height="12" rx="3" fill="#D4843A" />
            <rect x="32" y="22" width="6" height="6" rx="2" fill="#C07432" />
            <rect x="82" y="22" width="6" height="6" rx="2" fill="#C07432" />
          </g>

          {/* === EYES (big, round — the owl's signature feature) === */}
          <g className="siki-eyes">
            {/* Left eye */}
            <g className="siki-eye siki-eye-left">
              <rect x="36" y="38" width="22" height="22" rx="11" fill="#FFFFFF" />
              <rect x="38" y="40" width="18" height="18" rx="9" fill="#1A1A2E" />
              <rect x="42" y="42" width="6" height="6" rx="3" fill="#FFFFFF" />
              <rect x="44" y="44" width="3" height="3" fill="#FFFFFF" opacity="0.8" />
            </g>
            {/* Right eye */}
            <g className="siki-eye siki-eye-right">
              <rect x="62" y="38" width="22" height="22" rx="11" fill="#FFFFFF" />
              <rect x="64" y="40" width="18" height="18" rx="9" fill="#1A1A2E" />
              <rect x="68" y="42" width="6" height="6" rx="3" fill="#FFFFFF" />
              <rect x="70" y="44" width="3" height="3" fill="#FFFFFF" opacity="0.8" />
            </g>
          </g>

          {/* === BEAK === */}
          <g className="siki-beak">
            <rect x="56" y="56" width="8" height="6" rx="2" fill="#E8954A" />
            <rect x="54" y="58" width="12" height="4" rx="2" fill="#D67A30" />
          </g>

          {/* === WINGS === */}
          {/* Left wing */}
          <g className="siki-wing siki-wing-left" style={{ transformOrigin: "32px 55px" }}>
            <rect x="22" y="48" width="14" height="34" rx="6" fill="#C07432" />
            <rect x="24" y="52" width="10" height="26" rx="4" fill="#B8682A" />
            <rect x="26" y="56" width="6" height="4" fill="#A05820" opacity="0.5" />
            <rect x="26" y="64" width="6" height="4" fill="#A05820" opacity="0.5" />
            <rect x="26" y="72" width="6" height="4" fill="#A05820" opacity="0.5" />
          </g>
          {/* Right wing */}
          <g className="siki-wing siki-wing-right" style={{ transformOrigin: "88px 55px" }}>
            <rect x="84" y="48" width="14" height="34" rx="6" fill="#C07432" />
            <rect x="86" y="52" width="10" height="26" rx="4" fill="#B8682A" />
            <rect x="88" y="56" width="6" height="4" fill="#A05820" opacity="0.5" />
            <rect x="88" y="64" width="6" height="4" fill="#A05820" opacity="0.5" />
            <rect x="88" y="72" width="6" height="4" fill="#A05820" opacity="0.5" />
          </g>
        </g>

        {/* === CONFETTI (for celebrate mood) === */}
        {mood === "celebrate" && (
          <g className="siki-confetti">
            {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
              <rect
                key={i}
                className={`siki-confetti-piece siki-confetti-${i}`}
                x={20 + i * 11}
                y="10"
                width="5"
                height="5"
                fill={["#13B5EA", "#00D4AA", "#FFD700", "#FF6B6B", "#13B5EA", "#00D4AA", "#FFD700", "#FF6B6B"][i]}
              />
            ))}
          </g>
        )}
      </svg>
    </div>
  );
}

/**
 * SikiMascotAnimated — cycles through moods automatically.
 * Good for the empty state where the mascot entertains while waiting.
 */
export function SikiMascotAnimated({ size = 120, className = "" }: { size?: number; className?: string }) {
  const [mood, setMood] = useState<MascotMood>("idle");
  const moodCycle: MascotMood[] = ["idle", "look", "idle", "wave", "idle", "look", "celebrate", "idle"];
  const idx = useRef(0);

  useEffect(() => {
    const interval = setInterval(() => {
      idx.current = (idx.current + 1) % moodCycle.length;
      setMood(moodCycle[idx.current]);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  return <SikiMascot size={size} mood={mood} className={className} />;
}
