"use client";

import { useEffect, useRef, useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useXeroThread } from "@/hooks/useXeroThread";
import { ApiError, endpoints } from "@/lib/api";
import { MarkdownMessage } from "@/components/MarkdownMessage";
import { AnimatedNumber } from "@/components/AnimatedNumber";
import { SkeletonReveal } from "@/components/SkeletonReveal";
import { SuccessCheck } from "@/components/SuccessCheck";
import { ReceiptUpload } from "@/components/ReceiptUpload";
import { ProactiveAlert } from "@/components/ProactiveAlert";
import { ToolCallTrace } from "@/components/ToolCallTrace";
import { JournalEntryCard, parseJournalEntry } from "@/components/JournalEntryCard";
import { SAMPLE_QUERIES, findQuery } from "@/lib/xero-samples";
import type { ToolCallEvent } from "@/lib/types";

interface DiscrepancyData {
  unreconciled: Array<{
    id: string;
    date: string;
    type: string;
    contact: { name: string };
    total: number;
    reference: string;
  }>;
  overdue: Array<{
    id: string;
    invoiceNumber: string;
    contact: { name: string };
    amountDue: number;
    dueDate: string;
  }>;
}

function BooksView() {
  const searchParams = useSearchParams();
  const { threadId, messages, addMessage, updateLastAgentMessage, ensureThread, newSession } = useXeroThread();

  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [discrepancies, setDiscrepancies] = useState<DiscrepancyData | null>(null);
  const [auditLoading, setAuditLoading] = useState(true);
  const [xeroMode, setXeroMode] = useState<"live" | "demo" | "unknown">("unknown");
  const [orgName, setOrgName] = useState<string>("");
  const [staggerShown, setStaggerShown] = useState(false);
  const [proactiveAudit, setProactiveAudit] = useState<string | null>(null);
  const [showSuccessCheck, setShowSuccessCheck] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Trigger staggered text reveal on mount.
  useEffect(() => {
    const timer = setTimeout(() => setStaggerShown(true), 100);
    return () => clearTimeout(timer);
  }, []);

  // Fetch quick-audit data + Xero status on mount.
  useEffect(() => {
    void endpoints.xero.status().then((s) => setXeroMode(s.mode)).catch(() => {});
    void endpoints.xero
      .organisation()
      .then((o) => setOrgName((o as { name?: string }).name ?? ""))
      .catch(() => {});
    void endpoints.xero
      .discrepancies()
      .then((d) => {
        const data = d as DiscrepancyData;
        setDiscrepancies(data);
        setAuditLoading(false);
        // Proactive audit — the "Active Arbitrator" pattern.
        // Generate a plain-English summary of what was found.
        const unrec = data.unreconciled.length;
        const overdue = data.overdue.length;
        if (unrec > 0 || overdue > 0) {
          const parts: string[] = [];
          if (unrec > 0) parts.push(`${unrec} unreconciled bank transaction${unrec > 1 ? "s" : ""}`);
          if (overdue > 0) {
            const total = data.overdue.reduce((s, i) => s + i.amountDue, 0);
            parts.push(`${overdue} overdue invoice${overdue > 1 ? "s" : ""} (£${total.toLocaleString(undefined, { minimumFractionDigits: 0 })} outstanding)`);
          }
          setProactiveAudit(
            `I've audited your books and found ${parts.join(" and ")}. ` +
            `An accountant would charge £200+ and take 3 days for this. ` +
            `I did it in 4 seconds. Ask me "what did you find?" to see the details.`,
          );
        }
      })
      .catch(() => setAuditLoading(false));
  }, []);

  // Seed sample query from URL param.
  const sampleId = searchParams.get("sample");
  const sample = sampleId ? findQuery(sampleId) : undefined;
  const shouldSeed = Boolean(sample && messages.length === 0 && !input);
  if (shouldSeed) {
    setInput(sample!.description);
  }

  const sendToAgent = async (message: string) => {
    setIsLoading(true);
    setErrorBanner(null);
    const tid = ensureThread();

    // Track tool calls and response text for this message
    const toolCalls: ToolCallEvent[] = [];
    let responseText = "";

    // Add a placeholder agent message that we'll update as events stream in
    const agentMsgIndex = -1; // will be set after addMessage
    addMessage({ role: "agent", content: "", toolCalls: [] });

    try {
      for await (const event of endpoints.xero.chatStream(message, tid)) {
        if (event.type === "tool_call") {
          toolCalls.push({ tool: event.tool, label: event.label, status: "calling" });
          // Update the agent message with the current tool calls
          updateLastAgentMessage({ toolCalls: [...toolCalls] });
        } else if (event.type === "tool_result") {
          // Mark the matching tool call as done
          const idx = toolCalls.findIndex((tc) => tc.tool === event.tool && tc.status === "calling");
          if (idx >= 0) {
            toolCalls[idx] = { ...toolCalls[idx], status: "done", summary: event.summary };
          }
          updateLastAgentMessage({ toolCalls: [...toolCalls] });
        } else if (event.type === "text") {
          responseText += event.text;
          updateLastAgentMessage({ content: responseText, toolCalls: [...toolCalls] });
        } else if (event.type === "done") {
          // Check for journal entry in the response
          const journal = parseJournalEntry(responseText);
          if (journal) {
            // Store the journal entry for display
            updateLastAgentMessage({ content: responseText, toolCalls: [...toolCalls] });
          }
          // Detect approval language
          const lower = responseText.toLowerCase();
          if (
            lower.includes("posted") ||
            lower.includes("approved") ||
            lower.includes("journal entry has been") ||
            lower.includes("entry is now in xero")
          ) {
            setShowSuccessCheck(true);
            setTimeout(() => setShowSuccessCheck(false), 3000);
          }
        }
      }
    } catch (e) {
      const detail =
        e instanceof ApiError
          ? `Bookkeeper error (${e.status}).`
          : e instanceof Error
            ? e.message
            : "Unknown error.";
      updateLastAgentMessage({
        content: responseText || `Sorry, ${detail} Please try again.`,
        toolCalls: [...toolCalls],
      });
      setErrorBanner(detail);
    } finally {
      setIsLoading(false);
    }
  };

  const handleReceiptUpload = async (response: string, filename: string) => {
    addMessage({
      role: "user",
      content: `📎 Uploaded receipt: ${filename}`,
    });
    addMessage({ role: "agent", content: response });
  };

  const handleReceiptError = (message: string) => {
    setErrorBanner(message);
  };

  const handleProactiveAuditClick = () => {
    if (!proactiveAudit) return;
    addMessage({ role: "agent", content: proactiveAudit });
    setProactiveAudit(null);
  };

  const handleSend = () => {
    if (!input.trim() || isLoading) return;
    const text = input.trim();
    setInput("");
    addMessage({ role: "user", content: text });
    void sendToAgent(text);
  };

  const handleStartSample = (description: string) => {
    setInput(description);
  };

  const unreconciledCount = discrepancies?.unreconciled.length ?? 0;
  const overdueCount = discrepancies?.overdue.length ?? 0;
  const totalOverdue = discrepancies?.overdue.reduce((sum, i) => sum + i.amountDue, 0) ?? 0;

  return (
    <main className="min-h-screen bg-stone-100 flex flex-col">
      <nav className="bg-white border-b border-stone-200 px-4 py-3">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-gradient-to-br from-sky-600 to-blue-700 rounded-lg flex items-center justify-center shadow-sm">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
              </svg>
            </div>
            <div>
              <h1 className="text-base font-bold text-stone-900 leading-none">SIKIZANA BOOKS</h1>
              <p className="text-[10px] text-stone-500 leading-none mt-0.5">
                AI Bookkeeper for Xero
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span
              className={`text-[10px] font-medium px-2 py-1 rounded-lg transition-opacity duration-200 ${
                xeroMode === "live"
                  ? "bg-emerald-50 text-emerald-700"
                  : xeroMode === "demo"
                    ? "bg-amber-50 text-amber-700"
                    : "bg-stone-100 text-stone-500"
              }`}
            >
              {xeroMode === "live" ? "● Xero Live" : xeroMode === "demo" ? "● Demo Data" : "○ Connecting..."}
            </span>
            <Link
              href="/"
              className="text-[10px] text-stone-500 hover:text-stone-700 px-2 py-1 rounded hover:bg-stone-100 btn-press"
            >
              Chama Mode
            </Link>
          </div>
        </div>
      </nav>

      <div className="flex-1 flex items-stretch justify-center p-4 gap-4">
        {/* Quick Audit Sidebar */}
        <aside className="hidden lg:flex flex-col w-64 bg-white rounded-2xl shadow-sm border border-stone-200 p-4 gap-4">
          <div>
            <h2 className="text-xs font-bold text-stone-900 uppercase tracking-wide mb-1">
              Quick Audit
            </h2>
            {orgName && (
              <p className="text-[11px] text-stone-500 mb-3">{orgName}</p>
            )}
          </div>

          <div className="space-y-3">
            {/* Unreconciled — skeleton while loading, animated number when loaded */}
            <SkeletonReveal
              isLoading={auditLoading}
              className="h-[72px]"
              skeletonClassName="rounded-xl"
            >
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                <div className="text-[10px] uppercase tracking-wide text-amber-600 font-semibold">
                  Unreconciled
                </div>
                <div className="text-2xl font-bold text-amber-900 mt-1">
                  <AnimatedNumber value={unreconciledCount} />
                </div>
                <div className="text-[10px] text-amber-700 mt-0.5">
                  bank transactions need matching
                </div>
              </div>
            </SkeletonReveal>

            {/* Overdue — skeleton while loading, animated number when loaded */}
            <SkeletonReveal
              isLoading={auditLoading}
              className="h-[72px]"
              skeletonClassName="rounded-xl"
            >
              <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                <div className="text-[10px] uppercase tracking-wide text-red-600 font-semibold">
                  Overdue Invoices
                </div>
                <div className="text-2xl font-bold text-red-900 mt-1">
                  <AnimatedNumber value={overdueCount} />
                </div>
                <div className="text-[10px] text-red-700 mt-0.5">
                  £{totalOverdue.toLocaleString(undefined, { minimumFractionDigits: 2 })} outstanding
                </div>
              </div>
            </SkeletonReveal>

            {discrepancies && unreconciledCount === 0 && overdueCount === 0 && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 fade-in-up">
                <div className="text-xs font-semibold text-emerald-800">
                  ✓ Books look clean
                </div>
                <div className="text-[10px] text-emerald-700 mt-1">
                  No discrepancies detected
                </div>
              </div>
            )}
          </div>

          {discrepancies && discrepancies.unreconciled.length > 0 && (
            <div className="flex-1 overflow-y-auto scroll-thin">
              <h3 className="text-[10px] font-bold text-stone-500 uppercase tracking-wide mb-2">
                Unreconciled Transactions
              </h3>
              <div className="space-y-2">
                {discrepancies.unreconciled.slice(0, 6).map((t, i) => (
                  <div
                    key={t.id}
                    className="text-[10px] border border-stone-100 rounded-lg p-2 fade-in-up"
                    style={{ animationDelay: `${i * 40}ms` }}
                  >
                    <div className="font-medium text-stone-700">
                      £{t.total.toFixed(2)}
                    </div>
                    <div className="text-stone-400 truncate">{t.reference}</div>
                    <div className="text-stone-400">{t.date}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="border-t border-stone-100 pt-3">
            <p className="text-[9px] text-stone-400 leading-relaxed">
              Live Xero data via CLI + Webhooks. AI-powered bookkeeping.
            </p>
          </div>
        </aside>

        {/* Chat */}
        <div className="w-full max-w-2xl bg-white rounded-2xl shadow-xl flex flex-col h-[78vh] overflow-hidden border border-stone-200">
          <div className="px-5 py-3 border-b border-stone-100 flex items-center gap-3">
            <div className="relative">
              <div className="w-10 h-10 bg-gradient-to-br from-sky-500 to-blue-600 rounded-full flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                </svg>
              </div>
              <div className="absolute bottom-0 right-0 w-3 h-3 bg-sky-400 border-2 border-white rounded-full" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-stone-800">Sikizana Bookkeeper</p>
              <p className="text-[11px] text-stone-500 flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-sky-500 rounded-full" />
                {isLoading ? (
                  <span className="t-shimmer">Thinking...</span>
                ) : (
                  <span>Online · Xero Connected</span>
                )}
              </p>
            </div>
            {messages.length > 0 && (
              <button
                onClick={newSession}
                className="text-[10px] text-stone-500 hover:text-stone-700 px-2 py-1 rounded hover:bg-stone-100 btn-press"
                title="Start a new conversation"
              >
                New
              </button>
            )}
          </div>

          {errorBanner && (
            <div className="bg-red-50 border-b border-red-200 px-4 py-2 text-xs text-red-700 flex items-center justify-between fade-in-up">
              <span>{errorBanner}</span>
              <button
                onClick={() => setErrorBanner(null)}
                className="text-red-500 hover:text-red-700 btn-press"
                aria-label="Dismiss"
              >
                ×
              </button>
            </div>
          )}

          {/* Proactive audit notification — the "Active Arbitrator" */}
          {proactiveAudit && messages.length === 0 && (
            <div className="bg-sky-50 border-b border-sky-200 px-4 py-3 flex items-start gap-3 fade-in-up">
              <div className="w-8 h-8 bg-sky-100 rounded-lg flex items-center justify-center shrink-0">
                <svg className="w-4 h-4 text-sky-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-sky-900">Audit Complete</p>
                <p className="text-[11px] text-sky-700 mt-0.5 leading-relaxed">
                  {proactiveAudit}
                </p>
              </div>
              <button
                onClick={handleProactiveAuditClick}
                className="text-[10px] font-medium text-sky-700 hover:text-sky-900 bg-sky-100 hover:bg-sky-200 px-2 py-1 rounded btn-press shrink-0"
              >
                Show me
              </button>
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-5 space-y-4 scroll-thin">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center px-8">
                <div className="w-16 h-16 bg-sky-50 rounded-2xl flex items-center justify-center mb-4">
                  <svg className="w-8 h-8 text-sky-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                {/* Staggered text reveal for the empty state */}
                <div className={`t-stagger ${staggerShown ? "is-shown" : ""}`}>
                  <h2 className="t-stagger-line t-stagger-line--1 text-lg font-semibold text-stone-800 mb-1">
                    Your AI Bookkeeper
                  </h2>
                  <p className="t-stagger-line t-stagger-line--2 text-sm text-stone-500 max-w-sm">
                    I reconcile your Xero transactions, find overdue invoices, explain your
                    P&amp;L in plain English, and propose journal entries to fix discrepancies.
                  </p>
                </div>

                <div className="mt-6 grid grid-cols-1 gap-2 w-full max-w-sm">
                  <p className="t-stagger-line t-stagger-line--3 text-[10px] uppercase tracking-wide text-stone-400 font-semibold text-left">
                    Try a sample query
                  </p>
                  {SAMPLE_QUERIES.map((sample, i) => (
                    <button
                      key={sample.id}
                      onClick={() => handleStartSample(sample.description)}
                      className="text-left text-xs text-stone-600 bg-stone-50 hover:bg-stone-100 border border-stone-200 rounded-lg px-3 py-2 transition-colors btn-press fade-in-up"
                      style={{ animationDelay: `${300 + i * 60}ms` }}
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
              // Parse for journal entry card if agent message
              const journal = msg.role === "agent" && msg.content ? parseJournalEntry(msg.content) : null;
              // The text to display (remove the journal entry block if we're showing it as a card)
              const displayContent = journal
                ? msg.content.split(/PROPOSED JOURNAL ENTRY/i)[0].trim()
                : msg.content;

              return (
              <div
                key={i}
                className={`flex gap-2.5 fade-in-up ${
                  msg.role === "user" ? "flex-row-reverse" : "flex-row"
                }`}
              >
                {msg.role === "agent" && (
                  <div className="w-8 h-8 bg-gradient-to-br from-sky-500 to-blue-600 rounded-full flex items-center justify-center shrink-0">
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                    </svg>
                  </div>
                )}
                <div className={`max-w-[80%] ${msg.role === "user" ? "" : "flex flex-col gap-2"}`}>
                  {msg.role === "agent" && msg.toolCalls && msg.toolCalls.length > 0 && (
                    <ToolCallTrace calls={msg.toolCalls} />
                  )}
                  <div
                    className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                      msg.role === "user"
                        ? "bg-sky-600 text-white rounded-tr-sm"
                        : "bg-stone-100 text-stone-800 rounded-tl-sm"
                    }`}
                  >
                    {msg.role === "agent" ? (
                      displayContent ? (
                        <MarkdownMessage source={displayContent} />
                      ) : msg.toolCalls && msg.toolCalls.length > 0 ? (
                        <span className="text-stone-400 text-xs italic">Analyzing your Xero data...</span>
                      ) : null
                    ) : (
                      msg.content
                    )}
                  </div>
                  {journal && (
                    <JournalEntryCard
                      description={journal.description}
                      debitAccount={journal.debitAccount}
                      debitAccountName={journal.debitAccountName}
                      creditAccount={journal.creditAccount}
                      creditAccountName={journal.creditAccountName}
                      amount={journal.amount}
                      onApprove={() => {
                        setShowSuccessCheck(true);
                        setTimeout(() => setShowSuccessCheck(false), 3000);
                      }}
                    />
                  )}
                </div>
              </div>
              );
            })}

            {isLoading && (
              <div className="flex gap-2.5 fade-in-up">
                <div className="w-8 h-8 bg-gradient-to-br from-sky-500 to-blue-600 rounded-full flex items-center justify-center shrink-0">
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                  </svg>
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
              <ReceiptUpload
                onResult={handleReceiptUpload}
                onError={handleReceiptError}
              />
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSend()}
                placeholder="Ask about your books, invoices, or P&L..."
                disabled={isLoading}
                className="flex-1 px-4 py-2.5 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500 bg-white disabled:opacity-50"
              />
              <button
                onClick={handleSend}
                disabled={isLoading || !input.trim()}
                className="p-2.5 bg-sky-600 hover:bg-sky-700 text-white rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed btn-press"
                title="Send"
                aria-label="Send"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              </button>
            </div>
            <div className="flex items-center justify-center mt-2">
              <span className="text-[10px] text-stone-500">
                Sikizana Books · AI Bookkeeper for Xero · Human-in-the-loop by design
              </span>
            </div>
          </div>
        </div>
      </div>

      <footer className="text-center py-3">
        <p className="text-[10px] text-stone-400">
          Built for the Xero App &amp; Agent Hackathon · Encode Club · London 2026
        </p>
      </footer>

      {/* Success check overlay — plays when a journal entry is approved */}
      {showSuccessCheck && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm fade-in-up">
          <div className="bg-white rounded-2xl shadow-2xl p-8 flex flex-col items-center gap-4">
            <SuccessCheck show={showSuccessCheck} size={64} className="text-emerald-600" />
            <p className="text-sm font-semibold text-stone-800">Journal entry posted to Xero</p>
            <p className="text-xs text-stone-500">Your books are now reconciled.</p>
          </div>
        </div>
      )}

      {/* Proactive webhook alerts */}
      <ProactiveAlert />
    </main>
  );
}

export default function BooksPage() {
  return (
    <Suspense fallback={null}>
      <BooksView />
    </Suspense>
  );
}
