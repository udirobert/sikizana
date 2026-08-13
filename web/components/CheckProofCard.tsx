"use client";

import { useState, type ReactNode } from "react";
import { SikiMascot, ZanaMascot, type MascotMood } from "@/components/SikiMascot";

export interface CheckProofFinding {
  id: string;
  label: string;
  value: string;
  tone: string;
  evidence: ReactNode;
}

/**
 * Marketing proof card — same shell as /books findings: one row open at a time.
 */
export function CheckProofCard({
  eyebrow,
  title,
  findings,
  defaultOpen,
  sikiMood = "wave",
}: {
  eyebrow: string;
  title: string;
  findings: CheckProofFinding[];
  defaultOpen?: string;
  sikiMood?: MascotMood;
}) {
  const [openId, setOpenId] = useState(defaultOpen ?? findings[0]?.id);

  return (
    <div className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-xl shadow-stone-900/8">
      <div className="border-b border-stone-200 bg-stone-950 px-5 py-4 text-white">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-400">{eyebrow}</p>
            <p className="mt-1 text-lg font-bold">{title}</p>
          </div>
          <div className="flex items-center gap-1">
            <SikiMascot size={38} mood={sikiMood} />
            <ZanaMascot size={38} mood="look" />
          </div>
        </div>
      </div>
      <div className="divide-y divide-stone-100">
        {findings.map((finding) => {
          const open = openId === finding.id;
          return (
            <div key={finding.id}>
              <button
                type="button"
                onClick={() => setOpenId(finding.id)}
                aria-expanded={open}
                className="flex w-full items-start justify-between gap-4 p-5 text-left"
              >
                <p className="text-sm font-semibold text-stone-950">{finding.label}</p>
                <span className={`shrink-0 rounded-full border px-3 py-1 text-xs font-bold ${finding.tone}`}>
                  {finding.value}
                </span>
              </button>
              {open && <div className="px-5 pb-5">{finding.evidence}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function AgeingEvidence({
  rows,
}: {
  rows: [customer: string, days: string, amount: string][];
}) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {rows.map(([customer, days, amount]) => (
        <div key={customer + days} className="border-l-2 border-rose-300 pl-2">
          <p className="truncate text-[10px] font-medium text-stone-600">{customer}</p>
          <p className="mt-0.5 text-xs font-bold text-stone-900">{amount}</p>
          <p className="text-[10px] text-rose-700">{days}</p>
        </div>
      ))}
    </div>
  );
}

export function DuplicateEvidence({
  rows,
}: {
  rows: [date: string, supplier: string, amount: string][];
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-amber-100 bg-amber-50/40 text-[11px]">
      {rows.map(([date, supplier, amount], index) => (
        <div
          key={date}
          className={`grid grid-cols-[3.5rem_1fr_auto] items-center gap-2 px-3 py-2 ${index ? "border-t border-amber-100" : ""}`}
        >
          <span className="text-stone-500">{date}</span>
          <span className="font-medium text-stone-800">{supplier}</span>
          <span className="font-bold text-amber-800">{amount}</span>
        </div>
      ))}
    </div>
  );
}

export function SummaryEvidence({
  rows,
}: {
  rows: [metric: string, amount: string, context: string][];
}) {
  return (
    <div className="grid grid-cols-3 divide-x divide-stone-200 border-y border-stone-100 py-2.5">
      {rows.map(([metric, amount, context]) => (
        <div key={metric} className="px-2.5 first:pl-0 last:pr-0">
          <p className="text-[10px] text-stone-500">{metric}</p>
          <p className="mt-0.5 text-xs font-bold text-stone-900">{amount}</p>
          <p className="text-[10px] text-sky-700">{context}</p>
        </div>
      ))}
    </div>
  );
}
