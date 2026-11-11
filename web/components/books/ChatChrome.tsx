"use client";

import Link from "next/link";
import { SikiMascot } from "@/components/SikiMascot";
import { ZanaMascot } from "@/components/ZanaMascot";
import { ApiHealthDot } from "@/components/ApiHealthDot";
import { MemoryBadge } from "@/components/MemoryBadge";
import { AutoChaseNotice, type AutoChaseNoticeState } from "@/components/AutoChaseNotice";
import { getPersonaTheme, type Persona } from "@/lib/persona-theme";

export interface ChatHeaderProps {
  persona: Persona;
  theme: ReturnType<typeof getPersonaTheme>;
  isLoading: boolean;
  thinkingMessage: string;
  memoryEnabled: boolean;
  hasMessages: boolean;
  confirmClear: boolean;
  modeHintShown: boolean;
  memoryAvailable: boolean;
  onPersonaChange: (p: Persona) => void;
  onToggleMemory: () => void;
  onAskClear: () => void;
  onConfirmClear: () => void;
  onCancelClear: () => void;
}

/** Chat panel header — mascot, live status, persona + memory toggles,
    clear-confirm. Wraps onto a second row on narrow screens so the
    controls never squeeze the mascot/status off a phone. */
export function ChatHeader({
  persona,
  theme,
  isLoading,
  thinkingMessage,
  memoryEnabled,
  hasMessages,
  confirmClear,
  modeHintShown,
  memoryAvailable,
  onPersonaChange,
  onToggleMemory,
  onAskClear,
  onConfirmClear,
  onCancelClear,
}: ChatHeaderProps) {
  const zanaTheme = getPersonaTheme("zana");
  return (
    <>
      <div className="px-4 sm:px-5 py-3 border-b border-stone-100 flex items-center gap-3 flex-wrap">
        <div className="relative shrink-0">
          {persona === "siki" ? (
            <SikiMascot size={40} mood={isLoading ? "look" : "idle"} />
          ) : (
            <ZanaMascot size={40} mood={isLoading ? "look" : "idle"} />
          )}
          <div className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white ${theme.statusDot}`} />
        </div>
        <div className="flex-1 min-w-[120px]">
          <p className="text-sm font-semibold text-stone-800">
            {persona === "siki" ? "Siki · The Explainer" : "Zana · Collections assistant"}
          </p>
          <p className="text-xs text-stone-500 flex items-center gap-1">
            {isLoading ? (
              <>
                <span className={`w-1.5 h-1.5 rounded-full ${theme.statusPulse}`} />
                <span className="t-shimmer">{thinkingMessage || "Thinking…"}</span>
              </>
            ) : (
              /* Real backend + Xero status — no hardcoded "Connected" claims */
              <span className="flex items-center gap-2">
                <ApiHealthDot />
                <MemoryBadge />
              </span>
            )}
          </p>
        </div>

        {/* Persona toggle — explicit modes, described on switch */}
        <div className="flex items-center gap-1 bg-stone-100 rounded-full p-0.5">
          <button
            onClick={() => onPersonaChange("siki")}
            className={`text-xs font-semibold px-2.5 py-1 rounded-full transition-colors-quick btn-press ${
              persona === "siki"
                ? "bg-orange-400 text-white shadow-sm"
                : "text-stone-500 hover:text-stone-700"
            }`}
            title="Siki — friendly, finds savings, explains in plain English"
          >
            Siki
            <span className={`block text-[8px] font-normal leading-none ${persona === "siki" ? "text-orange-100" : "text-stone-400"}`}>
              explain
            </span>
          </button>
          <button
            onClick={() => onPersonaChange("zana")}
            className={`text-xs font-semibold px-2.5 py-1 rounded-full transition-colors-quick btn-press ${
              persona === "zana"
                ? `${zanaTheme.toggleActive} shadow-sm`
                : "text-stone-500 hover:text-stone-700"
            }`}
            title="Zana — direct, chases payments, flags uncomfortable truths"
          >
            Zana
            <span className={`block text-[8px] font-normal leading-none ${persona === "zana" ? zanaTheme.toggleActiveSub : "text-stone-400"}`}>
              chase
            </span>
          </button>
        </div>

        {/* Memory toggle — lets the user compare answers with and without memory recall */}
        <button
          onClick={onToggleMemory}
          className={`text-xs font-semibold px-2.5 py-1 rounded-full transition-colors btn-press ${
            memoryEnabled
              ? "bg-violet-100 text-violet-700 hover:bg-violet-200"
              : "bg-stone-100 text-stone-500 hover:bg-stone-200"
          }`}
          title={memoryEnabled ? "Memory is ON — Siki will recall and remember" : "Memory is OFF — compare what Siki would say without memory"}
        >
          {memoryEnabled ? "Memory: ON" : "Memory: OFF"}
        </button>

        {hasMessages &&
          (confirmClear ? (
            <div className="flex items-center gap-1">
              <button
                onClick={onConfirmClear}
                className="text-xs font-semibold text-white bg-red-500 hover:bg-red-600 px-2 py-1 rounded btn-press"
              >
                Clear
              </button>
              <button
                onClick={onCancelClear}
                className="text-xs text-stone-500 hover:text-stone-700 px-1.5 py-1 rounded btn-press"
              >
                ×
              </button>
            </div>
          ) : (
            <button
              onClick={onAskClear}
              className="flex items-center gap-1 text-xs text-stone-500 hover:text-stone-700 px-2 py-1 rounded hover:bg-stone-100 btn-press"
              title="Start a new conversation"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
              Clear
            </button>
          ))}
      </div>

      {/* Mode description — appears briefly after switching personas */}
      {modeHintShown && (
        <div
          className={`px-5 py-1.5 border-b text-xs fade-in-up ${theme.modeHintBar}`}
          role="status"
        >
          {persona === "siki"
            ? "Siki explains — who owes you, what your numbers mean, what's normal for your industry. No jargon."
            : "Zana enforces — chasing emails, escalation plans, customer scoring, hard truths. Let's get you paid."}
        </div>
      )}

      {/* Memory off nudge — when the memory store is unreachable, the agent works without memory. */}
      {!memoryAvailable && (
        <div className="bg-stone-50 border-b border-stone-200 px-5 py-2 text-xs text-stone-500 flex items-center justify-between gap-3 fade-in-up">
          <span>
            Memory is unavailable. Siki still works, but will not remember across sessions.
          </span>
          <Link
            href="/memory"
            className="shrink-0 text-violet-600 hover:text-violet-700 font-medium"
          >
            Start it →
          </Link>
        </div>
      )}
    </>
  );
}

export interface ChatBannersProps {
  errorBanner: string | null;
  upgradeBanner: string | null;
  chaseNotice: AutoChaseNoticeState | null;
  signInNudge: string | null;
  persona: Persona;
  theme: ReturnType<typeof getPersonaTheme>;
  onDismissError: () => void;
  onDismissUpgrade: () => void;
  onDismissChase: () => void;
  onDismissNudge: () => void;
}

/** Banner region — only one banner shows at a time, by priority:
    error > upgrade > chase notice > sign-in nudge. This prevents
    the stacking problem where 3-4 horizontal banners could eat the
    chat scroll area. Each banner has its own dismiss, which clears
    its state so the next-priority one (if any) becomes visible. */
export function ChatBanners({
  errorBanner,
  upgradeBanner,
  chaseNotice,
  signInNudge,
  persona,
  theme,
  onDismissError,
  onDismissUpgrade,
  onDismissChase,
  onDismissNudge,
}: ChatBannersProps) {
  if (errorBanner) {
    return (
      <div className="bg-red-50 border-b border-red-200 px-4 py-2 text-xs text-red-700 flex items-center justify-between fade-in-up">
        <span>{errorBanner}</span>
        <button
          onClick={onDismissError}
          className="text-red-500 hover:text-red-700 btn-press"
          aria-label="Dismiss"
        >
          ×
        </button>
      </div>
    );
  }
  if (upgradeBanner) {
    return (
      <div className={`border-b px-4 py-2.5 text-xs flex items-center justify-between gap-3 fade-in-up ${theme.hintBg} ${theme.toastBorder} ${theme.hintTextOnBg}`}>
        <span>{upgradeBanner}</span>
        <div className="flex items-center gap-2 shrink-0">
          <Link
            href="/account?intent=pro"
            className={`font-semibold text-white px-2.5 py-1 rounded-lg btn-press transition-colors ${theme.btnPrimary}`}
          >
            Upgrade
          </Link>
          <button
            onClick={onDismissUpgrade}
            className={`btn-press ${theme.hintTextStrong}`}
            aria-label="Dismiss upgrade prompt"
          >
            ×
          </button>
        </div>
      </div>
    );
  }
  if (chaseNotice) {
    return (
      <AutoChaseNotice
        persona={persona}
        notice={chaseNotice}
        onDismiss={onDismissChase}
      />
    );
  }
  if (signInNudge) {
    return (
      <div className="bg-violet-50 border-b border-violet-200 px-4 py-2.5 text-xs text-violet-900 flex items-center justify-between gap-3 fade-in-up">
        <span>{signInNudge}</span>
        <div className="flex items-center gap-2 shrink-0">
          <Link
            href="/account"
            className="font-semibold text-white bg-violet-600 hover:bg-violet-700 px-2.5 py-1 rounded-lg btn-press transition-colors"
          >
            Sign in
          </Link>
          <button
            onClick={onDismissNudge}
            className="text-violet-400 hover:text-violet-600 btn-press"
            aria-label="Dismiss sign-in prompt"
          >
            ×
          </button>
        </div>
      </div>
    );
  }
  return null;
}
