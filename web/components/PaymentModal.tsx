"use client";

import { useEffect, useState } from "react";
import { isValidKenyanPhone, formatKenyanPhone, maskPhone } from "@/lib/phone";
import { localStore, StorageKeys } from "@/lib/storage";
import { endpoints } from "@/lib/api";

interface PaymentModalProps {
  isOpen: boolean;
  amount: number;
  onClose: () => void;
  /** Called with the confirmed M-Pesa receipt + amount once payment succeeds. */
  onPaid: (receipt: { mpesa_receipt?: string | null; amount: number }) => void;
}

type PayState =
  | "idle"
  | "pushing"
  | "waiting"
  | "confirmed"
  | "failed"
  | "timeout";

const POLL_INTERVAL_MS = 3_000;
const POLL_MAX_ATTEMPTS = 60; // 3 minutes total
const MIN_PUSH_DISPLAY_MS = 2_000; // visible spinner even on fast API

function readLastPhone(): string {
  return localStore.get<string>(StorageKeys.LAST_PHONE, "");
}

export function PaymentModal({ isOpen, amount, onClose, onPaid }: PaymentModalProps) {
  const [phone, setPhone] = useState<string>(() => readLastPhone());
  const [state, setState] = useState<PayState>("idle");
  const [error, setError] = useState("");
  const [errorDetail, setErrorDetail] = useState("");
  const [attempt, setAttempt] = useState(0);

  // 1s ticker for the seconds counter; declared before any early return.
  const isProcessing = state === "pushing" || state === "waiting";
  const ticker = useTickerSeconds(isProcessing);

  if (!isOpen) {
    // Closed: render nothing (don't reset state here - reset happens on next open).
    return null;
  }

  const handlePay = async () => {
    setError("");
    setErrorDetail("");
    const cleaned = phone.replace(/[\s\-]/g, "");
    if (!cleaned) {
      setError("Please enter a phone number.");
      return;
    }
    if (!isValidKenyanPhone(cleaned)) {
      setError("Invalid number. Example: 0712345678");
      return;
    }

    setState("pushing");

    /* eslint-disable react-hooks/purity -- Date.now() is fine inside an async event handler */
    const pushStartedAt = Date.now();

    let checkoutId: string | undefined;
    try {
      const pushData = await endpoints.stkPush(cleaned, amount, "premium-audit");
      checkoutId = pushData.CheckoutRequestID;
      if (!checkoutId) {
        setErrorDetail(
          pushData.errorMessage || pushData.ResponseDescription || "No response from M-Pesa.",
        );
        setState("failed");
        return;
      }
    } catch (e) {
      setErrorDetail(e instanceof Error ? e.message : "Network error.");
      setState("failed");
      return;
    }

    localStore.set(StorageKeys.LAST_PHONE, cleaned);

    // Hold the "pushing" UI for at least MIN_PUSH_DISPLAY_MS even if we're
    // about to flip to waiting.
    const elapsed = Date.now() - pushStartedAt;
    /* eslint-enable react-hooks/purity */
    if (elapsed < MIN_PUSH_DISPLAY_MS) {
      await new Promise((r) => setTimeout(r, MIN_PUSH_DISPLAY_MS - elapsed));
    }

    setState("waiting");
    setAttempt(0);

    for (let i = 0; i < POLL_MAX_ATTEMPTS; i++) {
      setAttempt(i + 1);
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      try {
        const status = await endpoints.paymentStatus(checkoutId);
        if (status.status === "CONFIRMED") {
          setState("confirmed");
          onPaid({ mpesa_receipt: status.mpesa_receipt, amount: status.amount ?? amount });
          setTimeout(() => handleClose(true), 1500);
          return;
        }
        if (status.status === "FAILED") {
          setErrorDetail(status.result_desc || "Payment failed.");
          setState("failed");
          return;
        }
      } catch {
        // keep polling through transient network blips
      }
    }
    setErrorDetail(
      `Your M-Pesa window expired after ${Math.round(
        (POLL_MAX_ATTEMPTS * POLL_INTERVAL_MS) / 1000,
      )} seconds.`,
    );
    setState("timeout");
  };

  const resetForClose = () => {
    setState("idle");
    setError("");
    setErrorDetail("");
    setAttempt(0);
    setPhone(readLastPhone());
  };

  const handleClose = (silent = false) => {
    resetForClose();
    if (!silent) onClose();
  };

  return (
    <div
      className="fixed inset-0 bg-stone-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={(e) => e.target === e.currentTarget && !isProcessing && handleClose()}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden fade-in-up">
        <div className="bg-gradient-to-r from-amber-500 to-amber-600 p-5 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                />
              </svg>
              <h2 className="text-lg font-bold">Premium Deep Audit</h2>
            </div>
            {!isProcessing && (
              <button
                onClick={() => handleClose()}
                aria-label="Close"
                className="text-white/70 hover:text-white transition"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
          <p className="text-sm text-amber-50 mt-1">
            Deep financial cross-referencing with on-chain verdict
          </p>
        </div>

        <div className="p-6 space-y-4">
          {state === "idle" && (
            <>
              <div className="bg-stone-50 border border-stone-200 rounded-xl p-4">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm text-stone-600">Premium Audit Fee</span>
                  <span className="text-2xl font-bold text-stone-900">
                    {amount} <span className="text-sm font-normal text-stone-500">KES</span>
                  </span>
                </div>
                <ul className="space-y-1.5 text-xs text-stone-600">
                  {[
                    "Deep M-Pesa statement analysis",
                    "Bylaw cross-referencing with citations",
                    "Verdict committed to Vara Network",
                    "Bank Readiness Report included",
                  ].map((feature) => (
                    <li key={feature} className="flex items-center gap-2">
                      <svg
                        className="w-3.5 h-3.5 text-emerald-600 shrink-0"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                      {feature}
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <label className="block text-xs font-medium text-stone-600 mb-1.5">
                  M-Pesa Phone Number
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handlePay()}
                  placeholder="0712345678"
                  className="w-full p-3 border border-stone-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                  autoFocus
                />
                {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
                {phone && isValidKenyanPhone(phone.replace(/[\s\-]/g, "")) && (
                  <p className="text-[10px] text-stone-400 mt-1">
                    We'll use: {formatKenyanPhone(phone)}
                  </p>
                )}
              </div>

              <button
                onClick={handlePay}
                className="w-full bg-amber-600 hover:bg-amber-700 text-white font-semibold py-3 rounded-xl transition flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M10 2a1 1 0 011 1v1.323l3.954 1.582 1.599-.8a1 1 0 01.894 1.79l-1.233.616 1.738 5.42a1 1 0 01-.285 1.05A3.989 3.989 0 0115 15a3.989 3.989 0 01-2.667-1.019 1 1 0 01-.285-1.05l1.715-5.349L11 6.477V16h2a1 1 0 110 2H7a1 1 0 110-2h2V6.477L6.237 7.582l1.715 5.349a1 1 0 01-.285 1.05A3.989 3.989 0 015 15a3.989 3.989 0 01-2.667-1.019 1 1 0 01-.285-1.05l1.738-5.42-1.233-.617a1 1 0 01.894-1.788l1.599.799L9 4.323V3a1 1 0 011-1z" />
                </svg>
                Pay {amount} KES via M-Pesa
              </button>
              <p className="text-[10px] text-stone-400 text-center">
                You&apos;ll get an M-Pesa prompt on {phone ? maskPhone(phone) : "your phone"}.
                Enter your PIN to authorise.
                {phone && (
                  <>
                    {" "}
                    <button
                      type="button"
                      onClick={() => setPhone("")}
                      className="ml-1 underline hover:text-stone-600"
                    >
                      Use different number
                    </button>
                  </>
                )}
              </p>
            </>
          )}

          {(state === "pushing" || state === "waiting") && (
            <div className="py-6 text-center space-y-4">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-amber-100 rounded-full">
                <svg
                  className="w-8 h-8 text-amber-600 animate-pulse"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-stone-700">
                  {state === "pushing"
                    ? "Sending request to Safaricom..."
                    : `Check your phone (${maskPhone(phone)}). Enter your PIN.`}
                </p>
                <div className="flex justify-center gap-1 mt-3">
                  <span className="typing-dot w-2 h-2 bg-amber-400 rounded-full" />
                  <span className="typing-dot w-2 h-2 bg-amber-400 rounded-full" />
                  <span className="typing-dot w-2 h-2 bg-amber-400 rounded-full" />
                </div>
                <p className="text-[10px] text-stone-400 mt-3">
                  Waiting for M-Pesa... {ticker.seconds}m {String(ticker.seconds).padStart(2, "0")}
                  s ({attempt}/{POLL_MAX_ATTEMPTS})
                </p>
              </div>
            </div>
          )}

          {state === "confirmed" && (
            <div className="py-8 text-center space-y-4">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-emerald-100 rounded-full">
                <svg
                  className="w-8 h-8 text-emerald-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-sm font-medium text-stone-700">
                Payment approved! Running deep audit...
              </p>
            </div>
          )}

          {(state === "failed" || state === "timeout") && (
            <div className="py-6 text-center space-y-4">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-red-100 rounded-full">
                <svg
                  className="w-8 h-8 text-red-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-stone-700">
                  {state === "timeout" ? "Payment Time Expired" : "Payment Failed"}
                </p>
                {errorDetail && <p className="text-xs text-stone-500 mt-2 px-4">{errorDetail}</p>}
              </div>
              <div className="flex gap-2 justify-center">
                <button
                  onClick={() => setState("idle")}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium rounded-lg transition"
                >
                  Try Again
                </button>
                <button
                  onClick={() => handleClose()}
                  className="px-4 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 text-sm font-medium rounded-lg transition"
                >
                  Close
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Tiny ticker that increments every second while active.
// Side effect (interval) is the textbook useEffect use case; the
// react-hooks/set-state-in-effect rule targets syncing external state.
function useTickerSeconds(active: boolean) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [active]);
  return { seconds };
}
