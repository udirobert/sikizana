"use client";

import { useState, useRef, useEffect } from "react";
import { VaraConnect } from "@/components/VaraConnect";

interface Message {
  role: "user" | "agent";
  content: string;
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([
    { role: "agent", content: "Sasa! Mimi ni Sikizana, AI arbitrator wako. Una shida gani kwa chama leo?" }
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isPremium, setIsPremium] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = isPremium 
      ? `[PREMIUM AUDIT REQUESTED] ${input.trim()}`
      : input.trim();

    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: input.trim() }]);
    setIsLoading(true);

    try {
      const response = await fetch("http://localhost:8080/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMessage }),
      });

      const data = await response.json();
      setMessages((prev) => [...prev, { role: "agent", content: data.response }]);
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        { role: "agent", content: "Pole sana, kuna itilafu kidogo. Jaribu tena baadaye." },
      ]);
    } finally {
      setIsLoading(false);
      if (isPremium) setIsPremium(false);
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center bg-gray-50 p-4 font-sans">
      <div className="w-full max-w-2xl bg-white rounded-xl shadow-lg flex flex-col h-[85vh]">
        {/* Header */}
        <div className="p-4 border-b bg-green-600 text-white rounded-t-xl flex justify-between items-center">
          <div>
            <h1 className="text-xl font-bold italic tracking-tight">SIKIZANA</h1>
            <p className="text-xs opacity-80">Professional AI Mediation Service</p>
          </div>
          <VaraConnect />
        </div>

        {/* Chat Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[80%] p-3 rounded-lg text-sm ${
                  msg.role === "user"
                    ? "bg-green-100 text-green-900 rounded-br-none"
                    : "bg-gray-100 text-gray-800 rounded-bl-none"
                }`}
              >
                {msg.content}
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-gray-100 p-3 rounded-lg text-sm animate-pulse">Sikizana anafikiria...</div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="p-4 border-t flex flex-col gap-3">
          <div className="flex items-center gap-2 px-1">
            <button 
              onClick={() => setIsPremium(!isPremium)}
              className={`text-[10px] font-bold px-2 py-1 rounded-full border transition ${
                isPremium 
                ? "bg-amber-100 border-amber-500 text-amber-700 shadow-sm" 
                : "bg-gray-50 border-gray-200 text-gray-500"
              }`}
            >
              {isPremium ? "✨ Premium Audit Active (100 KES)" : "Standard Mediation"}
            </button>
            <span className="text-[10px] text-gray-400">
              {isPremium ? "Agent will perform deep financial cross-referencing." : "Basic query."}
            </span>
          </div>
          
          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={(e) => e.key === "Enter" && handleSend()}
              placeholder={isPremium ? "Eleza mzozo kwa undani..." : "Eleza shida yako hapa..."}
              className={`flex-1 p-2 border rounded-lg text-sm focus:outline-none focus:ring-2 ${
                isPremium ? "focus:ring-amber-500 border-amber-200 bg-amber-50/20" : "focus:ring-green-500"
              }`}
            />
            <button
              onClick={handleSend}
              disabled={isLoading}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${
                isPremium 
                ? "bg-amber-600 text-white hover:bg-amber-700" 
                : "bg-green-600 text-white hover:bg-green-700"
              } disabled:opacity-50`}
            >
              Tuma
            </button>
          </div>
        </div>
      </div>
      <p className="mt-4 text-[10px] text-gray-400">Competing in Vara Agents Arena & XPRIZE Build with Gemini 2026</p>
    </main>
  );
}
