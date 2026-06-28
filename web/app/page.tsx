"use client";

import { useState, useRef, useEffect } from "react";
import dynamic from "next/dynamic";
import { PaymentModal } from "@/components/PaymentModal";
import { RevenueBadge } from "@/components/RevenueBadge";

const VaraConnect = dynamic(
  () => import("@/components/VaraConnect").then((m) => m.VaraConnect),
  { ssr: false }
);

interface Message {
  role: "user" | "agent";
  content: string;
  isPremium?: boolean;
}

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8080";

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [pendingMessage, setPendingMessage] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const pollPaymentStatus = async (checkoutId: string): Promise<boolean> => {
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      try {
        const res = await fetch(`${API_BASE}/api/payments/status/${checkoutId}`);
        const data = await res.json();
        if (data.status === "CONFIRMED") return true;
        if (data.status === "FAILED") return false;
      } catch {
        // keep polling
      }
    }
    return false;
  };

  const handlePaymentConfirm = async (phone: string): Promise<boolean> => {
    try {
      const pushRes = await fetch(`${API_BASE}/api/payments/stk-push`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone,
          amount: 100,
          dispute_context: pendingMessage,
        }),
      });
      const pushData = await pushRes.json();
      const checkoutId = pushData.CheckoutRequestID;
      if (!checkoutId) return false;

      return await pollPaymentStatus(checkoutId);
    } catch {
      return false;
    }
  };

  const sendToAgent = async (message: string, isPremium: boolean) => {
    setIsLoading(true);
    try {
      const userMessage = isPremium
        ? `[PREMIUM AUDIT REQUESTED - PAID] ${message}`
        : message;

      const response = await fetch(`${API_BASE}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMessage }),
      });

      const data = await response.json();
      setMessages((prev) => [
        ...prev,
        { role: "agent", content: data.response, isPremium },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "agent",
          content: "Pole sana, kuna itilafu kidogo. Jaribu tena baadaye.",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSend = () => {
    if (!input.trim() || isLoading) return;
    const userText = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userText }]);
    sendToAgent(userText, false);
  };

  const handlePremiumSend = () => {
    if (!input.trim() || isLoading) return;
    const userText = input.trim();
    setPendingMessage(userText);
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userText }]);
    setShowPayment(true);
  };

  const handlePaymentSuccess = () => {
    setShowPayment(false);
    sendToAgent(pendingMessage, true);
    setPendingMessage("");
  };

  return (
    <main className="min-h-screen bg-stone-100 flex flex-col">
      {/* Top Nav */}
      <nav className="bg-white border-b border-stone-200 px-4 py-3">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-gradient-to-br from-emerald-600 to-emerald-800 rounded-lg flex items-center justify-center shadow-sm">
              <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" />
              </svg>
            </div>
            <div>
              <h1 className="text-base font-bold text-stone-900 leading-none">SIKIZANA</h1>
              <p className="text-[10px] text-stone-500 leading-none mt-0.5">AI Arbitration for Chamas</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <RevenueBadge />
            <VaraConnect />
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-2xl bg-white rounded-2xl shadow-xl flex flex-col h-[78vh] overflow-hidden border border-stone-200">
          {/* Chat Header */}
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
                Online · Powered by Gemini
              </p>
            </div>
            <div className="flex items-center gap-1.5 px-2 py-1 bg-stone-100 rounded-lg">
              <svg className="w-3 h-3 text-stone-500" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span className="text-[10px] font-medium text-stone-600">Vara Secured</span>
            </div>
          </div>

          {/* Chat Area */}
          <div className="flex-1 overflow-y-auto p-5 space-y-4 scroll-thin">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center px-8">
                <div className="w-16 h-16 bg-emerald-50 rounded-2xl flex items-center justify-center mb-4">
                  <svg className="w-8 h-8 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                </div>
                <h2 className="text-lg font-semibold text-stone-800 mb-1">
                  Karibu kwa Sikizana
                </h2>
                <p className="text-sm text-stone-500 max-w-sm">
                  Mimi ni AI arbitrator wako. Niambie kuhusu mzozo wa chama yako, nami nitakusaidia kupata suluhisho.
                </p>
                <div className="mt-6 grid grid-cols-1 gap-2 w-full max-w-sm">
                  {[
                    "Kuna mtu hakulipa michango ya miezi 3",
                    "Treasurer amepotea na pesa za chama",
                    "Mzogo kuhusu mgawanyiko wa faida",
                  ].map((suggestion) => (
                    <button
                      key={suggestion}
                      onClick={() => setInput(suggestion)}
                      className="text-left text-xs text-stone-600 bg-stone-50 hover:bg-stone-100 border border-stone-200 rounded-lg px-3 py-2 transition"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
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
                  {msg.content}
                </div>
              </div>
            ))}

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

          {/* Input Area */}
          <div className="border-t border-stone-100 p-3 bg-stone-50/50">
            <div className="flex gap-2 items-end">
              <div className="flex-1 relative">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSend()}
                  placeholder="Eleza shida ya chama yako..."
                  disabled={isLoading}
                  className="w-full pl-4 pr-3 py-2.5 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 bg-white disabled:opacity-50"
                />
              </div>
              <button
                onClick={handleSend}
                disabled={isLoading || !input.trim()}
                className="p-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl transition disabled:opacity-40 disabled:cursor-not-allowed"
                title="Send"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              </button>
              <button
                onClick={handlePremiumSend}
                disabled={isLoading || !input.trim()}
                className="p-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl transition disabled:opacity-40 disabled:cursor-not-allowed"
                title="Premium Deep Audit (100 KES)"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
              </button>
            </div>
            <div className="flex items-center justify-center gap-4 mt-2">
              <button
                onClick={handleSend}
                disabled={isLoading || !input.trim()}
                className="text-[10px] text-stone-500 hover:text-stone-700 transition"
              >
                Standard Mediation (Free)
              </button>
              <span className="text-stone-300">·</span>
              <button
                onClick={handlePremiumSend}
                disabled={isLoading || !input.trim()}
                className="text-[10px] font-medium text-amber-600 hover:text-amber-700 transition"
              >
                Premium Deep Audit (100 KES)
              </button>
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
        onClose={() => {
          setShowPayment(false);
          setPendingMessage("");
        }}
        onConfirm={async (phone) => {
          const success = await handlePaymentConfirm(phone);
          if (success) handlePaymentSuccess();
          return success;
        }}
        amount={100}
      />
    </main>
  );
}
