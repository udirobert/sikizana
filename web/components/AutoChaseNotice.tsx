"use client";

import { useEffect, useState } from "react";
import { getAutoChaseCopy, type Persona } from "@/lib/persona-theme";
import { SikiMascot, ZanaMascot } from "@/components/SikiMascot";
import { SuccessCheck } from "@/components/SuccessCheck";

export interface AutoChaseNoticeState {
  message: string;
  invoiceNumber?: string;
  findingTitle?: string;
}

/**
 * AutoChaseNotice — signature moment when the user arms a chase sequence.
 * Zana gets the full treatment (mascot + SuccessCheck); Siki stays calmer.
 */
export function AutoChaseNotice({
  persona,
  notice,
  onDismiss,
}: {
  persona: Persona;
  notice: AutoChaseNoticeState;
  onDismiss: () => void;
}) {
  const isZana = persona === "zana";
  const copy = getAutoChaseCopy(persona, notice.invoiceNumber);
  const [showCheck, setShowCheck] = useState(isZana);

  useEffect(() => {
    if (!isZana) return;
    const t = setTimeout(() => setShowCheck(false), 3000);
    return () => clearTimeout(t);
  }, [isZana]);

  return (
    <div
      className={`border-b px-4 py-3 flex items-start gap-3 fade-in-up ${
        isZana ? "bg-rose-50 border-rose-200" : "bg-emerald-50 border-emerald-200"
      }`}
      role="status"
    >
      <div className="shrink-0 flex flex-col items-center gap-1">
        {isZana ? (
          <ZanaMascot size={36} mood="look" />
        ) : (
          <SikiMascot size={36} mood="celebrate" />
        )}
        {isZana && <SuccessCheck show={showCheck} size={24} />}
      </div>
      <div className="flex-1 min-w-0">
        <p
          className={`text-xs font-semibold ${
            isZana ? "text-rose-900" : "text-emerald-900"
          }`}
        >
          {copy.headline}
        </p>
        {notice.findingTitle && (
          <p
            className={`text-[10px] mt-0.5 ${
              isZana ? "text-rose-700" : "text-emerald-700"
            }`}
          >
            {notice.findingTitle}
          </p>
        )}
        <p
          className={`text-xs mt-1 ${
            isZana ? "text-rose-800" : "text-emerald-800"
          }`}
        >
          {notice.message}
        </p>
        <p
          className={`text-[10px] mt-1.5 ${
            isZana ? "text-rose-600" : "text-emerald-600"
          }`}
        >
          {copy.tagline}
        </p>
      </div>
      <button
        onClick={onDismiss}
        className={`shrink-0 btn-press ${
          isZana
            ? "text-rose-500 hover:text-rose-700"
            : "text-emerald-500 hover:text-emerald-700"
        }`}
        aria-label="Dismiss notice"
      >
        ×
      </button>
    </div>
  );
}
