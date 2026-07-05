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
import { SikiMascot, SikiMascotAnimated, ZanaMascot } from "@/components/SikiMascot";
import { RotatedReveal } from "@/components/RotatedReveal";
import { SAMPLE_QUERIES, ZANA_QUERIES, findQuery } from "@/lib/xero-samples";
import type { ToolCallEvent } from "@/lib/types";
import { localStore, StorageKeys } from "@/lib/storage";

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
  const [showWelcome, setShowWelcome] = useState(false);
  const [dismissedWelcome, setDismissedWelcome] = useState(false);
  const [oauthConfigured, setOauthConfigured] = useState(false);
  const [userConnection, setUserConnection] = useState<{ connected: boolean; tenant_name?: string } | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [persona, setPersona] = useState<"siki" | "zana">("siki");

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Trigger staggered text reveal on mount.
  useEffect(() => {
    const timer = setTimeout(() => setStaggerShown(true), 100);
    return () => clearTimeout(timer);
  }, []);

  // Detect first-time visit to show welcome onboarding.
  useEffect(() => {
    const visited = localStore.get<boolean>(StorageKeys.BOOKS_VISITED, false);
    if (!visited) setShowWelcome(true);
  }, []);

  const dismissWelcome = () => {
    localStore.set(StorageKeys.BOOKS_VISITED, true);
    setShowWelcome(false);
    setDismissedWelcome(true);
  };

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

    // Check if Xero OAuth is configured + if user has connected their own org
    void endpoints.xero
      .connection()
      .then((c) => {
        setOauthConfigured(c.oauth_configured);
        setUserConnection({ connected: c.connected, tenant_name: c.tenant_name });
      })
      .catch(() => {});
  }, []);

  // Handle OAuth callback redirect (?connected=true&org=...)
  useEffect(() => {
    const connected = searchParams.get("connected");
    if (connected === "true") {
      const org = searchParams.get("org");
      // Refresh connection status
      void endpoints.xero.connection().then((c) => {
        setOauthConfigured(c.oauth_configured);
        setUserConnection({ connected: c.connected, tenant_name: c.tenant_name });
      }).catch(() => {});
      // Show success message
      if (org) {
        setErrorBanner(null);
      }
    } else if (connected === "false") {
      setErrorBanner("Failed to connect your Xero account. Please try again.");
    }
  }, [searchParams]);

  const handleConnectXero = async () => {
    setConnecting(true);
    try {
      const result = await endpoints.xero.auth();
      if (result.configured && result.auth_url) {
        window.location.href = result.auth_url;
      } else {
        setErrorBanner("Xero OAuth is not configured yet. Using demo data for now.");
      }
    } catch {
      setErrorBanner("Failed to start Xero connection flow.");
    }
    setConnecting(false);
  };

  const handleDisconnect = async () => {
    try {
      await endpoints.xero.disconnect();
      setUserConnection({ connected: false });
      setXeroMode("demo");
    } catch {
      setErrorBanner("Failed to disconnect.");
    }
  };

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
      for await (const event of endpoints.xero.chatStream(message, tid, persona)) {
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
            {/* Connection status / Connect button */}
            {userConnection?.connected ? (
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-medium px-2 py-1 rounded-lg bg-emerald-50 text-emerald-700">
                  ● {userConnection.tenant_name || "Your Xero"}
                </span>
                <button
                  onClick={handleDisconnect}
                  className="text-[10px] text-stone-400 hover:text-red-600 px-1.5 py-1 rounded hover:bg-red-50 btn-press"
                  title="Disconnect your Xero"
                >
                  Disconnect
                </button>
              </div>
            ) : oauthConfigured ? (
              <button
                onClick={handleConnectXero}
                disabled={connecting}
                className="text-[10px] font-semibold px-3 py-1.5 rounded-lg bg-sky-600 text-white hover:bg-sky-700 btn-press transition-colors disabled:opacity-50"
              >
                {connecting ? "Connecting…" : "Connect Your Xero →"}
              </button>
            ) : (
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
            )}
            <Link
              href="/pricing"
              className="text-[10px] text-stone-500 hover:text-stone-700 px-2 py-1 rounded hover:bg-stone-100 btn-press"
            >
              Pricing
            </Link>
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
          {/* Org header — skeleton uses SkeletonReveal for consistency */}
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
            <SkeletonReveal isLoading={!orgData} className="h-[40px]" skeletonClassName="rounded-md">
              {orgData && (
                <div>
                  <p className="text-sm font-semibold text-stone-800">{orgData.name}</p>
                  <p className="text-[10px] text-stone-400 mt-0.5">
                    {orgData.baseCurrency} · {orgData.countryCode}
                    {orgData.taxNumber ? ` · VAT: ${orgData.taxNumber}` : ""}
                  </p>
                </div>
              )}
            </SkeletonReveal>
          </div>

          {/* P&L Summary — with contextual hint for first-time users */}
          <div>
            <div className="flex items-center gap-1 mb-1.5">
              <span className="text-[10px] uppercase tracking-wide text-stone-500 font-semibold">
                Profit &amp; Loss
              </span>
              {showWelcome && (
                <span className="text-[9px] text-sky-500 font-medium">← your money at a glance</span>
              )}
            </div>
            <SkeletonReveal
              isLoading={pnLoading}
              className="h-[120px]"
              skeletonClassName="rounded-xl"
            >
              {profitAndLoss && (
                <div className="bg-stone-50 border border-stone-200 rounded-xl p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] text-stone-400">This month</span>
                    <span className="text-[9px] text-stone-400">
                      as of {new Date(profitAndLoss.reportDate).toLocaleDateString("en-GB", { month: "short", day: "numeric" })}
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
          </div>

          {/* Health Check — with contextual hint for first-time users */}
          <div className="space-y-2">
            <div className="flex items-center gap-1">
              <h3 className="text-[10px] font-bold text-stone-500 uppercase tracking-wide">
                Health Check
              </h3>
              {showWelcome && (
                <span className="text-[9px] text-sky-500 font-medium">← things to fix</span>
              )}
            </div>

            {/* Unreconciled — skeleton shows until data arrives, then real number */}
            <SkeletonReveal
              isLoading={auditLoading}
              className="h-[64px]"
              skeletonClassName="rounded-xl"
            >
              {discrepancies && (
                <div className={`rounded-xl p-3 border ${
                  unreconciledCount > 0
                    ? "bg-amber-50 border-amber-200"
                    : "bg-emerald-50 border-emerald-200"
                }`}>
                  <div className="flex items-center justify-between">
                    <div className={`text-[10px] uppercase tracking-wide font-semibold ${
                      unreconciledCount > 0 ? "text-amber-600" : "text-emerald-600"
                    }`}>
                      Unreconciled
                    </div>
                    <div className={`text-xl font-bold ${
                      unreconciledCount > 0 ? "text-amber-900" : "text-emerald-900"
                    }`}>
                      <AnimatedNumber value={unreconciledCount} />
                    </div>
                  </div>
                  <div className={`text-[10px] mt-0.5 ${
                    unreconciledCount > 0 ? "text-amber-700" : "text-emerald-700"
                  }`}>
                    {unreconciledCount > 0
                      ? "bank transactions need matching"
                      : "all transactions matched"}
                  </div>
                </div>
              )}
            </SkeletonReveal>

            {/* Overdue — same pattern */}
            <SkeletonReveal
              isLoading={auditLoading}
              className="h-[64px]"
              skeletonClassName="rounded-xl"
            >
              {discrepancies && (
                <div className={`rounded-xl p-3 border ${
                  overdueCount > 0
                    ? "bg-red-50 border-red-200"
                    : "bg-emerald-50 border-emerald-200"
                }`}>
                  <div className="flex items-center justify-between">
                    <div className={`text-[10px] uppercase tracking-wide font-semibold ${
                      overdueCount > 0 ? "text-red-600" : "text-emerald-600"
                    }`}>
                      Overdue Invoices
                    </div>
                    <div className={`text-xl font-bold ${
                      overdueCount > 0 ? "text-red-900" : "text-emerald-900"
                    }`}>
                      <AnimatedNumber value={overdueCount} />
                    </div>
                  </div>
                  <div className={`text-[10px] mt-0.5 ${
                    overdueCount > 0 ? "text-red-700" : "text-emerald-700"
                  }`}>
                    {overdueCount > 0
                      ? `£${totalOverdue.toLocaleString(undefined, { minimumFractionDigits: 2 })} outstanding`
                      : "all invoices paid on time"}
                  </div>
                </div>
              )}
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

          {/* Action Center — prioritized list of things to do */}
          {discrepancies && !auditLoading && (unreconciledCount > 0 || overdueCount > 0) && (
            <div className="pt-2 border-t border-stone-100">
              <h3 className="text-[10px] font-bold text-stone-500 uppercase tracking-wide mb-2">
                Action Center
              </h3>
              <div className="space-y-1.5">
                {overdueCount > 0 && (
                  <button
                    onClick={() => handleStartSample(
                      persona === "zana"
                        ? "Draft a firm reminder email for my most overdue invoice. Include late payment interest."
                        : "Show me all overdue invoices. Who hasn't paid and how much is outstanding?"
                    )}
                    className="w-full text-left text-[10px] border border-red-200 bg-red-50/50 rounded-lg p-2.5 fade-in-up hover:bg-red-50 hover:border-red-300 transition-colors btn-press group"
                    style={{ animationDelay: "0ms" }}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-red-500 font-bold">1.</span>
                      <span className="font-semibold text-red-900">
                        {persona === "zana" ? "Chase overdue invoices" : "Review overdue invoices"}
                      </span>
                    </div>
                    <div className="text-red-700 mt-0.5 pl-5">
                      {overdueCount} invoice{overdueCount > 1 ? "s" : ""} · £{totalOverdue.toLocaleString(undefined, { minimumFractionDigits: 2 })} outstanding
                    </div>
                  </button>
                )}
                {unreconciledCount > 0 && (
                  <button
                    onClick={() => handleStartSample(
                      persona === "zana"
                        ? "Fix my unreconciled transactions. Show me each one and propose journal entries to fix them."
                        : "Can you check my unreconciled transactions and help me match them to the right accounts?"
                    )}
                    className="w-full text-left text-[10px] border border-amber-200 bg-amber-50/50 rounded-lg p-2.5 fade-in-up hover:bg-amber-50 hover:border-amber-300 transition-colors btn-press group"
                    style={{ animationDelay: "60ms" }}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-amber-600 font-bold">2.</span>
                      <span className="font-semibold text-amber-900">
                        Reconcile {unreconciledCount} transaction{unreconciledCount > 1 ? "s" : ""}
                      </span>
                    </div>
                    <div className="text-amber-700 mt-0.5 pl-5">
                      Bank transactions need matching
                    </div>
                  </button>
                )}
                <button
                  onClick={() => handleStartSample(
                    persona === "zana"
                      ? "What am I overpaying in tax? Check for non-deductible expenses and missed deductions."
                      : "Can you estimate my Corporation Tax and check if I'm missing any deductible expenses?"
                  )}
                  className="w-full text-left text-[10px] border border-sky-200 bg-sky-50/50 rounded-lg p-2.5 fade-in-up hover:bg-sky-50 hover:border-sky-300 transition-colors btn-press group"
                  style={{ animationDelay: "120ms" }}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sky-500 font-bold">3.</span>
                    <span className="font-semibold text-sky-900">
                      Check tax & deductions
                    </span>
                  </div>
                  <div className="text-sky-700 mt-0.5 pl-5">
                    Estimate CT + flag non-deductible expenses
                  </div>
                </button>
                {persona === "zana" && (
                  <button
                    onClick={() => handleStartSample(
                      "Analyze my expenses and find savings opportunities. What am I wasting money on?"
                    )}
                    className="w-full text-left text-[10px] border border-stone-200 bg-stone-50/50 rounded-lg p-2.5 fade-in-up hover:bg-stone-50 hover:border-stone-300 transition-colors btn-press group"
                    style={{ animationDelay: "180ms" }}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-stone-600 font-bold">4.</span>
                      <span className="font-semibold text-stone-800">
                        Find savings
                      </span>
                    </div>
                    <div className="text-stone-600 mt-0.5 pl-5">
                      Unused subscriptions, margin improvements
                    </div>
                  </button>
                )}
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
              {persona === "siki" ? (
                <SikiMascot size={40} mood={isLoading ? "look" : "idle"} />
              ) : (
                <ZanaMascot size={40} mood={isLoading ? "look" : "idle"} />
              )}
              <div className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white ${persona === "siki" ? "bg-sky-400" : "bg-rose-500"}`} />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-stone-800">
                {persona === "siki" ? "Siki the Bookkeeper" : "Zana the Enforcer"}
              </p>
              <p className="text-[11px] text-stone-500 flex items-center gap-1">
                <span className={`w-1.5 h-1.5 rounded-full ${persona === "siki" ? "bg-sky-500" : "bg-rose-500"}`} />
                {isLoading ? (
                  <span className="t-shimmer">{thinkingMessage || "Thinking…"}</span>
                ) : (
                  <span>Online · Xero Connected</span>
                )}
              </p>
            </div>

            {/* Persona toggle */}
            <div className="flex items-center gap-1 bg-stone-100 rounded-full p-0.5">
              <button
                onClick={() => setPersona("siki")}
                className={`text-[10px] font-semibold px-2.5 py-1 rounded-full transition-all btn-press ${
                  persona === "siki"
                    ? "bg-orange-400 text-white shadow-sm"
                    : "text-stone-500 hover:text-stone-700"
                }`}
                title="Siki — friendly, finds savings, explains in plain English"
              >
                Siki
              </button>
              <button
                onClick={() => setPersona("zana")}
                className={`text-[10px] font-semibold px-2.5 py-1 rounded-full transition-all btn-press ${
                  persona === "zana"
                    ? "bg-stone-800 text-white shadow-sm"
                    : "text-stone-500 hover:text-stone-700"
                }`}
                title="Zana — direct, chases payments, flags uncomfortable truths"
              >
                Zana
              </button>
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
                  {persona === "siki" ? (
                    <SikiMascotAnimated size={100} />
                  ) : (
                    <ZanaMascot size={100} mood="look" />
                  )}
                </div>
                {/* Staggered text reveal for the empty state */}
                <div className={`t-stagger ${staggerShown ? "is-shown" : ""}`}>
                  <h2 className="t-stagger-line t-stagger-line--1 text-lg font-semibold text-stone-800 mb-1">
                    {persona === "siki"
                      ? (showWelcome ? "Welcome! I'm Siki" : "Hi! I'm Siki, your AI Bookkeeper")
                      : "I'm Zana. Let's get you paid."}
                  </h2>
                  <p className="t-stagger-line t-stagger-line--2 text-sm text-stone-500 max-w-sm">
                    {persona === "siki"
                      ? (showWelcome
                        ? "I'm your AI bookkeeper. I read your Xero data, find what needs fixing, and explain your finances in plain English — no accounting jargon."
                        : "I reconcile your Xero transactions, find overdue invoices, explain your P&L in plain English, and propose journal entries to fix discrepancies.")
                      : "I chase overdue invoices, draft reminder emails, flag non-deductible expenses, and find savings you're missing. No sugarcoating."}
                  </p>
                </div>

                {/* First-time welcome banner with value prop */}
                {showWelcome && (
                  <div className="mt-4 w-full max-w-sm bg-sky-50 border border-sky-200 rounded-xl p-4 fade-in-up text-left">
                    <div className="flex items-start gap-3">
                      <div className="shrink-0 mt-0.5">
                        <span className="text-lg">✨</span>
                      </div>
                      <div className="flex-1">
                        <p className="text-xs font-semibold text-sky-900">Here's what I can do for you</p>
                        <ul className="text-[11px] text-sky-700 mt-1.5 space-y-1">
                          <li>💰 <span className="font-medium">Find money you're owed</span> — overdue invoices, who hasn't paid</li>
                          <li>📊 <span className="font-medium">Estimate your tax bill</span> — Corporation Tax + deductible expenses</li>
                          <li>📈 <span className="font-medium">Explain your P&L</span> — plain English, no jargon</li>
                          <li>✍️ <span className="font-medium">Fix discrepancies</span> — propose & post journal entries to Xero</li>
                        </ul>
                        <p className="text-[10px] text-sky-600 mt-2.5">
                          The sidebar shows a live snapshot of your books. Try a question below to see me in action →
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={dismissWelcome}
                      className="text-[10px] text-sky-600 hover:text-sky-800 mt-2 font-medium"
                    >
                      Got it, dismiss
                    </button>
                  </div>
                )}

                {/* Connect Your Xero CTA — shown when in demo mode and OAuth is available */}
                {oauthConfigured && !userConnection?.connected && (
                  <div className="mt-4 w-full max-w-sm fade-in-up">
                    <div className="bg-gradient-to-r from-sky-50 to-emerald-50 border border-sky-200 rounded-xl p-3 text-left">
                      <p className="text-[11px] text-stone-600 mb-2">
                        You're exploring with <span className="font-semibold">demo data</span>. Ready to see your real numbers?
                      </p>
                      <button
                        onClick={handleConnectXero}
                        disabled={connecting}
                        className="w-full text-xs font-semibold px-3 py-2 rounded-lg bg-sky-600 text-white hover:bg-sky-700 btn-press transition-colors disabled:opacity-50"
                      >
                        {connecting ? "Connecting…" : "Connect Your Xero →"}
                      </button>
                    </div>
                  </div>
                )}

                <div className="mt-6 grid grid-cols-1 gap-2 w-full max-w-sm">
                  <p className="t-stagger-line t-stagger-line--3 text-[10px] uppercase tracking-wide text-stone-400 font-semibold text-left">
                    {showWelcome ? "Try one of these to get started" : "Try a sample query"}
                  </p>
                  {(persona === "siki" ? SAMPLE_QUERIES : ZANA_QUERIES).map((sample, i) => (
                    <button
                      key={sample.id}
                      onClick={() => handleStartSample(sample.description)}
                      className={`text-left text-xs bg-stone-50 hover:bg-stone-100 border rounded-lg px-3 py-2.5 transition-colors btn-press fade-in-up group ${
                        persona === "siki"
                          ? "text-stone-600 border-stone-200"
                          : "text-stone-600 border-stone-300"
                      }`}
                      style={{ animationDelay: `${300 + i * 60}ms` }}
                    >
                      <div className="flex items-center justify-between">
                        <div className="font-medium text-stone-800">{sample.title}</div>
                        {sample.hint && (
                          <span className={`text-[9px] transition-colors ${
                            persona === "siki"
                              ? "text-stone-400 group-hover:text-sky-500"
                              : "text-stone-400 group-hover:text-rose-500"
                          }`}>
                            {sample.hint}
                          </span>
                        )}
                      </div>
                      <div className="text-stone-400 mt-0.5 line-clamp-2">
                        {sample.description}
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
                    {persona === "siki" ? <SikiMascot size={32} mood="idle" /> : <ZanaMascot size={32} mood="idle" />}
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
                  {persona === "siki" ? <SikiMascot size={32} mood="look" /> : <ZanaMascot size={32} mood="look" />}
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
