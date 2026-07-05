"use client";

import { useCallback, useEffect, useRef, useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useXeroThread } from "@/hooks/useXeroThread";
import {
  ApiError,
  endpoints,
  type Finding,
  type FindingsResponse,
  type XeroMode,
} from "@/lib/api";
import { MarkdownMessage } from "@/components/MarkdownMessage";
import { AnimatedNumber } from "@/components/AnimatedNumber";
import { SkeletonReveal } from "@/components/SkeletonReveal";
import { SuccessCheck } from "@/components/SuccessCheck";
import { ReceiptUpload } from "@/components/ReceiptUpload";
import { ProactiveAlert } from "@/components/ProactiveAlert";
import { ToolCallTrace } from "@/components/ToolCallTrace";
import { JournalEntryCard, parseJournalEntry } from "@/components/JournalEntryCard";
import { FindingsPanel, findingsSummary } from "@/components/FindingsPanel";
import { ApiHealthDot } from "@/components/ApiHealthDot";
import { FeedbackButtons } from "@/components/FeedbackButtons";
import { SikiMascot, SikiMascotAnimated, ZanaMascot } from "@/components/SikiMascot";
import { RotatedReveal } from "@/components/RotatedReveal";
import { SAMPLE_QUERIES, ZANA_QUERIES, findQuery } from "@/lib/xero-samples";
import type { ToolCallEvent } from "@/lib/types";
import { localStore, StorageKeys } from "@/lib/storage";
import { useMe } from "@/hooks/useMe";
import { PlanBadge } from "@/components/PlanBadge";

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
  revenue?: number;
  expenses?: number;
  netProfit: number;
  reportDate?: string;
  fromDate?: string;
  toDate?: string;
  rows?: { account: string; code: string; value: number }[];
}

function BooksView() {
  const searchParams = useSearchParams();
  const { threadId, messages, addMessage, updateLastAgentMessage, flush, ensureThread, newSession } = useXeroThread();

  // Session/plan info — fetched once on mount (cached in useMe), no polling.
  const { me } = useMe();

  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  // Plan/quota banner (HTTP 402 quota exhausted, 403 plan-gated Xero connect) —
  // distinct from errorBanner: it's an upgrade prompt, not an error.
  const [upgradeBanner, setUpgradeBanner] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  // Sign-in nudge — shown once per browser session after the first real answer.
  // sessionStorage persists across page reloads but clears when the tab closes.
  const [signInNudge, setSignInNudge] = useState<string | null>(null);
  const signInNudgeDismissed = typeof window !== "undefined" && sessionStorage.getItem("siki_signin_nudged") === "1";
  const [findings, setFindings] = useState<FindingsResponse | null>(null);
  const [findingsLoading, setFindingsLoading] = useState(true);
  // Findings the user already acted on — "asked" state on the cards.
  const [askedFindingIds, setAskedFindingIds] = useState<ReadonlySet<string>>(new Set());
  // Post-connect moment: full-attention staging after the OAuth return.
  const [connectStage, setConnectStage] = useState<"analyzing" | "reveal" | null>(null);
  const [xeroMode, setXeroMode] = useState<XeroMode | "unknown">("unknown");
  const [orgData, setOrgData] = useState<OrgData | null>(null);
  const [profitAndLoss, setProfitAndLoss] = useState<ProfitAndLossData | null>(null);
  const [pnLoading, setPnLoading] = useState(true);
  const [staggerShown, setStaggerShown] = useState(false);
  const [showSuccessCheck, setShowSuccessCheck] = useState(false);
  // One-line mode description, shown briefly after switching personas.
  const [modeHintShown, setModeHintShown] = useState(false);
  const [thinkingMessage, setThinkingMessage] = useState<string>("");
  const [showWelcome, setShowWelcome] = useState(false);
  const [oauthConfigured, setOauthConfigured] = useState(false);
  const [userConnection, setUserConnection] = useState<{ connected: boolean; tenant_name?: string } | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [persona, setPersona] = useState<"siki" | "zana">("siki");

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const successDialogRef = useRef<HTMLDivElement>(null);
  const streamAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Abort any in-flight stream when leaving the page.
  useEffect(() => {
    return () => streamAbortRef.current?.abort();
  }, []);

  // Success overlay: focus it, close on Escape.
  useEffect(() => {
    if (!showSuccessCheck) return;
    successDialogRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowSuccessCheck(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showSuccessCheck]);

  // Trigger staggered text reveal on mount.
  useEffect(() => {
    const timer = setTimeout(() => setStaggerShown(true), 100);
    return () => clearTimeout(timer);
  }, []);

  // Detect first-time visit to show welcome onboarding.
  useEffect(() => {
    const visited = localStore.get<boolean>(StorageKeys.BOOKS_VISITED, false);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!visited) setShowWelcome(true);
  }, []);

  const dismissWelcome = () => {
    localStore.set(StorageKeys.BOOKS_VISITED, true);
    setShowWelcome(false);
  };

  /** Fetch the structured audit findings — the heart of the page. */
  const loadFindings = useCallback(async (): Promise<FindingsResponse | null> => {
    setFindingsLoading(true);
    try {
      const data = await endpoints.xero.findings();
      setFindings(data);
      return data;
    } catch {
      setFindings(null);
      return null;
    } finally {
      setFindingsLoading(false);
    }
  }, []);

  // Fetch findings + Xero status + P&L on mount.
  useEffect(() => {
    void endpoints.xero
      .status()
      .then((s) => setXeroMode(s.mode))
      .catch(() => {});
    void endpoints.xero
      .organisation()
      .then((o) => {
        // /api/xero/status is the single source of truth for the mode —
        // org data has no reliable isDemoCompany field outside Xero's own
        // demo company, and guessing here showed "Xero Live" on demo data.
        setOrgData(o as unknown as OrgData);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loadFindings flips its loading flag synchronously by design
    void loadFindings();
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
  }, [loadFindings]);

  // Handle OAuth callback redirect (?connected=true&org=...) — once. The
  // param is stripped from the URL immediately so a refresh doesn't
  // re-trigger the post-connect moment.
  const connectHandledRef = useRef(false);
  useEffect(() => {
    if (connectHandledRef.current) return;
    const connected = searchParams.get("connected");
    if (connected !== "true" && connected !== "false") return;
    connectHandledRef.current = true;

    // Clean the query string (keep any other params, e.g. ?q=).
    const cleaned = new URLSearchParams(searchParams.toString());
    cleaned.delete("connected");
    cleaned.delete("org");
    const qs = cleaned.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);

    if (connected === "false") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setErrorBanner("Failed to connect your Xero account. Please try again.");
      return;
    }

    // Full-attention moment: Siki looks around while the fresh audit loads.
     
    setConnectStage("analyzing");
    void endpoints.xero
      .connection()
      .then((c) => {
        setOauthConfigured(c.oauth_configured);
        setUserConnection({ connected: c.connected, tenant_name: c.tenant_name });
      })
      .catch(() => {});
    const startedAt = Date.now();
    void loadFindings().then(() => {
      // Let the moment breathe — reveal after at least 1.6s.
      const wait = Math.max(0, 1600 - (Date.now() - startedAt));
      setTimeout(() => setConnectStage("reveal"), wait);
    });
  }, [searchParams, loadFindings]);

  const dismissConnectMoment = () => {
    setConnectStage(null);
    // Free plan + money on the table → frame the upgrade.
    if (findings && findings.money_found > 0 && (!me || me.plan === "free")) {
      setUpgradeBanner(
        `Siki found £${Math.round(findings.money_found).toLocaleString()} in your books — upgrade to Pro to let Siki fix these.`,
      );
    }
  };

  const handleConnectXero = async () => {
    setConnecting(true);
    try {
      // Connecting Xero is free for everyone — only write-back is Pro-gated.
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

  // Seed the chat input from URL params — once, after mount (never during
  // render). `?sample=<id>` looks up a canned query; `?q=<text>` seeds
  // free text (used by the Activity page's Reverse button).
  const seededRef = useRef(false);
  useEffect(() => {
    if (seededRef.current) return;
    seededRef.current = true;
    const q = searchParams.get("q");
    if (q?.trim()) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setInput(q.trim());
      return;
    }
    const sampleId = searchParams.get("sample");
    const sample = sampleId ? findQuery(sampleId) : undefined;
    if (sample && messages.length === 0) {
       
      setInput(sample.description);
    }
  }, [searchParams, messages.length]);

  const sendToAgent = async (message: string) => {
    setIsLoading(true);
    setErrorBanner(null);
    setThinkingMessage("Looking into your books…");
    const tid = ensureThread();

    const controller = new AbortController();
    streamAbortRef.current = controller;

    // Track tool calls and response text for this message
    const toolCalls: ToolCallEvent[] = [];
    let responseText = "";

    // Add a placeholder agent message that we'll update as events stream in
    addMessage({ role: "agent", content: "", toolCalls: [] });

    try {
      for await (const event of endpoints.xero.chatStream(message, tid, persona, controller.signal)) {
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
        }
        // "done": nothing extra to do — the success overlay only fires from a
        // real journal POST (see JournalEntryCard onPosted), never from
        // string-matching the response text.
      }

      // Sign-in nudge: after the first real agent answer, if the user
      // is anonymous and hasn't been nudged this session, suggest signing
      // in to save progress. At 3/5 queries, nudge again with "sign in
      // for more" (lighter than the upgrade banner at 5/5).
      if (!signInNudgeDismissed && (!me || !me.authenticated)) {
        const used = me?.usage?.used ?? 0;
        const limit = me?.usage?.limit ?? 5;
        if (used >= 3 && used < limit) {
          setSignInNudge(
            `You've used ${used} of ${limit} free queries. Sign in to keep your chat history and get a weekly digest.`,
          );
        } else if (messages.filter((m) => m.role === "agent" && m.content).length === 1) {
          // First real answer — light nudge to save progress.
          setSignInNudge("Sign in to save your progress and access Siki from any device.");
        }
      }
    } catch (e) {
      if (controller.signal.aborted) {
        // User pressed Stop — keep the partial text, mark it as stopped.
        updateLastAgentMessage({
          content: responseText ? `${responseText}\n\n(stopped)` : "(stopped)",
          toolCalls: [...toolCalls],
        });
      } else if (e instanceof ApiError && e.status === 402) {
        // Free monthly quota exhausted — upgrade prompt, not a generic error.
        const quotaMessage =
          "You've used all 5 free queries this month — upgrade to Pro for unlimited queries.";
        updateLastAgentMessage({
          content: responseText || quotaMessage,
          toolCalls: [...toolCalls],
        });
        setUpgradeBanner(quotaMessage);
      } else {
        const rateLimited = e instanceof ApiError && e.status === 429;
        const detail = rateLimited
          ? "You're sending messages quickly — give it a moment and try again."
          : e instanceof ApiError
            ? `Bookkeeper error (${e.status}).`
            : e instanceof DOMException && e.name === "AbortError"
              ? "The response took too long. Please try again."
              : e instanceof Error
                ? e.message
                : "Unknown error.";
        updateLastAgentMessage({
          content: responseText || (rateLimited ? detail : `Sorry, ${detail} Please try again.`),
          toolCalls: [...toolCalls],
        });
        setErrorBanner(detail);
      }
    } finally {
      streamAbortRef.current = null;
      setIsLoading(false);
      setThinkingMessage("");
      flush(); // make sure the finished thread hits localStorage
    }
  };

  const handleStop = () => {
    streamAbortRef.current?.abort();
  };

  const handleReceiptUpload = async (response: string, filename: string) => {
    addMessage({
      role: "user",
      content: `📎 Uploaded receipt: ${filename}`,
    });
    addMessage({ role: "agent", content: response });
  };

  const handleReceiptError = (message: string, status?: number) => {
    if (status === 402) {
      setUpgradeBanner(
        "You've used all 5 free queries this month — upgrade to Pro for unlimited queries.",
      );
    } else {
      setErrorBanner(message);
    }
  };

  /**
   * Act on a finding: send its server-provided prompt into the chat via the
   * same path as user-typed messages (streaming + tool traces included),
   * then mark the card as asked.
   */
  const handleFindingAct = (finding: Finding) => {
    if (isLoading) return;
    setAskedFindingIds((prev) => new Set(prev).add(finding.id));
    addMessage({ role: "user", content: finding.action.prompt });
    void sendToAgent(finding.action.prompt);
  };

  const handlePersonaChange = (next: "siki" | "zana") => {
    setPersona(next);
    setModeHintShown(true);
  };

  // Auto-hide the mode description a few seconds after switching.
  useEffect(() => {
    if (!modeHintShown) return;
    const timer = setTimeout(() => setModeHintShown(false), 5000);
    return () => clearTimeout(timer);
  }, [modeHintShown, persona]);

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
                <span className="text-xs font-medium px-2 py-1 rounded-lg bg-emerald-50 text-emerald-700">
                  ● {userConnection.tenant_name || "Your Xero"}
                </span>
                <button
                  onClick={handleDisconnect}
                  className="text-xs text-stone-500 hover:text-red-600 px-1.5 py-1 rounded hover:bg-red-50 btn-press"
                  title="Disconnect your Xero"
                >
                  Disconnect
                </button>
              </div>
            ) : oauthConfigured ? (
              <button
                onClick={handleConnectXero}
                disabled={connecting}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-sky-600 text-white hover:bg-sky-700 btn-press transition-colors disabled:opacity-50"
              >
                {connecting ? "Connecting…" : "Connect Your Xero →"}
              </button>
            ) : (
              <span
                className={`text-xs font-medium px-2 py-1 rounded-lg transition-opacity duration-200 ${
                  xeroMode === "live-oauth" || xeroMode === "live-cli"
                    ? "bg-emerald-50 text-emerald-700"
                    : xeroMode === "demo"
                      ? "bg-amber-50 text-amber-700"
                      : "bg-stone-100 text-stone-500"
                }`}
              >
                {xeroMode === "live-oauth" || xeroMode === "live-cli" ? "● Xero Live" : xeroMode === "demo" ? "● Demo Data" : "○ Connecting..."}
              </span>
            )}
            <Link
              href="/activity"
              className="text-xs text-stone-500 hover:text-stone-700 px-2 py-1 rounded hover:bg-stone-100 btn-press"
            >
              Activity
            </Link>
            <Link
              href="/account"
              className="text-xs text-stone-500 hover:text-stone-700 px-2 py-1 rounded hover:bg-stone-100 btn-press flex items-center gap-1.5"
            >
              {me?.authenticated ? (
                <>
                  Account <PlanBadge plan={me.plan} />
                </>
              ) : (
                "Sign in"
              )}
            </Link>
            <Link
              href="/pricing"
              className="text-xs text-stone-500 hover:text-stone-700 px-2 py-1 rounded hover:bg-stone-100 btn-press"
            >
              Pricing
            </Link>
            <Link
              href="/"
              className="text-xs text-stone-500 hover:text-stone-700 px-2 py-1 rounded hover:bg-stone-100 btn-press"
            >
              Home
            </Link>
          </div>
        </div>
      </nav>

      <div className="flex-1 flex flex-col items-center lg:flex-row lg:items-stretch lg:justify-center p-4 gap-4">
        {/* Mobile: the findings panel stacks ABOVE the chat — small screens
            get the audit's value instead of losing the sidebar entirely. */}
        <div className="lg:hidden w-full max-w-2xl bg-white rounded-2xl shadow-sm border border-stone-200 p-4">
          <FindingsPanel
            data={findings}
            loading={findingsLoading}
            askedIds={askedFindingIds}
            disabled={isLoading}
            onAct={handleFindingAct}
            onSuggest={(prompt) => {
              setInput(prompt);
              inputRef.current?.focus();
            }}
            suggestions={(persona === "siki" ? SAMPLE_QUERIES : ZANA_QUERIES).slice(0, 3)}
          />
        </div>

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
                    xeroMode === "live-oauth" || xeroMode === "live-cli"
                      ? "bg-emerald-50 text-emerald-600"
                      : "bg-amber-50 text-amber-600"
                  }`}
                >
                  {xeroMode === "live-oauth" || xeroMode === "live-cli" ? "LIVE" : "DEMO"}
                </span>
              )}
            </div>
            <SkeletonReveal isLoading={!orgData} className="h-[40px]" skeletonClassName="rounded-md">
              {orgData && (
                <div>
                  <p className="text-sm font-semibold text-stone-800">{orgData.name}</p>
                  <p className="text-[10px] text-stone-500 mt-0.5">
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
                    <span className="text-[10px] text-stone-500">This month</span>
                    <span className="text-[10px] text-stone-500">
                      as of {new Date(profitAndLoss.reportDate || profitAndLoss.toDate || "").toLocaleDateString("en-GB", { month: "short", day: "numeric" })}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <div className="text-[10px] text-stone-500">Revenue</div>
                      <div className="text-sm font-bold text-emerald-700">
                        £{(profitAndLoss.revenue ?? profitAndLoss.rows?.filter(r => r.value > 0).reduce((s, r) => s + r.value, 0) ?? 0).toLocaleString(undefined, { minimumFractionDigits: 0 })}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-stone-500">Expenses</div>
                      <div className="text-sm font-bold text-red-600">
                        £{Math.abs(profitAndLoss.expenses ?? profitAndLoss.rows?.filter(r => r.value < 0).reduce((s, r) => s + r.value, 0) ?? 0).toLocaleString(undefined, { minimumFractionDigits: 0 })}
                      </div>
                    </div>
                  </div>
                  <div className="pt-2 border-t border-stone-200">
                    <div className="text-[10px] text-stone-500">Net Profit</div>
                    <div className="text-lg font-bold text-stone-900">
                      £{profitAndLoss.netProfit.toLocaleString(undefined, { minimumFractionDigits: 0 })}
                    </div>
                  </div>
                </div>
              )}
            </SkeletonReveal>
          </div>

          {/* Findings — the structured audit replaces the old Health Check +
              Needs Attention + Action Center trio. One source of truth,
              shared with the mobile panel. Compact enough for the sidebar. */}
          <div className="flex-1">
            <div className="flex items-center gap-1 mb-1.5">
              <span className="text-[10px] uppercase tracking-wide text-stone-500 font-semibold">
                Findings
              </span>
              {showWelcome && (
                <span className="text-[9px] text-sky-500 font-medium">← things to fix</span>
              )}
            </div>
            <FindingsPanel
              data={findings}
              loading={findingsLoading}
              askedIds={askedFindingIds}
              disabled={isLoading}
              onAct={handleFindingAct}
              onSuggest={(prompt) => {
                setInput(prompt);
                inputRef.current?.focus();
              }}
              suggestions={(persona === "siki" ? SAMPLE_QUERIES : ZANA_QUERIES).slice(0, 3)}
              compact
            />
          </div>

          <div className="border-t border-stone-100 pt-3 mt-auto">
            <Link href="/activity" className="text-[10px] text-stone-500 hover:text-stone-700 transition-colors">
              View audit trail →
            </Link>
          </div>
        </aside>

        {/* Chat — dvh on mobile so browser chrome doesn't fight the layout */}
        <div className="w-full max-w-2xl bg-white rounded-2xl shadow-xl flex flex-col h-[70dvh] lg:h-[78vh] overflow-hidden border border-stone-200">
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
                {isLoading ? (
                  <>
                    <span className={`w-1.5 h-1.5 rounded-full ${persona === "siki" ? "bg-sky-500" : "bg-rose-500"}`} />
                    <span className="t-shimmer">{thinkingMessage || "Thinking…"}</span>
                  </>
                ) : (
                  /* Real backend + Xero status — no hardcoded "Connected" claims */
                  <ApiHealthDot />
                )}
              </p>
            </div>

            {/* Persona toggle — explicit modes, described on switch */}
            <div className="flex items-center gap-1 bg-stone-100 rounded-full p-0.5">
              <button
                onClick={() => handlePersonaChange("siki")}
                className={`text-xs font-semibold px-2.5 py-1 rounded-full transition-all btn-press ${
                  persona === "siki"
                    ? "bg-orange-400 text-white shadow-sm"
                    : "text-stone-500 hover:text-stone-700"
                }`}
                title="Siki — friendly, finds savings, explains in plain English"
              >
                Siki
              </button>
              <button
                onClick={() => handlePersonaChange("zana")}
                className={`text-xs font-semibold px-2.5 py-1 rounded-full transition-all btn-press ${
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
              confirmClear ? (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => { newSession(); setConfirmClear(false); }}
                    className="text-xs font-semibold text-white bg-red-500 hover:bg-red-600 px-2 py-1 rounded btn-press"
                  >
                    Clear
                  </button>
                  <button
                    onClick={() => setConfirmClear(false)}
                    className="text-xs text-stone-500 hover:text-stone-700 px-1.5 py-1 rounded btn-press"
                  >
                    ×
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmClear(true)}
                  className="flex items-center gap-1 text-xs text-stone-500 hover:text-stone-700 px-2 py-1 rounded hover:bg-stone-100 btn-press"
                  title="Start a new conversation"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                  Clear
                </button>
              )
            )}
          </div>

          {/* Mode description — appears briefly after switching personas */}
          {modeHintShown && (
            <div
              className="px-5 py-1.5 bg-stone-50 border-b border-stone-100 text-[11px] text-stone-600 fade-in-up"
              role="status"
            >
              {persona === "siki"
                ? "Bookkeeper mode — finds & fixes: reconciliation, journal entries, tax."
                : "Advisor mode — chases payments, finds savings, tells hard truths."}
            </div>
          )}

          {/* Quota / plan-gate banner — an upgrade prompt, deliberately not styled as an error */}
          {upgradeBanner && (
            <div className="bg-sky-50 border-b border-sky-200 px-4 py-2.5 text-xs text-sky-900 flex items-center justify-between gap-3 fade-in-up">
              <span>{upgradeBanner}</span>
              <div className="flex items-center gap-2 shrink-0">
                <Link
                  href="/account?intent=pro"
                  className="font-semibold text-white bg-sky-600 hover:bg-sky-700 px-2.5 py-1 rounded-lg btn-press transition-colors"
                >
                  Upgrade
                </Link>
                <button
                  onClick={() => setUpgradeBanner(null)}
                  className="text-sky-500 hover:text-sky-700 btn-press"
                  aria-label="Dismiss upgrade prompt"
                >
                  ×
                </button>
              </div>
            </div>
          )}

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

          {/* Sign-in nudge — contextual, dismissible, once per session.
              Lighter than the upgrade banner: asks for sign-in (free), not
              upgrade (paid). Shown after the first answer or at 3/5 queries. */}
          {signInNudge && (
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
                  onClick={() => {
                    setSignInNudge(null);
                    sessionStorage.setItem("siki_signin_nudged", "1");
                  }}
                  className="text-violet-400 hover:text-violet-600 btn-press"
                  aria-label="Dismiss sign-in prompt"
                >
                  ×
                </button>
              </div>
            </div>
          )}

          {/* The old client-fabricated "Audit Complete" banner is gone —
              the findings panel is the proactive audit now, with real
              server-built findings instead of injected agent speech. */}

          {/* aria-live so streamed answers reach screen readers */}
          <div className="flex-1 overflow-y-auto p-5 space-y-4 scroll-thin" aria-live="polite">
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
                        <p className="text-xs font-semibold text-sky-900">Here&apos;s what I can do for you</p>
                        <ul className="text-[11px] text-sky-700 mt-1.5 space-y-1">
                          <li>💰 <span className="font-medium">Find money you&apos;re owed</span> — overdue invoices, who hasn&apos;t paid</li>
                          <li>📊 <span className="font-medium">Estimate your tax bill</span> — Corporation Tax + deductible expenses</li>
                          <li>📈 <span className="font-medium">Explain your P&L</span> — plain English, no jargon</li>
                          <li>✍️ <span className="font-medium">Fix discrepancies</span> — propose & post journal entries to Xero</li>
                        </ul>
                        <p className="text-xs text-sky-600 mt-2.5">
                          The sidebar shows a live snapshot of your books. Try a question below to see me in action →
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={dismissWelcome}
                      className="text-xs text-sky-600 hover:text-sky-800 mt-2 font-medium"
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
                        You&apos;re exploring with <span className="font-semibold">demo data</span>. Ready to see your real numbers?
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
                  <p className="t-stagger-line t-stagger-line--3 text-[10px] uppercase tracking-wide text-stone-500 font-semibold text-left">
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
                      <div className="text-stone-500 mt-0.5 line-clamp-2">
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
                      incomplete={journal.incomplete}
                      threadId={threadId}
                      onPosted={(result) => {
                        // Full celebration only for a real Xero write —
                        // demo mode shows its own "Simulated" note on the card.
                        if (result.posted && result.mode !== "demo") {
                          setShowSuccessCheck(true);
                          setTimeout(() => setShowSuccessCheck(false), 3000);
                        }
                      }}
                      onReject={() => {
                        // Pre-fill the chat so the user tells the agent what to change.
                        setInput("Don't post that entry — ");
                        inputRef.current?.focus();
                      }}
                    />
                  )}
                  {/* Feedback on completed agent answers (not while streaming) */}
                  {msg.role === "agent" && msg.content && threadId &&
                    !(isLoading && i === messages.length - 1) && (
                    <FeedbackButtons threadId={threadId} messageIndex={i} initial={msg.feedback} />
                  )}
                  {/* Contextual Zana nudge — only on the last agent message,
                      only in Siki mode, only when not streaming. Detects
                      overdue invoices, tax, or savings opportunities in the
                      response and suggests switching to Zana for the action
                      Zana is better at (chasing, tax bluntness, savings). */}
                  {msg.role === "agent" && msg.content &&
                    persona === "siki" &&
                    !isLoading && i === messages.length - 1 &&
                    (() => {
                      const lower = msg.content.toLowerCase();
                      let nudge: string | null = null;
                      if (lower.includes("overdue") || lower.includes("owed") || lower.includes("hasn't paid") || lower.includes("haven't paid"))
                        nudge = "Zana can draft the chasing email for this →";
                      else if (lower.includes("tax") || lower.includes("deduct") || lower.includes("corporation tax"))
                        nudge = "Zana can check if you're overpaying tax →";
                      else if (lower.includes("saving") || lower.includes("expense") || lower.includes("margin") || lower.includes("profit"))
                        nudge = "Zana can find savings in your expenses →";
                      if (!nudge) return null;
                      return (
                        <button
                          onClick={() => handlePersonaChange("zana")}
                          className="self-start mt-1 text-[11px] font-medium text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 px-2.5 py-1.5 rounded-lg btn-press transition-colors fade-in-up flex items-center gap-1.5"
                        >
                          <span className="text-rose-400">⚡</span>
                          {nudge}
                        </button>
                      );
                    })()}
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
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  // Guard against IME composition — Enter confirms the
                  // composition, it shouldn't send the message.
                  if (e.key === "Enter" && !e.nativeEvent.isComposing) handleSend();
                }}
                placeholder="Ask about your books, invoices, or P&L..."
                disabled={isLoading}
                className="flex-1 px-4 py-2.5 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500 bg-white disabled:opacity-50"
              />
              {isLoading ? (
                <button
                  onClick={handleStop}
                  className="p-2.5 bg-stone-700 hover:bg-stone-800 text-white rounded-xl transition-colors btn-press"
                  title="Stop response"
                  aria-label="Stop response"
                >
                  <svg aria-hidden="true" className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <rect x="7" y="7" width="10" height="10" rx="1.5" />
                  </svg>
                </button>
              ) : (
                <button
                  onClick={handleSend}
                  disabled={!input.trim()}
                  className="p-2.5 bg-sky-600 hover:bg-sky-700 text-white rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed btn-press"
                  title="Send"
                  aria-label="Send"
                >
                  <svg aria-hidden="true" className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                </button>
              )}
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

      {/* Success check overlay — plays when a journal entry actually posts to Xero.
          Escape or a click anywhere dismisses it. */}
      {showSuccessCheck && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm fade-in-up"
          onClick={() => setShowSuccessCheck(false)}
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
          aria-label="Analysing your books"
        >
          <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-sm w-full mx-4 flex flex-col items-center gap-3 text-center fade-in-up">
            {connectStage === "analyzing" ? (
              <>
                <SikiMascot size={80} mood="look" />
                <p className="text-sm font-semibold text-stone-800">
                  Connected ✓ Give me a moment with your books…
                </p>
                <p className="text-xs text-stone-500 t-shimmer">
                  Scanning invoices, bank transactions, and your P&amp;L
                </p>
              </>
            ) : (
              <>
                <SikiMascot
                  size={80}
                  mood={findings && !findings.clean ? "look" : "celebrate"}
                />
                {findings && findings.money_found > 0 ? (
                  <>
                    <div className="text-4xl font-bold text-stone-900 leading-none">
                      <AnimatedNumber prefix="£" value={Math.round(findings.money_found)} />
                    </div>
                    <p className="text-sm font-semibold text-stone-800">
                      found in overdue invoices
                    </p>
                    <p className="text-xs text-stone-500">{findingsSummary(findings)}</p>
                  </>
                ) : findings && !findings.clean ? (
                  <>
                    <p className="text-sm font-semibold text-stone-800">
                      Here&apos;s what I found in your books
                    </p>
                    <p className="text-xs text-stone-500">{findingsSummary(findings)}</p>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-semibold text-stone-800">
                      Your books look clean ✓
                    </p>
                    <p className="text-xs text-stone-500">
                      Nothing overdue, nothing unreconciled.
                    </p>
                  </>
                )}
                <button
                  onClick={dismissConnectMoment}
                  className="mt-2 text-sm font-semibold bg-sky-600 text-white px-5 py-2 rounded-lg hover:bg-sky-700 btn-press transition-colors"
                >
                  Show me →
                </button>
              </>
            )}
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
