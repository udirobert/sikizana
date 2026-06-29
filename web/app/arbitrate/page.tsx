"use client";

import { useEffect, useRef, useState, Suspense } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { useThreadPersistence } from "@/hooks/useThreadPersistence";
import { useUserPrefs } from "@/hooks/useUserPrefs";
import { ApiError, endpoints } from "@/lib/api";
import { PaymentModal } from "@/components/PaymentModal";
import { RevenueBadge } from "@/components/RevenueBadge";
import { PremiumSendButton } from "@/components/PremiumSendButton";
import { ApiHealthDot } from "@/components/ApiHealthDot";
import { MarkdownMessage } from "@/components/MarkdownMessage";
import { FeedbackButtons } from "@/components/FeedbackButtons";
import { OnboardingFlow } from "@/components/OnboardingFlow";
import { SAMPLE_DISPUTES, findSample } from "@/lib/samples";
import { localStore, StorageKeys } from "@/lib/storage";const VaraConnect = dynamic(
  () => import("@/components/VaraConnect").then((m) => m.VaraConnect),
  { ssr: false },
);

const PREMIUM_AMOUNT = 100;

function ChatView() {
  const searchParams = useSearchParams();
  const {
    threadId,
    messages,
    addMessage,
    ensureThread,
    newSession,
  } = useThreadPersistence();

  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [pendingMessage, setPendingMessage] = useState("");
  const [pendingReceipt, setPendingReceipt] = useState<{
    mpesa_receipt?: string | null;
    amount: number;
  } | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  const prefs = useUserPrefs();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Apply ?sample= query param once, when the chat is empty.
  const sampleId = searchParams.get("sample");
  const sample = sampleId ? findSample(sampleId) : undefined;
  const shouldSeedSample = Boolean(
    sample && messages.length === 0 && !input && prefs.onboarded,
  );
  // Seed input via a state-setter callback so React detects the change.
  if (shouldSeedSample) {
    setInput(sample!.description);
  }

  const sendToAgent = async (message: string, isPremium: boolean, receipt?: string | null) => {
    setIsLoading(true);
    setErrorBanner(null);
    const tid = ensureThread();
    try {
      const tagged = isPremium
        ? `[PREMIUM AUDIT REQUESTED - PAID${receipt ? ` receipt=${receipt}` : ""}] ${message}`
        : message;
      const data = await endpoints.chat(tagged, tid);
      addMessage({
        role: "agent",
        content: data.response,
        isPremium,
        receiptId: receipt ?? undefined,
      });
    } catch (e) {
      const detail =
        e instanceof ApiError
          ? `Sikizana imeshindwa kujibu (${e.status}).`
          : e instanceof Error
          ? e.message
          : "Hitilafu isiyojulikana.";
      addMessage({
        role: "agent",
        content: `Pole sana, ${detail} Jaribu tena baadaye.`,
      });
      setErrorBanner(detail);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSend = () => {
    if (!input.trim() || isLoading) return;
    const text = input.trim();
    setInput("");
    addMessage({ role: "user", content: text });
    sendToAgent(text, false);
  };

  const handlePremiumClick = () => {
    if (!input.trim() || isLoading) return;
    setPendingMessage(input.trim());
    setShowPayment(true);
  };

  const handlePaymentPaid = async (receipt: { mpesa_receipt?: string | null; amount: number }) => {
    setShowPayment(false);
    setPendingReceipt(receipt);
    addMessage({ role: "user", content: pendingMessage });
    setInput("");
    await sendToAgent(pendingMessage, true, receipt.mpesa_receipt ?? undefined);
    setPendingMessage("");
    setPendingReceipt(null);
  };

  const handleOnboardingComplete = (
    selectedLanguage: "en" | "sw" | "sheng",
    chamaName: string,
    disputeKind: string,
  ) => {
    localStore.set(StorageKeys.ONBOARDED, true);
    localStore.set(StorageKeys.PREFERRED_LANGUAGE, selectedLanguage);
    window.dispatchEvent(new Event("sikizana:storage"));
    const greeting =
      selectedLanguage === "sw"
        ? `Karibu ${chamaName ? `kwa ${chamaName}` : ""}! Niambie kuhusu mzozo wako.`
        : selectedLanguage === "sheng"
        ? `Poa ${chamaName ? `${chamaName}` : ""}! Sema kuhusu ule mzozo, nitakusaidia.`
        : `Welcome${chamaName ? ` to ${chamaName}` : ""}! Tell me about your dispute.`;
    addMessage({ role: "agent", content: greeting });

    // Auto-capture this chama as a lead so the team has signal to follow up.
    if (chamaName && chamaName.trim().length >= 2) {
      void endpoints.leads
        .create({
          chama_name: chamaName.trim(),
          language: selectedLanguage,
          source: "onboarding",
          notes: disputeKind ? `First dispute type: ${disputeKind}` : undefined,
          status: "demoed",
        })
        .catch(() => {
          // Best-effort: don't break the chat if the backend is offline.
        });
    }
  };

  const handleStartSample = (description: string) => {
    setInput(description);
  };

  if (!prefs.onboarded) {
    return <OnboardingFlow onComplete={handleOnboardingComplete} />;
  }

  return (
    <main className="min-h-screen bg-stone-100 flex flex-col">
      <nav className="bg-white border-b border-stone-200 px-4 py-3">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-gradient-to-br from-emerald-600 to-emerald-800 rounded-lg flex items-center justify-center shadow-sm">
              <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" />
              </svg>
            </div>
            <div>
              <h1 className="text-base font-bold text-stone-900 leading-none">SIKIZANA</h1>
              <p className="text-[10px] text-stone-500 leading-none mt-0.5">
                AI Arbitration for Chamas
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ApiHealthDot />
            <RevenueBadge />
            <VaraConnect />
          </div>
        </div>
      </nav>

      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-2xl bg-white rounded-2xl shadow-xl flex flex-col h-[78vh] overflow-hidden border border-stone-200">
          <div className="px-5 py-3 border-b border-stone-100 flex items-center gap-3">
            <div className="relative">
              <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-full flex items-center justify-center">
                <span className="text-white font-bold text-sm">S</span>
              </div>
              <div className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-400 border-2 border-white rounded-full" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-stone-800">Sikizana Arbitrator</p>
              <p className="text-[11px] text-stone-500 flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                Online · Powered by Gemini ·{" "}
                {prefs.language === "sw"
                  ? "Kiswahili"
                  : prefs.language === "sheng"
                  ? "Sheng"
                  : "English"}
              </p>
            </div>
            <div className="flex items-center gap-1.5 px-2 py-1 bg-stone-100 rounded-lg">
              <svg className="w-3 h-3 text-stone-500" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  clipRule="evenodd"
                />
              </svg>
              <span className="text-[10px] font-medium text-stone-600">Vara Secured</span>
            </div>
            {messages.length > 0 && (
              <button
                onClick={newSession}
                className="text-[10px] text-stone-500 hover:text-stone-700 px-2 py-1 rounded hover:bg-stone-100"
                title="Anza mazungumzo mapya"
              >
                Mpya
              </button>
            )}
          </div>

          {errorBanner && (
            <div className="bg-red-50 border-b border-red-200 px-4 py-2 text-xs text-red-700 flex items-center justify-between">
              <span>{errorBanner}</span>
              <button
                onClick={() => setErrorBanner(null)}
                className="text-red-500 hover:text-red-700"
                aria-label="Funga"
              >
                ×
              </button>
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-5 space-y-4 scroll-thin">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center px-8">
                <div className="w-16 h-16 bg-emerald-50 rounded-2xl flex items-center justify-center mb-4">
                  <svg className="w-8 h-8 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                </div>
                <h2 className="text-lg font-semibold text-stone-800 mb-1">
                  {prefs.language === "sw"
                    ? "Karibu kwa Sikizana"
                    : prefs.language === "sheng"
                    ? "Poa, karibu!"
                    : "Welcome to Sikizana"}
                </h2>
                <p className="text-sm text-stone-500 max-w-sm">
                  {prefs.language === "sw"
                    ? "Mimi ni AI arbitrator wako. Niambie kuhusu mzozo wa chama yako, nami nitakusaidia kupata suluhisho."
                    : prefs.language === "sheng"
                    ? "Mimi ni AI arbitrator yako. Sema kuhusu ule mzozo wa chama, nitakusaidia."
                    : "I'm your AI arbitrator. Tell me about your chama dispute and I'll help you reach a resolution."}
                </p>
                <p className="text-[11px] text-stone-400 mt-3 max-w-sm">
                  The more details you share (names, dates, amounts, what happened), the better the verdict.
                </p>

                <div className="mt-6 grid grid-cols-1 gap-2 w-full max-w-sm">
                  <p className="text-[10px] uppercase tracking-wide text-stone-400 font-semibold text-left">
                    Try a sample dispute
                  </p>
                  {SAMPLE_DISPUTES.map((sample) => (
                    <button
                      key={sample.id}
                      onClick={() => handleStartSample(sample.description)}
                      className="text-left text-xs text-stone-600 bg-stone-50 hover:bg-stone-100 border border-stone-200 rounded-lg px-3 py-2 transition"
                    >
                      <div className="font-medium text-stone-800">{sample.title}</div>
                      <div className="text-stone-400 mt-0.5 line-clamp-2">
                        {sample.description.slice(0, 80)}...
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, i) => {
              const agentIndex = messages
                .slice(0, i + 1)
                .filter((m) => m.role === "agent").length - 1;

              return (
                <div
                  key={i}
                  className={`flex gap-2.5 fade-in-up ${
                    msg.role === "user" ? "flex-row-reverse" : "flex-row"
                  }`}
                >
                  {msg.role === "agent" && (
                    <div className="w-8 h-8 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-full flex items-center justify-center shrink-0">
                      <span className="text-white font-bold text-xs">S</span>
                    </div>
                  )}
                  <div
                    className={`max-w-[75%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                      msg.role === "user"
                        ? "bg-emerald-600 text-white rounded-tr-sm"
                        : msg.isPremium
                        ? "bg-amber-50 text-stone-800 border border-amber-200 rounded-tl-sm"
                        : "bg-stone-100 text-stone-800 rounded-tl-sm"
                    }`}
                  >
                    {msg.isPremium && msg.role === "agent" && (
                      <div className="flex items-center gap-1 mb-1.5 text-[10px] font-semibold text-amber-700 uppercase tracking-wide">
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                        </svg>
                        Premium Audit
                      </div>
                    )}
                    {msg.role === "agent" ? (
                      <>
                        <MarkdownMessage source={msg.content} />
                        <FeedbackButtons
                          threadId={threadId}
                          messageIndex={agentIndex}
                          initial={msg.feedback ?? null}
                        />
                      </>
                    ) : (
                      msg.content
                    )}
                  </div>
                </div>
              );
            })}

            {isLoading && (
              <div className="flex gap-2.5 fade-in-up">
                <div className="w-8 h-8 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-full flex items-center justify-center shrink-0">
                  <span className="text-white font-bold text-xs">S</span>
                </div>
                <div className="bg-stone-100 px-4 py-3 rounded-2xl rounded-tl-sm flex items-center gap-1.5">
                  <span className="typing-dot w-2 h-2 bg-stone-400 rounded-full" />
                  <span className="typing-dot w-2 h-2 bg-stone-400 rounded-full" />
                  <span className="typing-dot w-2 h-2 bg-stone-400 rounded-full" />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="border-t border-stone-100 p-3 bg-stone-50/50">
            <div className="flex gap-2 items-end">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSend()}
                placeholder={
                  prefs.language === "sw"
                    ? "Eleza mzozo wako..."
                    : prefs.language === "sheng"
                    ? "Sema kuhusu mzozo..."
                    : "Describe your dispute..."
                }
                disabled={isLoading}
                className="flex-1 px-4 py-2.5 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 bg-white disabled:opacity-50"
              />
              <button
                onClick={handleSend}
                disabled={isLoading || !input.trim()}
                className="p-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl transition disabled:opacity-40 disabled:cursor-not-allowed"
                title="Tuma (Standard Mediation - Free)"
                aria-label="Send"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              </button>
              <PremiumSendButton
                active={false}
                disabled={isLoading || !input.trim()}
                onClick={handlePremiumClick}
                amount={PREMIUM_AMOUNT}
              />
            </div>
            <div className="flex items-center justify-center gap-3 mt-2">
              <span className="text-[10px] text-stone-500">
                Standard Mediation (Free)
              </span>
              <span className="text-stone-300">·</span>
              <span className="text-[10px] font-medium text-amber-600">
                Premium Deep Audit ({PREMIUM_AMOUNT} KES via M-Pesa)
              </span>
            </div>
          </div>
        </div>
      </div>

      <footer className="text-center py-3">
        <p className="text-[10px] text-stone-400">
          AI-Native Financial Inclusion · Powered by Gemini · Secured on Vara Network
        </p>
      </footer>

      <PaymentModal
        isOpen={showPayment}
        amount={PREMIUM_AMOUNT}
        onClose={() => {
          setShowPayment(false);
          setPendingMessage("");
        }}
        onPaid={handlePaymentPaid}
      />

      {pendingReceipt && (
        <div className="fixed bottom-4 right-4 bg-emerald-600 text-white px-4 py-2 rounded-lg shadow-lg text-xs fade-in-up">
          <div className="font-semibold">Malipo yamekamilika!</div>
          <div className="opacity-80">
            {pendingReceipt.amount} KES
            {pendingReceipt.mpesa_receipt && ` · Receipt ${pendingReceipt.mpesa_receipt}`}
          </div>
        </div>
      )}
    </main>
  );
}

export default function ArbitratePage() {
  return (
    <Suspense fallback={null}>
      <ChatView />
    </Suspense>
  );
}
