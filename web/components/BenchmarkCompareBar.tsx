"use client";

import { useCallback, useRef, type KeyboardEvent, type PointerEvent } from "react";
import {
  METRIC_TONE_CLASSES,
  scaleCap,
  type MetricTone,
} from "@/lib/benchmark-compare";

const FILL: Record<MetricTone, string> = {
  band: "bg-emerald-400/80",
  above: "bg-sky-400/80",
  below: "bg-amber-400/80",
  risk: "bg-rose-400/80",
};

function valueFromPointer(
  el: HTMLElement,
  clientX: number,
  clientY: number,
  cap: number,
  orientation: "horizontal" | "vertical",
): number {
  const rect = el.getBoundingClientRect();
  const t =
    orientation === "vertical"
      ? 1 - (clientY - rect.top) / Math.max(rect.height, 1)
      : (clientX - rect.left) / Math.max(rect.width, 1);
  return Math.round(Math.min(1, Math.max(0, t)) * cap * 10) / 10;
}

/**
 * Zone B proof: typical tick + optional range band + yours marker.
 * Pass onChange to make it a slider (drag the bar). Chat cards stay read-only.
 */
export function BenchmarkCompareBar({
  typical,
  yours,
  range,
  tone,
  unit,
  orientation = "horizontal",
  onChange,
  ariaLabel,
}: {
  typical: number;
  yours: number | null;
  range?: [number, number];
  tone: MetricTone | null;
  unit?: string;
  orientation?: "horizontal" | "vertical";
  onChange?: (value: number) => void;
  ariaLabel?: string;
}) {
  const cap = scaleCap(typical, yours, range, unit);
  const pos = (v: number) => Math.min(100, Math.max(0, (v / cap) * 100));
  const trackRef = useRef<HTMLDivElement>(null);
  const interactive = Boolean(onChange);
  const fillColor = tone ? FILL[tone] : "bg-sky-400/80";
  const dotColor = tone ? METRIC_TONE_CLASSES[tone].dot : "bg-stone-400";

  const applyPointer = useCallback(
    (clientX: number, clientY: number) => {
      if (!onChange || !trackRef.current) return;
      onChange(valueFromPointer(trackRef.current, clientX, clientY, cap, orientation));
    },
    [onChange, cap, orientation],
  );

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (!onChange) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    applyPointer(e.clientX, e.clientY);
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!onChange || !e.currentTarget.hasPointerCapture(e.pointerId)) return;
    applyPointer(e.clientX, e.clientY);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!onChange) return;
    const step = cap >= 50 ? 1 : 0.5;
    const current = yours ?? typical;
    if (e.key === "ArrowUp" || e.key === "ArrowRight") {
      e.preventDefault();
      onChange(Math.min(cap, Math.round((current + step) * 10) / 10));
    } else if (e.key === "ArrowDown" || e.key === "ArrowLeft") {
      e.preventDefault();
      onChange(Math.max(0, Math.round((current - step) * 10) / 10));
    } else if (e.key === "Home") {
      e.preventDefault();
      onChange(0);
    } else if (e.key === "End") {
      e.preventDefault();
      onChange(cap);
    }
  };

  if (orientation === "vertical") {
    return (
      <div
        ref={trackRef}
        role={interactive ? "slider" : undefined}
        aria-label={ariaLabel}
        aria-valuemin={interactive ? 0 : undefined}
        aria-valuemax={interactive ? cap : undefined}
        aria-valuenow={interactive ? (yours ?? typical) : undefined}
        tabIndex={interactive ? 0 : undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onKeyDown={onKeyDown}
        className={`relative h-28 w-7 shrink-0 rounded-full bg-stone-100 ${
          interactive ? "cursor-ns-resize touch-none select-none" : ""
        }`}
      >
        {range && (
          <span
            className="absolute inset-x-0 rounded-full bg-emerald-100"
            style={{
              bottom: `${pos(range[0])}%`,
              height: `${Math.max(0, pos(range[1]) - pos(range[0]))}%`,
            }}
          />
        )}
        {yours === null ? (
          <span
            className="absolute inset-x-0.5 bottom-0.5 rounded-full bg-stone-300/90"
            style={{ height: `${pos(typical)}%` }}
          />
        ) : (
          <span
            className={`absolute inset-x-0.5 bottom-0.5 rounded-full ${fillColor}`}
            style={{ height: `${pos(yours)}%` }}
          />
        )}
        <span
          className="absolute left-1/2 z-[1] h-0.5 w-5 -translate-x-1/2 rounded-full bg-stone-600 ring-1 ring-white"
          style={{ bottom: `${pos(typical)}%` }}
        />
        {yours !== null && (
          <span
            className={`absolute left-1/2 z-[1] h-3.5 w-3.5 -translate-x-1/2 translate-y-1/2 rounded-full ring-2 ring-white ${dotColor}`}
            style={{ bottom: `${pos(yours)}%` }}
          />
        )}
      </div>
    );
  }

  return (
    <div
      ref={trackRef}
      role={interactive ? "slider" : undefined}
      aria-label={ariaLabel}
      aria-valuemin={interactive ? 0 : undefined}
      aria-valuemax={interactive ? cap : undefined}
      aria-valuenow={interactive ? (yours ?? typical) : undefined}
      tabIndex={interactive ? 0 : undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onKeyDown={onKeyDown}
      className={`relative mt-2.5 h-2 rounded-full bg-stone-100 ${
        interactive ? "h-3 cursor-ew-resize touch-none select-none" : ""
      }`}
    >
      {range && (
        <span
          className="absolute top-0 h-full rounded-full bg-emerald-100"
          style={{ left: `${pos(range[0])}%`, width: `${Math.max(0, pos(range[1]) - pos(range[0]))}%` }}
        />
      )}
      {yours !== null && (
        <span
          className={`absolute top-0 h-full rounded-full ${fillColor}`}
          style={{ width: `${pos(yours)}%` }}
        />
      )}
      <span
        className="absolute top-1/2 z-[1] h-3.5 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-stone-500 ring-1 ring-white"
        style={{ left: `${pos(typical)}%` }}
      />
      {yours !== null && (
        <span
          className={`absolute top-1/2 z-[1] h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-white ${dotColor}`}
          style={{ left: `${pos(yours)}%` }}
        />
      )}
    </div>
  );
}
