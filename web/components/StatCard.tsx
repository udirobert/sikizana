"use client";

/** Small metric tile: a label, a dominant value, an optional gloss. */
export function StatCard({
  label,
  sub,
  children,
}: {
  label: string;
  sub?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-stone-200 rounded-xl p-4 shadow-sm">
      <div className="text-[10px] uppercase tracking-wide text-stone-500 font-semibold mb-1">
        {label}
      </div>
      <div className="text-2xl font-bold text-stone-900">{children}</div>
      {sub && <div className="text-[11px] text-stone-500 mt-1">{sub}</div>}
    </div>
  );
}
