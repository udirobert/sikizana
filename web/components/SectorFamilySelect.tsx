"use client";

import { SECTOR_FAMILY_OPTIONS, type SectorId } from "@/lib/sector-benchmarks";

const CARET = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' fill='none'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%2378716c' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`;

/**
 * Compact family switcher — dotted select, not a chip cloud.
 * Changing family is a navigation; callers should not carry previous numbers.
 */
export function SectorFamilySelect({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (id: SectorId) => void;
  disabled?: boolean;
}) {
  const known = SECTOR_FAMILY_OPTIONS.some((o) => o.id === value);
  return (
    <label className="inline-flex items-baseline gap-1 font-semibold text-stone-900">
      <span className="sr-only">Sector</span>
      <select
        value={known ? value : SECTOR_FAMILY_OPTIONS[0]?.id}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as SectorId)}
        className="appearance-none bg-transparent border-b border-stone-400 border-dotted font-semibold text-stone-950 pr-4 cursor-pointer outline-none focus:border-sky-500 disabled:cursor-not-allowed disabled:opacity-60"
        style={{
          backgroundImage: CARET,
          backgroundRepeat: "no-repeat",
          backgroundPosition: "right center",
        }}
      >
        {SECTOR_FAMILY_OPTIONS.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
