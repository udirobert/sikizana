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
  const [language, setLanguage] = useState<Language>("en");
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
              <h2 className="text-lg font-bold text-stone-900">Welcome!</h2>
              <p className="text-sm text-stone-500 mt-1">
                Choose your preferred language. You can change this later.
              </p>
            </div>
            <div className="space-y-2">
              {[
                { value: "en" as const, label: "English", desc: "Standard English" },
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
              <h2 className="text-lg font-bold text-stone-900">What's your group name?</h2>
              <p className="text-sm text-stone-500 mt-1">
                We'll tailor the analysis based on your group.
              </p>
            </div>
            <input
              type="text"
              value={chamaName}
              onChange={(e) => setChamaName(e.target.value)}
              placeholder="Example: Sunshine Women Group"
              className="w-full p-3 border border-stone-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              autoFocus
            />
          </>
        )}

        {step === "kind" && (
          <>
            <div>
              <h2 className="text-lg font-bold text-stone-900">What type of dispute?</h2>
              <p className="text-sm text-stone-500 mt-1">
                Choose the category that best fits your situation.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-2">
              {[
                { value: "contribution", label: "Unpaid contributions", desc: "Member hasn't paid contributions" },
                { value: "loan", label: "Loan repayment dispute", desc: "Loan repayment dispute" },
                { value: "fraud", label: "Suspected fraud", desc: "Suspected fraud or misappropriation" },
                { value: "other", label: "Other dispute", desc: "Other dispute" },
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
              Back
            </button>
          )}
          <button
            onClick={advance}
            disabled={!canAdvance()}
            className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2 rounded-lg transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {step === "kind" ? "Start" : "Continue"}
          </button>
        </div>
      </div>

      <button
        onClick={() => {
          localStore.set(StorageKeys.ONBOARDED, true);
          onComplete("en", chamaName, disputeKind);
        }}
        className="text-[11px] text-stone-400 hover:text-stone-600 mt-4"
      >
        Skip
      </button>
    </div>
  );
}
