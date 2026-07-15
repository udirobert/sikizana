"use client";

import { useCallback, useEffect, useRef, useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams, usePathname } from "next/navigation";
import { useXeroThread } from "@/hooks/useXeroThread";
import {
  ApiError,
  endpoints,
  type ContextResult,
  type Finding,
  type FindingReviewState,
  type FindingsResponse,
  type XeroMode,
} from "@/lib/api";
import type { AnalysisCardData, MemoryRecallData } from "@/lib/types";
import { MarkdownMessage } from "@/components/MarkdownMessage";
import { AnimatedNumber } from "@/components/AnimatedNumber";
import { SkeletonReveal } from "@/components/SkeletonReveal";
import { SuccessCheck } from "@/components/SuccessCheck";
import { ReceiptUpload } from "@/components/ReceiptUpload";
import { ProactiveAlert } from "@/components/ProactiveAlert";
import { ToolCallTrace } from "@/components/ToolCallTrace";
import { WhileAgentWorks } from "@/components/WhileAgentWorks";
import { JournalEntryCard, parseJournalEntry } from "@/components/JournalEntryCard";
import { NegotiationEmailCard, parseNegotiationEmail } from "@/components/NegotiationEmailCard";
import { AnalysisCard } from "@/components/AnalysisCard";
import { AutoChaseNotice, type AutoChaseNoticeState } from "@/components/AutoChaseNotice";
import { FindingsPanel, findingsSummary } from "@/components/FindingsPanel";
import { ResponseSummary } from "@/components/ResponseSummary";
import { ApiHealthDot } from "@/components/ApiHealthDot";
import { MemoryBadge } from "@/components/MemoryBadge";
import { useBackendHealth } from "@/hooks/useBackendHealth";
import { MemoryRecallTrace } from "@/components/MemoryRecallTrace";
import { FeedbackButtons } from "@/components/FeedbackButtons";
import { SikiMascot, SikiMascotAnimated, ZanaMascot } from "@/components/SikiMascot";
import { RotatedReveal } from "@/components/RotatedReveal";
import { SAMPLE_QUERIES, ZANA_QUERIES, findQuery } from "@/lib/xero-samples";
import type { ToolCallEvent } from "@/lib/types";
import { localStore, StorageKeys } from "@/lib/storage";
import { getPersonaCopy, getPersonaTheme, getRecoveredCelebrationCopy, getConnectMomentCopy, PERSONA_STORAGE_KEY } from "@/lib/persona-theme";
import { useMe } from "@/hooks/useMe";
import { PlanBadge } from "@/components/PlanBadge";
import { ProfitTrendChart } from "@/components/ProfitTrendChart";

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
  const pathname = usePathname();
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
  const [currentTool, setCurrentTool] = useState<string | null>(null);
  const [lastQuery, setLastQuery] = useState("");
  // HMRC context results fetched during the wait — persisted under the
  // agent's response so the guidance stays visible after loading completes.
  const [lastContextResults, setLastContextResults] = useState<ContextResult[]>([]);
  // Sign-in nudge — shown once per browser session after the first real answer.
  // sessionStorage persists across page reloads but clears when the tab closes.
  const [signInNudge, setSignInNudge] = useState<string | null>(null);
  const signInNudgeDismissed = typeof window !== "undefined" && sessionStorage.getItem("siki_signin_nudged") === "1";
  const [findings, setFindings] = useState<FindingsResponse | null>(null);
  const [findingsLoading, setFindingsLoading] = useState(true);
  // Findings the user already acted on — "asked" state on the cards.
  const [askedFindingIds, setAskedFindingIds] = useState<ReadonlySet<string>>(new Set());
  const [reviewingFindingIds, setReviewingFindingIds] = useState<ReadonlySet<string>>(new Set());
  // Findings with an auto-chase sequence scheduled (from /api/chase/list +
  // this session's clicks).
  const [chasedFindingIds, setChasedFindingIds] = useState<ReadonlySet<string>>(new Set());
  // Confirmation banner for non-error notices (e.g. chase scheduled).
  const [chaseNotice, setChaseNotice] = useState<AutoChaseNoticeState | null>(null);
  // The payment moment: amount newly recovered since the user's last visit.
  const [recoveredCelebration, setRecoveredCelebration] = useState<number | null>(null);
  // Saved findings (commitment ladder) — persists in localStorage so
  // returning users see their saved issues and have a reason to come back.
  const [savedFindingIds, setSavedFindingIds] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => {
    try {
      const saved = localStorage.getItem("siki_saved_findings");
      if (saved) setSavedFindingIds(new Set(JSON.parse(saved)));
    } catch { /* ignore */ }
  }, []);
  const handleFindingSave = useCallback((finding: Finding) => {
    setSavedFindingIds((prev) => {
      const next = new Set(prev);
      next.add(finding.id);
      try { localStorage.setItem("siki_saved_findings", JSON.stringify([...next])); } catch { /* ignore */ }
      return next;
    });
  }, []);
  // Post-connect moment: full-attention staging after the OAuth return.
  const [connectStage, setConnectStage] = useState<"analyzing" | "reveal" | null>(null);
  const [xeroMode, setXeroMode] = useState<XeroMode | "unknown">("unknown");
  const [orgData, setOrgData] = useState<OrgData | null>(null);
  const [profitAndLoss, setProfitAndLoss] = useState<ProfitAndLossData | null>(null);
  const [pnLoading, setPnLoading] = useState(true);
  const [metricSnapshots, setMetricSnapshots] = useState<
    Array<{ captured_at: string; total_revenue: number; net_margin: number; total_overdue: number }>
  >([]);
  const [staggerShown, setStaggerShown] = useState(false);
  const [showSuccessCheck, setShowSuccessCheck] = useState(false);
  // One-line mode description, shown briefly after switching personas.
  const [modeHintShown, setModeHintShown] = useState(false);
  const [thinkingMessage, setThinkingMessage] = useState<string>("");
  const [showWelcome, setShowWelcome] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [oauthConfigured, setOauthConfigured] = useState(false);
  const [userConnection, setUserConnection] = useState<{ connected: boolean; tenant_name?: string } | null>(null);
  const [memoryEnabled, setMemoryEnabled] = useState(true);
  const [rememberedMessages, setRememberedMessages] = useState<Set<number>>(new Set());
  const [connecting, setConnecting] = useState(false);
  // Pre-OAuth consent screen — what Siki reads, what it can't do, how to leave.
  const [showConnectConfirm, setShowConnectConfirm] = useState(false);
  // Onboarding sector question — the one personal datum we ask for, so
  // "is this normal?" compares against THEIR industry instead of a guess.
  const [sector, setSector] = useState<string | null>(null);
  const [sectorSaved, setSectorSaved] = useState(false);
  useEffect(() => {
    void endpoints.prefs
      .get()
      .then((p) => setSector(p.sector))
      .catch(() => {});
  }, []);
  const handleSectorPick = async (value: string) => {
    setSector(value);
    setSectorSaved(true);
    try {
      await endpoints.prefs.set(value);
    } catch {
      /* best-effort — the chips can be re-picked */
    }
  };
  const [persona, setPersona] = useState<"siki" | "zana">(() => {
    // Persist persona in localStorage so it survives page refreshes
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(PERSONA_STORAGE_KEY);
      if (saved === "siki" || saved === "zana") return saved;
    }
    return "siki";
  });
  const theme = getPersonaTheme(persona);
  const copy = getPersonaCopy(persona);
  const recoveredCopy = getRecoveredCelebrationCopy(persona);
  const connectCopy = getConnectMomentCopy(persona, xeroMode === "demo");
  const { supermemory } = useBackendHealth();

  const refreshMetricSnapshots = useCallback((force = false) => {
    void endpoints.xero
      .metricSnapshots({ force })
      .then((r) => setMetricSnapshots(r.snapshots))
      .catch(() => {});
  }, []);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const successDialogRef = useRef<HTMLDivElement>(null);
  const streamAbortRef = useRef<AbortController | null>(null);
  const demoSeededRef = useRef(false);

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

  // Detect first-time visit to show the welcome empty state. (The old
  // full-screen demo modal is gone — it repeated the welcome banner and
  // the persistent amber banner, forcing two dismissals before first value.)
  useEffect(() => {
    const visited = localStore.get<boolean>(StorageKeys.BOOKS_VISITED, false);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!visited) setShowWelcome(true);
  }, []);

  const dismissWelcome = () => {
    localStore.set(StorageKeys.BOOKS_VISITED, true);
    setShowWelcome(false);
  };

  const handleRemember = async (index: number, content: string) => {
    try {
      await endpoints.memory.remember(content);
      setRememberedMessages((prev) => new Set(prev).add(index));
    } catch {
      // best-effort — user can still see the chat
    }
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
    refreshMetricSnapshots();

    // Check if Xero OAuth is configured + if user has connected their own org
    void endpoints.xero
      .connection()
      .then((c) => {
        setOauthConfigured(c.oauth_configured);
        setUserConnection({ connected: c.connected, tenant_name: c.tenant_name });
        // If the user came from the landing page "Connect My Xero" button
        // (?connect=1), open the consent screen — never hard-redirect a
        // first-time visitor into Xero's permissions page unexplained.
        if (c.oauth_configured && !c.connected && searchParams.get("connect") === "1") {
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setShowConnectConfirm(true);
        }
      })
      .catch(() => {});
  }, [loadFindings, refreshMetricSnapshots, searchParams]);

  // Seed demo memories when running in demo mode so first-time judges see
  // proactive memory alerts and cross-session recall without a warm-up chat.
  useEffect(() => {
    if (xeroMode !== "demo" || demoSeededRef.current) return;
    demoSeededRef.current = true;
    void endpoints.memory.seedDemo().catch(() => {});
  }, [xeroMode]);

  // Landing page paths: /books?persona=siki|zana sets the active owl once.
  const personaFromUrlRef = useRef(false);
  useEffect(() => {
    if (personaFromUrlRef.current) return;
    const p = searchParams.get("persona");
    if (p !== "siki" && p !== "zana") return;
    personaFromUrlRef.current = true;
    setPersona(p);
    setModeHintShown(true);
    try {
      localStorage.setItem(PERSONA_STORAGE_KEY, p);
    } catch {
      /* ignore */
    }
    const cleaned = new URLSearchParams(searchParams.toString());
    cleaned.delete("persona");
    const qs = cleaned.toString();
    window.history.replaceState(null, "", `${pathname}${qs ? `?${qs}` : ""}`);
  }, [searchParams, pathname]);

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
      setTimeout(() => {
        setConnectStage("reveal");
        refreshMetricSnapshots(true);
      }, wait);
    });
  }, [searchParams, loadFindings, refreshMetricSnapshots]);

  const dismissConnectMoment = () => {
    setConnectStage(null);
    // Free plan + money on the table → frame the upgrade.
    if (findings && findings.money_found > 0 && (!me || me.plan === "free")) {
      const label = xeroMode === "demo" ? "the sample books" : "your books";
      setUpgradeBanner(
        copy.upgradeBanner(
          Math.round(findings.money_found).toLocaleString(),
          label,
        ),
      );
    }
  };

  /** The actual OAuth redirect — only ever called from the consent screen. */
  const startXeroOAuth = async () => {
    setConnecting(true);
    try {
      // Connecting Xero is free for everyone — only write-back is Pro-gated.
      const result = await endpoints.xero.auth();
      if (result.configured && result.auth_url) {
        window.location.href = result.auth_url;
      } else {
        setShowConnectConfirm(false);
        setErrorBanner("Xero OAuth is not configured yet. Using demo data for now.");
      }
    } catch {
      setShowConnectConfirm(false);
      setErrorBanner("Failed to start Xero connection flow.");
    }
    setConnecting(false);
  };

  /**
   * Every "Connect" button opens the consent screen first — users are
   * about to hand over their company's books, and Xero's own OAuth page
   * explains nothing about what happens after. This screen answers the
   * trust questions BEFORE the scary permissions page.
   */
  const handleConnectXero = () => {
    setShowConnectConfirm(true);
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
    setThinkingMessage(persona === "siki" ? "Looking into your books…" : "On it. Checking the books…");
    const tid = ensureThread();

    const controller = new AbortController();
    streamAbortRef.current = controller;

    // Track tool calls and response text for this message
    const toolCalls: ToolCallEvent[] = [];
    const analysisCards: AnalysisCardData[] = [];
    let memoryRecall: MemoryRecallData | undefined;
    let responseText = "";

    // Add a placeholder agent message that we'll update as events stream in
    addMessage({ role: "agent", content: "", toolCalls: [], persona });

    try {
      setLastQuery(message);
      setLastContextResults([]);
      for await (const event of endpoints.xero.chatStream(message, tid, persona, controller.signal, !memoryEnabled)) {
        if (event.type === "status") {
          setThinkingMessage(event.message);
        } else if (event.type === "memory_recall") {
          memoryRecall = { facts: event.facts, sources: event.sources };
          setThinkingMessage("Recalling past conversations…");
          updateLastAgentMessage({ memoryRecall });
        } else if (event.type === "tool_call") {
          toolCalls.push({ tool: event.tool, label: event.label, status: "calling" });
          setThinkingMessage(event.label + "…");
          setCurrentTool(event.tool);
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
        } else if (event.type === "analysis_card") {
          // Structured card data emitted by the backend (not via LLM text).
          // Accumulate on the current agent message for rendering after text.
          analysisCards.push(event.data);
          updateLastAgentMessage({ analysisCards: [...analysisCards] });
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
    addMessage({ role: "agent", content: response, persona });
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
    const prompt = finding.memory_action?.prompt ?? finding.action.prompt;
    addMessage({ role: "user", content: prompt });
    void sendToAgent(prompt);
  };

  const handleFindingReview = async (
    finding: Finding,
    state: Exclude<FindingReviewState, "open">,
    outcome?: { confirmed_amount?: number; dismissal_reason?: string },
  ) => {
    if (!me?.authenticated) {
      setErrorBanner("Sign in to save an AP review decision.");
      return;
    }
    setReviewingFindingIds((prev) => new Set(prev).add(finding.id));
    try {
      await endpoints.xero.reviewFinding(finding.id, { state, ...outcome });
      await loadFindings();
    } catch (e) {
      setErrorBanner(e instanceof ApiError ? e.message : "Couldn't save the AP review. Try again.");
    } finally {
      setReviewingFindingIds((prev) => {
        const next = new Set(prev);
        next.delete(finding.id);
        return next;
      });
    }
  };

  /**
   * Auto-chase: approve scheduled follow-ups for one overdue invoice.
   * The click IS the approval — the backend resolves everything from Xero
   * and the daily runner escalates until the invoice is paid.
   */
  const handleAutoChase = async (finding: Finding) => {
    if (!finding.invoice_number) return;
    setChasedFindingIds((prev) => new Set(prev).add(finding.id));
    try {
      const res = await endpoints.chase.start(finding.invoice_number, finding.invoice_id);
      setChaseNotice({
        message: res.message,
        invoiceNumber: finding.invoice_number ?? undefined,
        findingTitle: finding.title,
      });
      refreshMetricSnapshots(true);
    } catch (e) {
      setChasedFindingIds((prev) => {
        const next = new Set(prev);
        next.delete(finding.id);
        return next;
      });
      setErrorBanner(
        e instanceof ApiError ? e.message : "Couldn't schedule the follow-ups. Try again.",
      );
    }
  };

  // The payment moment: if the chase loop recovered money since the last
  // visit, celebrate it — this is the product's win, not a log line.
  useEffect(() => {
    const total = findings?.recovered?.total ?? 0;
    if (total <= 0) return;
    let lastSeen = 0;
    try {
      lastSeen = parseFloat(localStorage.getItem("siki_recovered_seen") || "0") || 0;
    } catch { /* ignore */ }
    if (total > lastSeen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (lastSeen > 0) setRecoveredCelebration(total - lastSeen);
      // First-ever recovery also celebrates (lastSeen 0 → show full total).
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (lastSeen === 0) setRecoveredCelebration(total);
      try { localStorage.setItem("siki_recovered_seen", String(total)); } catch { /* ignore */ }
    }
  }, [findings]);

  // Mark findings whose invoices already have an active chase sequence.
  useEffect(() => {
    if (!findings) return;
    void endpoints.chase
      .list()
      .then(({ sequences }) => {
        const activeNumbers = new Set(
          sequences.filter((s) => s.status === "active").map((s) => s.invoice_number),
        );
        if (activeNumbers.size === 0) return;
        setChasedFindingIds((prev) => {
          const next = new Set(prev);
          for (const f of findings.findings) {
            if (f.invoice_number && activeNumbers.has(f.invoice_number)) next.add(f.id);
          }
          return next;
        });
      })
      .catch(() => {});
  }, [findings]);

  const handlePersonaChange = (next: "siki" | "zana") => {
    setPersona(next);
    setModeHintShown(true);
    try { localStorage.setItem(PERSONA_STORAGE_KEY, next); } catch { /* ignore */ }
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
    // Pre-fill AND focus — clicking a sample must visibly hand the user
    // the next step (cursor in the input, ready to edit or send).
    setInput(description);
    inputRef.current?.focus();
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
              <h1 className="text-base font-bold text-stone-900 leading-none">SIKIZANA</h1>
              <p className="text-[10px] text-stone-500 leading-none mt-0.5">
                Get paid faster · Works with Xero
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
                className={`text-xs font-semibold px-3 py-1.5 rounded-lg ${theme.btnPrimary} btn-press transition-colors disabled:opacity-50`}
              >
                {connecting ? "Connecting…" : "Connect Your Xero →"}
              </button>
            ) : (
              <span
                className={`text-xs font-medium px-2 py-1 rounded-lg transition-opacity-quick ${
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
            {/* Nav links — inline from sm up; collapsed behind a menu button
                on phones so the Connect button never gets squeezed off-screen. */}
            <div className="hidden sm:flex items-center gap-3">
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
            <div className="relative sm:hidden">
              <button
                onClick={() => setNavOpen((v) => !v)}
                aria-expanded={navOpen}
                aria-label="Menu"
                className="p-2 rounded-lg text-stone-600 hover:bg-stone-100 btn-press"
              >
                <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M3 6h18M3 12h18M3 18h18" />
                </svg>
              </button>
              {navOpen && (
                <div className="absolute right-0 top-full mt-1 z-50 w-40 bg-white border border-stone-200 rounded-xl shadow-lg py-1 fade-in-up">
                  {[
                    { href: "/activity", label: "Activity" },
                    { href: "/account", label: me?.authenticated ? "Account" : "Sign in" },
                    { href: "/pricing", label: "Pricing" },
                    { href: "/", label: "Home" },
                  ].map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setNavOpen(false)}
                      className="block px-3 py-2 text-xs text-stone-600 hover:bg-stone-50"
                    >
                      {item.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Persistent demo mode banner — always visible when in demo mode.
          Small business owners were confused about demo vs. real data.
          This banner makes it unmissable and offers a one-click connect. */}
      {xeroMode === "demo" && !userConnection?.connected && (
        <div className="w-full bg-amber-50 border-b border-amber-200 px-4 py-2.5">
          <div className="max-w-6xl mx-auto flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2.5">
              <span className="text-base">👀</span>
              <div>
                <p className="text-xs font-semibold text-amber-900">
                  You&apos;re looking at sample data
                </p>
                <p className="text-[11px] text-amber-700">
                  This is a demo business so you can explore. Connect your Xero to see your real numbers.
                </p>
              </div>
            </div>
            {oauthConfigured && (
              <button
                onClick={handleConnectXero}
                disabled={connecting}
                className={`text-xs font-semibold px-4 py-2 rounded-lg ${theme.btnPrimary} btn-press transition-colors disabled:opacity-50 whitespace-nowrap`}
              >
                {connecting ? "Connecting…" : "Connect My Xero →"}
              </button>
            )}
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col items-center lg:flex-row lg:items-stretch lg:justify-center p-4 gap-4">
        {/* Mobile: the findings panel stacks ABOVE the chat — small screens
            get the audit's value instead of losing the sidebar entirely.
            Compact, capped at 3 with "+N more": a business drowning in
            findings must not have the chat pushed below the fold. */}
        <div className="lg:hidden w-full max-w-2xl bg-white rounded-2xl shadow-sm border border-stone-200 p-4">
          <FindingsPanel
            data={findings}
            loading={findingsLoading}
            askedIds={askedFindingIds}
            savedIds={savedFindingIds}
            disabled={isLoading}
            onAct={handleFindingAct}
            onSave={handleFindingSave}
            onAutoChase={(f) => void handleAutoChase(f)}
            chasedIds={chasedFindingIds}
            onReview={(f, state) => void handleFindingReview(f, state)}
            reviewingIds={reviewingFindingIds}
            onSuggest={(prompt) => {
              setInput(prompt);
              inputRef.current?.focus();
            }}
            suggestions={(persona === "siki" ? SAMPLE_QUERIES : ZANA_QUERIES).slice(0, 3)}
            compact
            persona={persona}
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
                <span className={`text-[9px] ${theme.hintText} font-medium`}>← your money at a glance</span>
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
                  <ProfitTrendChart snapshots={metricSnapshots} className="pt-2 mt-2" />
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
                <span className={`text-[9px] ${theme.hintText} font-medium`}>← things to fix</span>
              )}
            </div>
            <FindingsPanel
              data={findings}
              loading={findingsLoading}
              askedIds={askedFindingIds}
              savedIds={savedFindingIds}
              disabled={isLoading}
              onAct={handleFindingAct}
              onSave={handleFindingSave}
              onAutoChase={(f) => void handleAutoChase(f)}
              chasedIds={chasedFindingIds}
              onReview={(f, state) => void handleFindingReview(f, state)}
              reviewingIds={reviewingFindingIds}
              onSuggest={(prompt) => {
                setInput(prompt);
                inputRef.current?.focus();
              }}
              suggestions={(persona === "siki" ? SAMPLE_QUERIES : ZANA_QUERIES).slice(0, 3)}
              compact
              persona={persona}
            />
          </div>

          <div className="border-t border-stone-100 pt-3 mt-auto space-y-1.5">
            <Link href="/memory" className={`block text-[10px] text-violet-500 hover:text-violet-700 transition-colors`}>
              {copy.memoryLink}
            </Link>
            <Link href="/activity" className={`block text-[10px] text-stone-500 hover:text-stone-700 transition-colors`}>
              {copy.activityLink}
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
              <div className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white ${theme.statusDot}`} />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-stone-800">
                {persona === "siki" ? "Siki · The Explainer" : "Zana · The Enforcer"}
              </p>
              <p className="text-[11px] text-stone-500 flex items-center gap-1">
                {isLoading ? (
                  <>
                    <span className={`w-1.5 h-1.5 rounded-full ${theme.statusPulse}`} />
                    <span className="t-shimmer">{thinkingMessage || "Thinking…"}</span>
                  </>
                ) : (
                  /* Real backend + Xero status — no hardcoded "Connected" claims */
                  <span className="flex items-center gap-2">
                    <ApiHealthDot />
                    <MemoryBadge />
                  </span>
                )}
              </p>
            </div>

            {/* Persona toggle — explicit modes, described on switch */}
            <div className="flex items-center gap-1 bg-stone-100 rounded-full p-0.5">
              <button
                onClick={() => handlePersonaChange("siki")}
                className={`text-xs font-semibold px-2.5 py-1 rounded-full transition-colors-quick btn-press ${
                  persona === "siki"
                    ? "bg-orange-400 text-white shadow-sm"
                    : "text-stone-500 hover:text-stone-700"
                }`}
                title="Siki — friendly, finds savings, explains in plain English"
              >
                Siki
                <span className={`block text-[8px] font-normal leading-none ${persona === "siki" ? "text-orange-100" : "text-stone-400"}`}>
                  explain
                </span>
              </button>
              <button
                onClick={() => handlePersonaChange("zana")}
                className={`text-xs font-semibold px-2.5 py-1 rounded-full transition-colors-quick btn-press ${
                  persona === "zana"
                    ? `${getPersonaTheme("zana").toggleActive} shadow-sm`
                    : "text-stone-500 hover:text-stone-700"
                }`}
                title="Zana — direct, chases payments, flags uncomfortable truths"
              >
                Zana
                <span className={`block text-[8px] font-normal leading-none ${persona === "zana" ? getPersonaTheme("zana").toggleActiveSub : "text-stone-400"}`}>
                  chase
                </span>
              </button>
            </div>

            {/* Memory toggle — lets the user compare answers with and without Supermemory */}
            <button
              onClick={() => setMemoryEnabled((m) => !m)}
              className={`text-[10px] font-semibold px-2.5 py-1 rounded-full transition-colors btn-press ${
                memoryEnabled
                  ? "bg-violet-100 text-violet-700 hover:bg-violet-200"
                  : "bg-stone-100 text-stone-500 hover:bg-stone-200"
              }`}
              title={memoryEnabled ? "Memory is ON — Siki will recall and remember" : "Memory is OFF — compare what Siki would say without memory"}
            >
              {memoryEnabled ? "Memory: ON" : "Memory: OFF"}
            </button>

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
              className={`px-5 py-1.5 border-b text-[11px] fade-in-up ${theme.modeHintBar}`}
              role="status"
            >
              {persona === "siki"
                ? "Siki explains — who owes you, what your numbers mean, what's normal for your industry. No jargon."
                : "Zana enforces — chasing emails, escalation plans, customer scoring, hard truths. Let's get you paid."}
            </div>
          )}

          {/* Memory off nudge — when Supermemory Local is not running, the agent works without memory. */}
          {!supermemory && (
            <div className="bg-stone-50 border-b border-stone-200 px-5 py-2 text-[11px] text-stone-500 flex items-center justify-between gap-3 fade-in-up">
              <span>
                Supermemory Local is not running. Siki still works, but will not remember across sessions or use multi-region tax RAG.
              </span>
              <Link
                href="/memory"
                className="shrink-0 text-violet-600 hover:text-violet-700 font-medium"
              >
                Start it →
              </Link>
            </div>
          )}

          {/* Quota / plan-gate banner — an upgrade prompt, deliberately not styled as an error */}
          {upgradeBanner && (
            <div className={`border-b px-4 py-2.5 text-xs flex items-center justify-between gap-3 fade-in-up ${theme.hintBg} ${theme.toastBorder} ${theme.hintTextOnBg}`}>
              <span>{upgradeBanner}</span>
              <div className="flex items-center gap-2 shrink-0">
                <Link
                  href="/account?intent=pro"
                  className={`font-semibold text-white px-2.5 py-1 rounded-lg btn-press transition-colors ${theme.btnPrimary}`}
                >
                  Upgrade
                </Link>
                <button
                  onClick={() => setUpgradeBanner(null)}
                  className={`btn-press ${theme.hintTextStrong}`}
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

          {chaseNotice && (
            <AutoChaseNotice
              persona={persona}
              notice={chaseNotice}
              onDismiss={() => setChaseNotice(null)}
            />
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

          {/* Screen readers: a visually-hidden live region announces each
              completed answer once. aria-live on the whole scroll container
              would re-announce the growing message on every streamed token. */}
          <div className="sr-only" aria-live="polite" role="status">
            {!isLoading && messages.length > 0 && messages[messages.length - 1].role === "agent"
              ? messages[messages.length - 1].content
              : thinkingMessage}
          </div>
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
                  <div className={`mt-4 w-full max-w-sm border rounded-xl p-4 fade-in-up text-left ${theme.hintBg}`}>
                    <div className="flex items-start gap-3">
                      <div className="shrink-0 mt-0.5">
                        <span className="text-lg">✨</span>
                      </div>
                      <div className="flex-1">
                        <p className="text-xs font-semibold text-sky-900">Here&apos;s what I can do for you</p>
                        <ul className="text-[11px] text-sky-700 mt-1.5 space-y-1">
                          <li>💰 <span className="font-medium">Show who owes you</span> — every unpaid invoice, aged 30/60/90 days</li>
                          <li>✉️ <span className="font-medium">Chase what you&apos;re owed</span> — escalating reminder emails that work</li>
                          <li>📊 <span className="font-medium">Show what&apos;s normal</span> — payment norms for your industry</li>
                          <li>📈 <span className="font-medium">Explain your books</span> — P&amp;L, tax estimate, fixes — plain English</li>
                        </ul>
                        <p className="text-xs text-sky-600 mt-2.5">
                          {xeroMode === "demo"
                            ? "The sidebar shows a demo business so you can explore. Try a question below, then connect your Xero to see your real numbers →"
                            : "The sidebar shows a live snapshot of your books. Try a question below to see me in action →"}
                        </p>

                        {/* The one onboarding question: their sector. Personalizes
                            "is this normal?" against their actual industry instead
                            of guessing from the org name. */}
                        <div className="mt-3 pt-3 border-t border-sky-100">
                          {sector && !sectorSaved ? (
                            <p className="text-[11px] text-sky-700">
                              📊 Comparing you against{" "}
                              <span className="font-semibold">{sector.replace("_", " ")}</span>{" "}
                              businesses.
                            </p>
                          ) : sectorSaved ? (
                            <p className="text-[11px] font-medium text-emerald-700 fade-in-up">
                              ✓ Noted — I&apos;ll compare your numbers against{" "}
                              {sector?.replace("_", " ")} businesses.
                            </p>
                          ) : (
                            <>
                              <p className="text-[11px] font-semibold text-sky-900 mb-1.5">
                                One quick question: what&apos;s your line of business?
                              </p>
                              <p className="text-[10px] text-sky-600 mb-2">
                                So &quot;is this normal?&quot; compares you against YOUR industry.
                              </p>
                              <div className="flex flex-wrap gap-1.5">
                                {[
                                  ["retail", "Retail"],
                                  ["construction", "Construction"],
                                  ["professional_services", "Services"],
                                  ["hospitality", "Hospitality"],
                                  ["manufacturing", "Manufacturing"],
                                  ["wholesale", "Wholesale"],
                                ].map(([value, label]) => (
                                  <button
                                    key={value}
                                    onClick={() => void handleSectorPick(value)}
                                    className="text-[10px] font-medium px-2 py-1 rounded-full bg-white border border-sky-200 text-sky-700 hover:bg-sky-100 btn-press transition-colors"
                                  >
                                    {label}
                                  </button>
                                ))}
                              </div>
                            </>
                          )}
                        </div>
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

                {/* Connect Your Xero CTA — now handled by the persistent
                    demo banner at the top of the page. This was previously
                    only shown in the empty state, which meant users who
                    started chatting lost the connect prompt. */}

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
                              ? `text-stone-400 ${theme.sampleHover}`
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
              // Parse for negotiation email card if agent message
              const negotiationEmail = msg.role === "agent" && msg.content ? parseNegotiationEmail(msg.content) : null;
              // Analysis cards are now delivered via events, not parsed from text
              const cards = msg.analysisCards || [];
              // The text to display (remove the structured block if we're showing it as a card)
              const displayContent = journal
                ? msg.content.split(/PROPOSED JOURNAL ENTRY/i)[0].trim()
                : negotiationEmail
                ? msg.content.split(/NEGOTIATION EMAIL/i)[0].trim()
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
                    {(msg.persona ?? persona) === "siki" ? <SikiMascot size={32} mood="idle" /> : <ZanaMascot size={32} mood="idle" />}
                  </div>
                )}
                <div className={`max-w-[80%] flex flex-col gap-1 ${msg.role === "user" ? "items-end" : ""}`}>
                  {msg.role === "agent" && msg.memoryRecall && (
                    <MemoryRecallTrace data={msg.memoryRecall} persona={msg.persona ?? persona} />
                  )}
                  {msg.role === "agent" && msg.toolCalls && msg.toolCalls.length > 0 && (
                    <ToolCallTrace calls={msg.toolCalls} />
                  )}
                  <div
                    className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                      msg.role === "user"
                        ? theme.userBubble
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
                  {msg.role === "user" && (
                    <button
                      onClick={() => handleRemember(i, msg.content)}
                      disabled={rememberedMessages.has(i)}
                      className={`text-[10px] font-medium px-2 py-0.5 rounded transition-colors btn-press ${
                        rememberedMessages.has(i)
                          ? "text-emerald-600 bg-emerald-50 cursor-default"
                          : "text-stone-400 hover:text-violet-600 hover:bg-violet-50"
                      }`}
                      title={rememberedMessages.has(i) ? "Saved to memory" : "Remember this for next time"}
                    >
                      {rememberedMessages.has(i) ? "Remembered" : "Remember"}
                    </button>
                  )}
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
                      persona={msg.persona ?? persona}
                      onPosted={(result) => {
                        if (result.posted && result.mode !== "demo") {
                          setShowSuccessCheck(true);
                          setTimeout(() => setShowSuccessCheck(false), 3000);
                          refreshMetricSnapshots(true);
                        }
                      }}
                      onReject={() => {
                        // Pre-fill the chat so the user tells the agent what to change.
                        setInput("Don't post that entry — ");
                        inputRef.current?.focus();
                      }}
                    />
                  )}
                  {negotiationEmail && (
                    <NegotiationEmailCard
                      email={negotiationEmail}
                      persona={msg.persona ?? persona}
                    />
                  )}
                  {cards.map((card, ci) => (
                    <AnalysisCard
                      key={ci}
                      data={card}
                      persona={msg.persona ?? persona}
                    />
                  ))}
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
                  {/* HMRC guidance footnote — persists the context found
                      during the wait under the agent's response. Only on
                      the last agent message, only when not streaming. */}
                  {msg.role === "agent" && msg.content &&
                    !isLoading && i === messages.length - 1 &&
                    lastContextResults.length > 0 && (
                    <div className="mt-1 border-t border-stone-200/60 pt-2 fade-in-up">
                      <p className="text-[10px] text-stone-400 font-medium mb-0.5">
                        📖 Related HMRC guidance
                      </p>
                      {lastContextResults.slice(0, 1).map((r) => (
                        <div key={r.url}>
                          <p className="text-[11px] text-stone-600 leading-relaxed">
                            {r.summary || r.snippet}
                          </p>
                          <a
                            href={r.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-stone-400 hover:text-violet-600 transition-colors text-[9px] mt-0.5 inline-block"
                          >
                            {r.title.length > 45 ? r.title.slice(0, 45) + "…" : r.title} ↗
                          </a>
                        </div>
                      ))}
                    </div>
                  )}
                  {/* Peak-end summary card — a clean, satisfying close
                      after the agent responds. Shows issues found, money
                      at stake, and urgent count. Only on the last message. */}
                  {msg.role === "agent" && msg.content &&
                    !isLoading && i === messages.length - 1 && (
                    <ResponseSummary
                      findings={findings}
                      isStreaming={isLoading}
                      persona={persona}
                    />
                  )}
                </div>
              </div>
              );
            })}

            {isLoading && (
              <div className="bg-stone-100 px-4 py-3 rounded-2xl rounded-tl-sm fade-in-up">
                <WhileAgentWorks
                  persona={persona}
                  userQuery={lastQuery}
                  currentTool={currentTool}
                  thinkingMessage={thinkingMessage}
                  findings={findings}
                  onContextResults={setLastContextResults}
                />
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
                placeholder={
                  persona === "siki"
                    ? "Ask Siki — who owes me? what's this number? is this normal?"
                    : "Tell Zana — chase this invoice, score my customers, what's my plan?"
                }
                disabled={isLoading}
                className={`flex-1 px-4 py-2.5 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 bg-white disabled:opacity-50 ${theme.focusInput}`}
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
                  className={`p-2.5 ${theme.btnPrimary} rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed btn-press`}
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
                Sikizana · Get paid faster · Human-in-the-loop by design
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
                  onClick={dismissConnectMoment}
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
          onClick={() => setShowConnectConfirm(false)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setShowConnectConfirm(false);
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
                onClick={() => void startXeroOAuth()}
                disabled={connecting}
                className={`flex-1 text-xs font-semibold px-4 py-2.5 rounded-lg ${theme.btnPrimary} btn-press transition-colors disabled:opacity-50`}
              >
                {connecting ? "Connecting…" : "Continue to Xero →"}
              </button>
              <button
                onClick={() => setShowConnectConfirm(false)}
                disabled={connecting}
                className="text-xs font-semibold px-4 py-2.5 rounded-lg bg-stone-100 text-stone-700 hover:bg-stone-200 btn-press transition-colors disabled:opacity-50"
              >
                Not yet
              </button>
            </div>
            <p className="text-[10px] text-stone-400 mt-3 text-center">
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
          onClick={() => setRecoveredCelebration(null)}
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
              onClick={() => setRecoveredCelebration(null)}
              className={`mt-2 text-sm font-semibold px-5 py-2 rounded-lg btn-press transition-colors ${recoveredCopy.buttonClass}`}
            >
              {recoveredCopy.button}
            </button>
          </div>
        </div>
      )}

      {/* Proactive webhook alerts */}
      <ProactiveAlert persona={persona} />
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
