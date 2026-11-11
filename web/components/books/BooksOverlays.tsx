"use client";

import Link from "next/link";
import type { RefObject } from "react";
import { SikiMascot } from "@/components/SikiMascot";
import { ZanaMascot } from "@/components/ZanaMascot";
import { SuccessCheck } from "@/components/SuccessCheck";
import { AnimatedNumber } from "@/components/AnimatedNumber";
import { ProactiveAlert } from "@/components/ProactiveAlert";
import { findingsSummary } from "@/components/FindingsPanel";
import type { FindingsResponse } from "@/lib/api";
import type {
  getConnectMomentCopy,
  getPersonaTheme,
  getRecoveredCelebrationCopy,
  Persona,
} from "@/lib/persona-theme";

export interface BooksOverlaysProps {
  persona: Persona;
  theme: ReturnType<typeof getPersonaTheme>;
  findings: FindingsResponse | null;
  showSuccessCheck: boolean;
  successDialogRef: RefObject<HTMLDivElement | null>;
  onDismissSuccess: () => void;
  connectStage: "analyzing" | "reveal" | null;
  connectCopy: ReturnType<typeof getConnectMomentCopy>;
  onDismissConnect: () => void;
  showConnectConfirm: boolean;
  connecting: boolean;
  onStartOAuth: () => void;
  onCancelConnect: () => void;
  recoveredCelebration: number | null;
  recoveredCopy: ReturnType<typeof getRecoveredCelebrationCopy>;
  onDismissRecovered: () => void;
}

/** Full-attention moments: journal-posted check, post-connect reveal,
    pre-OAuth consent, recovered-payment celebration, proactive alerts. */
export function BooksOverlays({
  persona,
  theme,
  findings,
  showSuccessCheck,
  successDialogRef,
  onDismissSuccess,
  connectStage,
  connectCopy,
  onDismissConnect,
  showConnectConfirm,
  connecting,
  onStartOAuth,
  onCancelConnect,
  recoveredCelebration,
  recoveredCopy,
  onDismissRecovered,
}: BooksOverlaysProps) {
  return (
    <>
      {/* Success check overlay — plays when a journal entry actually posts to Xero.
          Escape or a click anywhere dismisses it. */}
      {showSuccessCheck && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm fade-in-up"
          onClick={onDismissSuccess}
        >
          <div
            ref={successDialogRef}
            role="dialog"
            aria-modal="true"
            aria-label="Journal entry posted to Xero"
            tabIndex={-1}
            className="bg-white rounded-2xl shadow-2xl p-8 flex flex-col items-center gap-4 focus:outline-none"
          >
            <SikiMascot size={80} mood="celebrate" />
            <SuccessCheck show={showSuccessCheck} size={48} className="text-emerald-600" />
            <p className="text-sm font-semibold text-stone-800">Journal entry posted to Xero</p>
            <p className="text-xs text-stone-500">Your books are now reconciled.</p>
          </div>
        </div>
      )}

      {/* Post-connect moment — full-attention staging after the OAuth
          return: Siki "reads" the fresh books, then reveals what it found
          with the money number front and centre. */}
      {connectStage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label={connectCopy.ariaLabel}
        >
          <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-sm w-full mx-4 flex flex-col items-center gap-3 text-center fade-in-up">
            {connectStage === "analyzing" ? (
              <>
                {persona === "zana" ? (
                  <ZanaMascot size={80} mood="look" />
                ) : (
                  <SikiMascot size={80} mood="look" />
                )}
                <p className="text-sm font-semibold text-stone-800">
                  {connectCopy.analyzingTitle}
                </p>
                <p className="text-xs text-stone-500 t-shimmer">
                  {connectCopy.analyzingSub}
                </p>
              </>
            ) : (
              <>
                {persona === "zana" ? (
                  <ZanaMascot
                    size={80}
                    mood={findings && !findings.clean ? "look" : "celebrate"}
                  />
                ) : (
                  <SikiMascot
                    size={80}
                    mood={findings && !findings.clean ? "look" : "celebrate"}
                  />
                )}
                {findings && findings.money_found > 0 ? (
                  <>
                    <div className={`text-4xl font-bold leading-none ${persona === "zana" ? "text-rose-700" : "text-stone-900"}`}>
                      <AnimatedNumber prefix="£" value={Math.round(findings.money_found)} />
                    </div>
                    <p className="text-sm font-semibold text-stone-800">
                      {connectCopy.revealMoneySub}
                    </p>
                    <p className="text-xs text-stone-500">{findingsSummary(findings)}</p>
                  </>
                ) : findings && !findings.clean ? (
                  <>
                    <p className="text-sm font-semibold text-stone-800">
                      {connectCopy.revealIssuesTitle}
                    </p>
                    <p className="text-xs text-stone-500">{findingsSummary(findings)}</p>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-semibold text-stone-800">
                      {connectCopy.revealCleanTitle}
                    </p>
                    <p className="text-xs text-stone-500">{connectCopy.revealCleanSub}</p>
                  </>
                )}
                <button
                  onClick={onDismissConnect}
                  className={`mt-2 text-sm font-semibold ${theme.btnPrimary} px-5 py-2 rounded-lg btn-press transition-colors`}
                >
                  {connectCopy.showMe}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Pre-OAuth consent — the trust moment. Users are handing over
          their company's books; answer the five questions they're
          actually asking BEFORE Xero's permissions page appears. */}
      {showConnectConfirm && (
        <div
          className="fixed inset-0 z-50 bg-stone-900/40 backdrop-blur-sm flex items-center justify-center p-4 fade-in"
          onClick={onCancelConnect}
          onKeyDown={(e) => {
            if (e.key === "Escape") onCancelConnect();
          }}
          role="dialog"
          aria-modal="true"
          aria-label="Before you connect your Xero"
        >
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 fade-in-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3 mb-4">
              {persona === "zana" ? (
                <ZanaMascot size={40} mood="look" />
              ) : (
                <SikiMascot size={40} mood="idle" />
              )}
              <div>
                <h2 className="text-sm font-bold text-stone-900">Before you connect</h2>
                <p className="text-xs text-stone-600 mt-0.5">
                  You&apos;re about to share your company&apos;s books. Here&apos;s exactly what
                  that means:
                </p>
              </div>
            </div>

            <ul className="space-y-2.5 mb-5 text-xs text-stone-700">
              <li className="flex gap-2.5">
                <span aria-hidden="true">👀</span>
                <span>
                  <span className="font-semibold">Siki reads</span> your invoices, contacts, bank
                  transactions, and reports — on demand, not bulk-copied.
                </span>
              </li>
              <li className="flex gap-2.5">
                <span aria-hidden="true">🔒</span>
                <span>
                  <span className="font-semibold">Siki can&apos;t change anything, Zana
                  can&apos;t chase anyone</span> — without you. Every entry and every email
                  needs your explicit approval first.
                </span>
              </li>
              <li className="flex gap-2.5">
                <span aria-hidden="true">🤐</span>
                <span>
                  <span className="font-semibold">Never sold, never shared</span> with advertisers,
                  never used to train AI models. Access tokens are encrypted.
                </span>
              </li>
              <li className="flex gap-2.5">
                <span aria-hidden="true">🚪</span>
                <span>
                  <span className="font-semibold">Leave anytime</span> — one click disconnects
                  instantly, and &quot;Delete my data&quot; erases everything we stored.
                </span>
              </li>
            </ul>

            <div className="flex gap-2">
              <button
                onClick={onStartOAuth}
                disabled={connecting}
                className={`flex-1 text-xs font-semibold px-4 py-2.5 rounded-lg ${theme.btnPrimary} btn-press transition-colors disabled:opacity-50`}
              >
                {connecting ? "Connecting…" : "Continue to Xero →"}
              </button>
              <button
                onClick={onCancelConnect}
                disabled={connecting}
                className="text-xs font-semibold px-4 py-2.5 rounded-lg bg-stone-100 text-stone-700 hover:bg-stone-200 btn-press transition-colors disabled:opacity-50"
              >
                Not yet
              </button>
            </div>
            <p className="text-xs text-stone-400 mt-3 text-center">
              Full details:{" "}
              <Link href="/security" className={`${theme.link} underline`}>
                how your data is protected
              </Link>
            </p>
          </div>
        </div>
      )}

      {/* The payment moment — a chased invoice got PAID since the last
          visit. The product's climax gets the full celebration, not a
          log line. Click anywhere or Escape to dismiss. */}
      {recoveredCelebration !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm fade-in-up"
          onClick={onDismissRecovered}
          onKeyDown={(e) => {
            if (e.key === "Escape") onDismissRecovered();
          }}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-label="Money recovered"
        >
          <div className={`rounded-2xl shadow-2xl p-8 flex flex-col items-center gap-3 text-center max-w-sm mx-4 ${recoveredCopy.panelClass}`}>
            {persona === "zana" ? (
              <ZanaMascot size={90} mood="celebrate" />
            ) : (
              <SikiMascot size={90} mood="celebrate" />
            )}
            <div className={`text-4xl font-bold leading-none ${recoveredCopy.amountClass}`}>
              <AnimatedNumber prefix="£" value={Math.round(recoveredCelebration)} />
            </div>
            <p className="text-sm font-semibold text-stone-800">
              {recoveredCopy.headline}
            </p>
            <p className="text-xs text-stone-500">{recoveredCopy.subline}</p>
            <button
              onClick={onDismissRecovered}
              className={`mt-2 text-sm font-semibold px-5 py-2 rounded-lg btn-press transition-colors ${recoveredCopy.buttonClass}`}
            >
              {recoveredCopy.button}
            </button>
          </div>
        </div>
      )}

      {/* Proactive webhook alerts */}
      <ProactiveAlert persona={persona} />
    </>
  );
}
