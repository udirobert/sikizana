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
import { SikiMascot, SikiMascotAnimated } from "@/components/SikiMascot";
import { RotatedReveal } from "@/components/RotatedReveal";
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

interface OrgData {
  name: string;
  baseCurrency: string;
  countryCode: string;
  isDemoCompany: boolean;
  registrationNumber?: string;
  taxNumber?: string;
  financialYearEndDay?: number;
  financialYearEndMonth?: number;
}

interface ProfitAndLossData {
  revenue: number;
  expenses: number;
  netProfit: number;
  reportDate: string;
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
  const [orgData, setOrgData] = useState<OrgData | null>(null);
  const [profitAndLoss, setProfitAndLoss] = useState<ProfitAndLossData | null>(null);
  const [pnLoading, setPnLoading] = useState(true);
  const [staggerShown, setStaggerShown] = useState(false);
  const [proactiveAudit, setProactiveAudit] = useState<string | null>(null);
  const [showSuccessCheck, setShowSuccessCheck] = useState(false);
  const [thinkingMessage, setThinkingMessage] = useState<string>("");

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Trigger staggered text reveal on mount.
  useEffect(() => {
    const timer = setTimeout(() => setStaggerShown(true), 100);
    return () => clearTimeout(timer);
  }, []);

  // Fetch quick-audit data + Xero status + P&L on mount.
  useEffect(() => {
    void endpoints.xero.status().then((s) => setXeroMode(s.mode)).catch(() => {});
    void endpoints.xero
      .organisation()
      .then((o) => {
        const data = o as unknown as OrgData;
        setOrgData(data);
        setXeroMode(data.isDemoCompany ? "demo" : "live");
      })
      .catch(() => {});
    void endpoints.xero
      .discrepancies()
      .then((d) => {
        const data = d as DiscrepancyData;
        setDiscrepancies(data);
        setAuditLoading(false);
        // Proactive audit — the "Active Arbitrator" pattern.
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
    // Fetch P&L for the dashboard sidebar
    void endpoints.xero
      .profitAndLoss()
      .then((p) => {
        const data = p as unknown as ProfitAndLossData;
        setProfitAndLoss(data);
        setPnLoading(false);
      })
      .catch(() => setPnLoading(false));
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
    setThinkingMessage("Looking into your books…");
    const tid = ensureThread();

    // Track tool calls and response text for this message
    const toolCalls: ToolCallEvent[] = [];
    let responseText = "";

    // Add a placeholder agent message that we'll update as events stream in
    addMessage({ role: "agent", content: "", toolCalls: [] });

    try {
      for await (const event of endpoints.xero.chatStream(message, tid)) {
        if (event.type === "status") {
          setThinkingMessage(event.message);
        } else if (event.type === "tool_call") {
          toolCalls.push({ tool: event.tool, label: event.label, status: "calling" });
          setThinkingMessage(event.label + "…");
          updateLastAgentMessage({ toolCalls: [...toolCalls] });
        } else if (event.type === "tool_result") {
          // Mark the matching tool call as done
          const idx = toolCalls.findIndex((tc) => tc.tool === event.tool && tc.status === "calling");
          if (idx >= 0) {
            toolCalls[idx] = { ...toolCalls[idx], status: "done", summary: event.summary };
          }
          // Update thinking message based on what we found
          if (toolCalls.some((tc) => tc.status === "calling")) {
            const next = toolCalls.find((tc) => tc.status === "calling");
            setThinkingMessage(next ? next.label + "…" : "Analyzing results…");
          } else {
            setThinkingMessage("Composing your answer…");
          }
          updateLastAgentMessage({ toolCalls: [...toolCalls] });
        } else if (event.type === "text") {
          responseText += event.text;
          setThinkingMessage(""); // Clear thinking once text starts arriving
          updateLastAgentMessage({ content: responseText, toolCalls: [...toolCalls] });
        } else if (event.type === "done") {
          // Check for journal entry in the response
          const journal = parseJournalEntry(responseText);
          if (journal) {
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
      setThinkingMessage("");
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
      {/* Rotated reveal transition — slides away on page load */}
      <RotatedReveal />
      <nav className="bg-white border-b border-stone-200 px-4 py-3">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <SikiMascot size={36} mood="idle" />
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
              Home
            </Link>
          </div>
        </div>
      </nav>

      <div className="flex-1 flex items-stretch justify-center p-4 gap-4">
        {/* Dashboard Sidebar */}
        <aside className="hidden lg:flex flex-col w-72 bg-white rounded-2xl shadow-sm border border-stone-200 p-4 gap-3 overflow-y-auto scroll-thin">
          {/* Org header */}
          <div className="pb-3 border-b border-stone-100">
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-xs font-bold text-stone-900 uppercase tracking-wide">
                Dashboard
              </h2>
              {xeroMode !== "unknown" && (
                <span
                  className={`text-[9px] font-medium px-1.5 py-0.5 rounded ${
                    xeroMode === "live"
                      ? "bg-emerald-50 text-emerald-600"
                      : "bg-amber-50 text-amber-600"
                  }`}
                >
                  {xeroMode === "live" ? "LIVE" : "DEMO"}
                </span>
              )}
            </div>
            {orgData ? (
              <div>
                <p className="text-sm font-semibold text-stone-800">{orgData.name}</p>
                <p className="text-[10px] text-stone-400 mt-0.5">
                  {orgData.baseCurrency} · {orgData.countryCode}
                  {orgData.taxNumber ? ` · VAT: ${orgData.taxNumber}` : ""}
                </p>
              </div>
            ) : (
              <div className="space-y-1">
                <div className="h-3 w-32 bg-stone-100 rounded animate-pulse" />
                <div className="h-2 w-24 bg-stone-100 rounded animate-pulse" />
              </div>
            )}
          </div>

          {/* P&L Summary */}
          <SkeletonReveal
            isLoading={pnLoading}
            className="h-[120px]"
            skeletonClassName="rounded-xl"
          >
            {profitAndLoss && (
              <div className="bg-stone-50 border border-stone-200 rounded-xl p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase tracking-wide text-stone-500 font-semibold">
                    P&amp;L This Month
                  </span>
                  <span className="text-[9px] text-stone-400">
                    {new Date(profitAndLoss.reportDate).toLocaleDateString("en-GB", { month: "short", day: "numeric" })}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <div className="text-[9px] text-stone-400">Revenue</div>
                    <div className="text-sm font-bold text-emerald-700">
                      £{profitAndLoss.revenue.toLocaleString(undefined, { minimumFractionDigits: 0 })}
                    </div>
                  </div>
                  <div>
                    <div className="text-[9px] text-stone-400">Expenses</div>
                    <div className="text-sm font-bold text-red-600">
                      £{profitAndLoss.expenses.toLocaleString(undefined, { minimumFractionDigits: 0 })}
                    </div>
                  </div>
                </div>
                <div className="pt-2 border-t border-stone-200">
                  <div className="text-[9px] text-stone-400">Net Profit</div>
                  <div className="text-lg font-bold text-stone-900">
                    £{profitAndLoss.netProfit.toLocaleString(undefined, { minimumFractionDigits: 0 })}
                  </div>
                </div>
              </div>
            )}
          </SkeletonReveal>

          {/* Health Check */}
          <div className="space-y-2">
            <h3 className="text-[10px] font-bold text-stone-500 uppercase tracking-wide">
              Health Check
            </h3>
            <SkeletonReveal
              isLoading={auditLoading}
              className="h-[64px]"
              skeletonClassName="rounded-xl"
            >
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                <div className="flex items-center justify-between">
                  <div className="text-[10px] uppercase tracking-wide text-amber-600 font-semibold">
                    Unreconciled
                  </div>
                  <div className="text-xl font-bold text-amber-900">
                    <AnimatedNumber value={unreconciledCount} />
                  </div>
                </div>
                <div className="text-[10px] text-amber-700 mt-0.5">
                  bank transactions need matching
                </div>
              </div>
            </SkeletonReveal>

            <SkeletonReveal
              isLoading={auditLoading}
              className="h-[64px]"
              skeletonClassName="rounded-xl"
            >
              <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                <div className="flex items-center justify-between">
                  <div className="text-[10px] uppercase tracking-wide text-red-600 font-semibold">
                    Overdue Invoices
                  </div>
                  <div className="text-xl font-bold text-red-900">
                    <AnimatedNumber value={overdueCount} />
                  </div>
                </div>
                <div className="text-[10px] text-red-700 mt-0.5">
                  £{totalOverdue.toLocaleString(undefined, { minimumFractionDigits: 2 })} outstanding
                </div>
              </div>
            </SkeletonReveal>

            {discrepancies && unreconciledCount === 0 && overdueCount === 0 && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 fade-in-up flex items-center gap-3">
                <SikiMascot size={36} mood="celebrate" />
                <div>
                  <div className="text-xs font-semibold text-emerald-800">
                    Books look clean!
                  </div>
                  <div className="text-[10px] text-emerald-700 mt-0.5">
                    No discrepancies detected
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Unreconciled transaction list */}
          {discrepancies && discrepancies.unreconciled.length > 0 && (
            <div className="pt-2 border-t border-stone-100">
              <h3 className="text-[10px] font-bold text-stone-500 uppercase tracking-wide mb-2">
                Needs Attention
              </h3>
              <div className="space-y-1.5">
                {discrepancies.unreconciled.slice(0, 5).map((t, i) => (
                  <div
                    key={t.id}
                    className="text-[10px] border border-stone-100 rounded-lg p-2 fade-in-up hover:border-amber-200 hover:bg-amber-50/30 transition-colors cursor-default"
                    style={{ animationDelay: `${i * 40}ms` }}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-stone-700">
                        £{t.total.toFixed(2)}
                      </span>
                      <span className="text-[9px] text-stone-400">
                        {new Date(t.date).toLocaleDateString("en-GB", { month: "short", day: "numeric" })}
                      </span>
                    </div>
                    <div className="text-stone-400 truncate mt-0.5">{t.reference}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="border-t border-stone-100 pt-3 mt-auto">
            <p className="text-[9px] text-stone-400 leading-relaxed">
              Live Xero data via CLI + Webhooks. AI-powered bookkeeping.
            </p>
          </div>
        </aside>

        {/* Chat */}
        <div className="w-full max-w-2xl bg-white rounded-2xl shadow-xl flex flex-col h-[78vh] overflow-hidden border border-stone-200">
          <div className="px-5 py-3 border-b border-stone-100 flex items-center gap-3">
            <div className="relative">
              <SikiMascot size={40} mood={isLoading ? "look" : "idle"} />
              <div className="absolute bottom-0 right-0 w-3 h-3 bg-sky-400 border-2 border-white rounded-full" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-stone-800">Siki the Bookkeeper</p>
              <p className="text-[11px] text-stone-500 flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-sky-500 rounded-full" />
                {isLoading ? (
                  <span className="t-shimmer">{thinkingMessage || "Thinking…"}</span>
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
              <div className="shrink-0">
                <SikiMascot size={36} mood="look" />
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
                {/* Mascot in the empty state — animated, cycling moods */}
                <div className="mb-4 fade-in-up">
                  <SikiMascotAnimated size={100} />
                </div>
                {/* Staggered text reveal for the empty state */}
                <div className={`t-stagger ${staggerShown ? "is-shown" : ""}`}>
                  <h2 className="t-stagger-line t-stagger-line--1 text-lg font-semibold text-stone-800 mb-1">
                    Hi! I'm Siki, your AI Bookkeeper
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
                  <div className="shrink-0">
                    <SikiMascot size={32} mood="idle" />
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
                <div className="shrink-0">
                  <SikiMascot size={32} mood="look" />
                </div>
                <div className="bg-stone-100 px-4 py-3 rounded-2xl rounded-tl-sm">
                  <div className="flex items-center gap-2">
                    <span className="thinking-pulse" />
                    <span className="text-sm text-stone-600 t-shimmer">
                      {thinkingMessage || "Thinking…"}
                    </span>
                  </div>
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
            <SikiMascot size={80} mood="celebrate" />
            <SuccessCheck show={showSuccessCheck} size={48} className="text-emerald-600" />
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
