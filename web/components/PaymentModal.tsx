"use client";

import { useState } from "react";

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (phone: string) => Promise<boolean>;
  amount: number;
}

type PayState = "idle" | "pushing" | "waiting" | "confirmed" | "failed" | "timeout";

const STATUS_MESSAGES: Record<PayState, string> = {
  idle: "",
  pushing: "Sending M-Pesa prompt to your phone...",
  waiting: "Check your phone and enter your M-Pesa PIN to authorize payment.",
  confirmed: "Payment confirmed! Starting your premium audit...",
  failed: "Payment was declined or failed. Please try again.",
  timeout: "Payment timed out. Please try again.",
};

export function PaymentModal({ isOpen, onClose, onConfirm, amount }: PaymentModalProps) {
  const [phone, setPhone] = useState("");
  const [state, setState] = useState<PayState>("idle");
  const [error, setError] = useState("");

  if (!isOpen) return null;

  const handlePay = async () => {
    setError("");
    if (!phone.trim()) {
      setError("Tafadhali ingiza namba ya simu.");
      return;
    }
    const normalized = phone.trim().replace(/\s/g, "");
    if (!/^(?:\+?254|0)?[17]\d{8}$/.test(normalized)) {
      setError("Namba si sahihi. Mfano: 0712345678");
      return;
    }

    setState("pushing");
    const success = await onConfirm(normalized);
    if (success) {
      setState("confirmed");
      setTimeout(() => {
        handleClose();
      }, 2000);
    } else {
      setState("failed");
    }
  };

  const handleClose = () => {
    setState("idle");
    setPhone("");
    setError("");
    onClose();
  };

  const isProcessing = state === "pushing" || state === "waiting";

  return (
    <div
      className="fixed inset-0 bg-stone-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={(e) => e.target === e.currentTarget && !isProcessing && handleClose()}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden fade-in-up">
        {/* Header */}
        <div className="bg-gradient-to-r from-amber-500 to-amber-600 p-5 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              <h2 className="text-lg font-bold">Premium Deep Audit</h2>
            </div>
            {!isProcessing && (
              <button
                onClick={handleClose}
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

        {/* Body */}
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
                  <li className="flex items-center gap-2">
                    <svg className="w-3.5 h-3.5 text-emerald-600 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    Deep M-Pesa statement analysis
                  </li>
                  <li className="flex items-center gap-2">
                    <svg className="w-3.5 h-3.5 text-emerald-600 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    Bylaw cross-referencing with citations
                  </li>
                  <li className="flex items-center gap-2">
                    <svg className="w-3.5 h-3.5 text-emerald-600 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    Verdict committed to Vara Network
                  </li>
                  <li className="flex items-center gap-2">
                    <svg className="w-3.5 h-3.5 text-emerald-600 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    Bank Readiness Report included
                  </li>
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
                You will receive an M-Pesa prompt on your phone. Enter your PIN to authorize.
              </p>
            </>
          )}

          {(state === "pushing" || state === "waiting") && (
            <div className="py-8 text-center space-y-4">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-amber-100 rounded-full">
                <svg className="w-8 h-8 text-amber-600 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-stone-700">
                  {STATUS_MESSAGES[state]}
                </p>
                <div className="flex justify-center gap-1 mt-3">
                  <span className="typing-dot w-2 h-2 bg-amber-400 rounded-full"></span>
                  <span className="typing-dot w-2 h-2 bg-amber-400 rounded-full"></span>
                  <span className="typing-dot w-2 h-2 bg-amber-400 rounded-full"></span>
                </div>
              </div>
            </div>
          )}

          {state === "confirmed" && (
            <div className="py-8 text-center space-y-4">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-emerald-100 rounded-full">
                <svg className="w-8 h-8 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-sm font-medium text-stone-700">
                {STATUS_MESSAGES.confirmed}
              </p>
            </div>
          )}

          {state === "failed" && (
            <div className="py-8 text-center space-y-4">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-red-100 rounded-full">
                <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <p className="text-sm font-medium text-stone-700">
                {STATUS_MESSAGES.failed}
              </p>
              <button
                onClick={() => setState("idle")}
                className="text-sm text-amber-600 font-medium hover:underline"
              >
                Try Again
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
