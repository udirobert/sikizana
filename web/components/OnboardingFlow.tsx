"use client";

import { useState } from "react";
import { localStore, StorageKeys } from "@/lib/storage";
import type { Language } from "@/lib/types";

interface OnboardingFlowProps {
  onComplete: (language: Language, chamaName: string, disputeKind: string) => void;
}

const STEPS = ["language", "chama", "kind"] as const;

export function OnboardingFlow({ onComplete }: OnboardingFlowProps) {
  const [step, setStep] = useState<(typeof STEPS)[number]>("language");
  const [language, setLanguage] = useState<Language>("sw");
  const [chamaName, setChamaName] = useState("");
  const [disputeKind, setDisputeKind] = useState("");

  const advance = () => {
    const idx = STEPS.indexOf(step);
    if (idx === STEPS.length - 1) {
      localStore.set(StorageKeys.ONBOARDED, true);
      localStore.set(StorageKeys.PREFERRED_LANGUAGE, language);
      onComplete(language, chamaName, disputeKind);
    } else {
      setStep(STEPS[idx + 1]);
    }
  };

  const back = () => {
    const idx = STEPS.indexOf(step);
    if (idx > 0) setStep(STEPS[idx - 1]);
  };

  const canAdvance = () => {
    switch (step) {
      case "language":
        return true;
      case "chama":
        return chamaName.trim().length >= 2;
      case "kind":
        return disputeKind.length > 0;
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 max-w-md mx-auto fade-in-up">
      {/* Progress dots */}
      <div className="flex items-center gap-1.5 mb-8">
        {STEPS.map((s, i) => {
          const idx = STEPS.indexOf(step);
          return (
            <span
              key={s}
              className={`h-1.5 rounded-full transition-all ${
                i === idx ? "w-8 bg-emerald-600" : i < idx ? "w-1.5 bg-emerald-600" : "w-1.5 bg-stone-300"
              }`}
            />
          );
        })}
      </div>

      <div className="w-full bg-white rounded-2xl shadow-lg border border-stone-200 p-6 space-y-5">
        {step === "language" && (
          <>
            <div>
              <h2 className="text-lg font-bold text-stone-900">Karibu!</h2>
              <p className="text-sm text-stone-500 mt-1">
                Niambie lugha unayopendelea. Unaweza kubadilisha baadaye.
              </p>
            </div>
            <div className="space-y-2">
              {[
                { value: "sw" as const, label: "Kiswahili", desc: "Standard Swahili" },
                { value: "en" as const, label: "English", desc: "Standard English" },
                { value: "sheng" as const, label: "Sheng", desc: "Nairobi street Swahili" },
              ].map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setLanguage(opt.value)}
                  className={`w-full text-left p-3 rounded-xl border-2 transition ${
                    language === opt.value
                      ? "border-emerald-600 bg-emerald-50"
                      : "border-stone-200 hover:border-stone-300"
                  }`}
                >
                  <div className="text-sm font-semibold text-stone-900">{opt.label}</div>
                  <div className="text-xs text-stone-500">{opt.desc}</div>
                </button>
              ))}
            </div>
          </>
        )}

        {step === "chama" && (
          <>
            <div>
              <h2 className="text-lg font-bold text-stone-900">Jina la chama yako?</h2>
              <p className="text-sm text-stone-500 mt-1">
                Tutaiboresha uchunguzi kwa kujua chama unachowakilisha.
              </p>
            </div>
            <input
              type="text"
              value={chamaName}
              onChange={(e) => setChamaName(e.target.value)}
              placeholder="Mfano: Mwangaza Women Group"
              className="w-full p-3 border border-stone-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              autoFocus
            />
          </>
        )}

        {step === "kind" && (
          <>
            <div>
              <h2 className="text-lg font-bold text-stone-900">Aina ya mzozo?</h2>
              <p className="text-sm text-stone-500 mt-1">
                Chagua aina inayofanana zaidi na hali yako.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-2">
              {[
                { value: "contribution", label: "Michango haijalipwa", desc: "Member hasn't paid contributions" },
                { value: "loan", label: "Mkopo haujarejeshewa", desc: "Loan repayment dispute" },
                { value: "fraud", label: "Kudanganya kifedha", desc: "Suspected fraud or misappropriation" },
                { value: "other", label: "Kitu kingine", desc: "Other dispute" },
              ].map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setDisputeKind(opt.value)}
                  className={`text-left p-3 rounded-xl border-2 transition ${
                    disputeKind === opt.value
                      ? "border-emerald-600 bg-emerald-50"
                      : "border-stone-200 hover:border-stone-300"
                  }`}
                >
                  <div className="text-sm font-semibold text-stone-900">{opt.label}</div>
                  <div className="text-xs text-stone-500">{opt.desc}</div>
                </button>
              ))}
            </div>
          </>
        )}

        <div className="flex gap-2 pt-2">
          {step !== "language" && (
            <button
              onClick={back}
              className="px-4 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 text-sm font-medium rounded-lg transition"
            >
              Rudi
            </button>
          )}
          <button
            onClick={advance}
            disabled={!canAdvance()}
            className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2 rounded-lg transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {step === "kind" ? "Anza" : "Endelea"}
          </button>
        </div>
      </div>

      <button
        onClick={() => {
          localStore.set(StorageKeys.ONBOARDED, true);
          onComplete("sw", chamaName, disputeKind);
        }}
        className="text-[11px] text-stone-400 hover:text-stone-600 mt-4"
      >
        Ruka (skip)
      </button>
    </div>
  );
}
