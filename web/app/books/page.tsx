"use client";

import { useCallback, useEffect, useRef, useState, Suspense } from "react";
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
import { ReceiptUpload } from "@/components/ReceiptUpload";
import type { AutoChaseNoticeState } from "@/components/AutoChaseNotice";
import { FindingsPanel } from "@/components/FindingsPanel";
import { useBackendHealth } from "@/hooks/useBackendHealth";
import { RotatedReveal } from "@/components/RotatedReveal";
import { SAMPLE_QUERIES, ZANA_QUERIES, findQuery } from "@/lib/xero-samples";
import { SECTOR_IDS, type SectorId } from "@/lib/sector-benchmarks";
import { getSectorTips } from "@/lib/sector-tips";
import type { ToolCallEvent } from "@/lib/types";
import { localStore, StorageKeys } from "@/lib/storage";
import { getPersonaCopy, getPersonaTheme, getRecoveredCelebrationCopy, getConnectMomentCopy, PERSONA_STORAGE_KEY } from "@/lib/persona-theme";
import { useMe } from "@/hooks/useMe";
import { TodaySummary } from "@/components/TodaySummary";
import { SectorNoteCard } from "@/components/SectorNoteCard";
import { BooksNav, DemoBanner } from "@/components/books/BooksNav";
import { FinanceCheckHandoff } from "@/components/books/FinanceCheckHandoff";
import { BooksSidebar } from "@/components/books/BooksSidebar";
import { ChatBanners, ChatHeader } from "@/components/books/ChatChrome";
import { ChatEmptyState } from "@/components/books/ChatEmptyState";
import { ChatMessages } from "@/components/books/ChatMessages";
import { BooksOverlays } from "@/components/books/BooksOverlays";
import type {
  FindingsPanelProps,
  OrgData,
  ProfitAndLossData,
} from "@/components/books/types";


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
  // A landing-page entry is not a generic chat session. It opens the first
  // finance check, backed by the same structured findings used everywhere else.
  const [financeCheckOpen, setFinanceCheckOpen] = useState(false);
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
  const [provenance, setProvenance] = useState<"live" | "sandbox" | "sample" | "unknown">("unknown");
  const [platformName, setPlatformName] = useState<string>("Xero");
  // Seapoint sandbox offer: shown when the connector is registered AND
  // reachable (signed in) — the judge's self-serve entry point.
  const [seapointOffered, setSeapointOffered] = useState(false);
  const [sandboxSwitching, setSandboxSwitching] = useState(false);
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
  // Lead-magnet / sector landing: ?sector= wins over a late prefs.get().
  const sectorFromUrlRef = useRef(false);
  useEffect(() => {
    void endpoints.prefs
      .get()
      .then((p) => {
        if (sectorFromUrlRef.current) return;
        setSector(p.sector);
      })
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

  // /books?sector=music (etc.) saves the pref once, then strips the param.
  useEffect(() => {
    if (sectorFromUrlRef.current) return;
    const raw = searchParams.get("sector");
    if (!raw) return;
    const value = raw.toLowerCase().replace(/ /g, "_");
    if (!(SECTOR_IDS as readonly string[]).includes(value)) return;
    sectorFromUrlRef.current = true;
    void handleSectorPick(value);
    const cleaned = new URLSearchParams(searchParams.toString());
    cleaned.delete("sector");
    const qs = cleaned.toString();
    window.history.replaceState(null, "", `${pathname}${qs ? `?${qs}` : ""}`);
  }, [searchParams, pathname]);
  const [persona, setPersona] = useState<"siki" | "zana">(() => {
    // localStorage is the fast-path seed — persona is also stored on the
    // user profile so a signed-in user keeps their owl across devices
    // (profile value wins once /api/me resolves; see effect below).
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(PERSONA_STORAGE_KEY);
      if (saved === "siki" || saved === "zana") return saved;
    }
    return "siki";
  });
  // Cross-device sync: when the session resolves as signed-in, the profile's
  // persona is the freshest truth — adopt it if it differs from this device.
  const personaSyncedRef = useRef(false);
  useEffect(() => {
    if (personaSyncedRef.current || !me?.authenticated) return;
    const saved = me.profile?.persona;
    if (saved === "siki" || saved === "zana") {
      personaSyncedRef.current = true;
      if (saved !== persona) {
        setPersona(saved);
        setModeHintShown(true);
        try { localStorage.setItem(PERSONA_STORAGE_KEY, saved); } catch { /* ignore */ }
      }
    }
  }, [me, persona]);
  const theme = getPersonaTheme(persona);
  const copy = getPersonaCopy(persona);
  const recoveredCopy = getRecoveredCelebrationCopy(persona);
  const connectCopy = getConnectMomentCopy(persona, xeroMode === "demo");
  // Kickoff question for the sandbox walk — verbatim prompt, always first.
  const starterQueries =
    provenance === "sandbox"
      ? [
          {
            id: "seapoint-spend",
            title: "Last month's spend",
            description: "What did we spend last month, broken down by category?",
            hint: "try this first",
          },
          ...(persona === "siki" ? SAMPLE_QUERIES : ZANA_QUERIES),
        ]
      : persona === "siki"
        ? SAMPLE_QUERIES
        : ZANA_QUERIES;
  const { memory } = useBackendHealth();

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
  const financeCheckHandledRef = useRef(false);
  // Which sample books to show (café default, or music when arriving from the
  // music landing). Has no effect in live mode — the connection is the data.
  // Data loads are held until it resolves, so a music visitor never sees a
  // flash of café books before their scenario lands.
  const [demoScenarioReady, setDemoScenarioReady] = useState(false);
  const [demoScenario, setDemoScenario] = useState<string | null>(null);
  const scenarioHandledRef = useRef(false);

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
  // Pick the sample-books scenario before anything loads. Sector landing pages
  // arrive with ?demo=music; the first visit wins and subsequent loads skip the
  // write. In live mode this is a harmless no-op (the connection is the data).
  const applyDemoScenario = useCallback(async (scenario: string | null) => {
    if (scenario === "music" || scenario === "cafe") {
      setDemoScenario(scenario);
      await endpoints.prefs.setDemoScenario(scenario).catch(() => {});
    } else {
      // No explicit scenario — read the stored one so the demo label is
      // accurate on refresh (e.g. a music visitor who navigated internally).
      try {
        const prefs = await endpoints.prefs.get();
        setDemoScenario(prefs.demo_scenario);
      } catch { /* ignore */ }
    }
    setDemoScenarioReady(true);
  }, []);

  useEffect(() => {
    if (scenarioHandledRef.current) return;
    scenarioHandledRef.current = true;
    void applyDemoScenario(searchParams.get("demo"));
  }, [applyDemoScenario, searchParams]);

  useEffect(() => {
    if (!demoScenarioReady) return;
    void endpoints.xero
      .status()
      .then((s) => {
        setXeroMode(s.mode);
        // Older backends have no provenance field — derive it from mode.
        setProvenance(
          s.provenance ?? (s.mode === "demo" ? "sample" : s.live ? "live" : "sandbox"),
        );
        if (s.platform_display_name) setPlatformName(s.platform_display_name);
      })
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
           
          setShowConnectConfirm(true);
        }
      })
      .catch(() => {});

    // Platform-agnostic status: is the Seapoint sandbox offered + reachable?
    void endpoints.connection
      .status()
      .then((c) => {
        const offered =
          (c.available_platforms ?? []).some((p) => p.platform === "seapoint") &&
          c.seapoint_ready === true;
        setSeapointOffered(offered);
        if (c.connected && c.mode === "seapoint-sandbox") {
          setUserConnection({ connected: true, tenant_name: c.tenant_name ?? undefined });
        }
      })
      .catch(() => {});
  }, [demoScenarioReady, loadFindings, refreshMetricSnapshots, searchParams]);

  /**
   * Judge self-serve: attach the session to the Seapoint sandbox and
   * refetch everything in place — no reload flash.
   */
  const handleConnectSeapoint = useCallback(async () => {
    setSandboxSwitching(true);
    try {
      await endpoints.connection.seapointSandbox();
      const [status] = await Promise.all([
        endpoints.xero.status(),
        endpoints.xero.organisation().then((o) => setOrgData(o as unknown as OrgData)).catch(() => {}),
        endpoints.xero
          .profitAndLoss()
          .then((p) => setProfitAndLoss(p as unknown as ProfitAndLossData))
          .catch(() => {}),
      ]);
      setXeroMode(status.mode);
      setProvenance(
        status.provenance ?? (status.mode === "demo" ? "sample" : status.live ? "live" : "sandbox"),
      );
      if (status.platform_display_name) setPlatformName(status.platform_display_name);
      setUserConnection({ connected: true, tenant_name: "Seapoint sandbox" });
      await loadFindings();
    } catch {
      setErrorBanner("Couldn't reach the Seapoint sandbox — staying on the sample books.");
    } finally {
      setSandboxSwitching(false);
    }
  }, [loadFindings]);

  /** Exit the sandbox — back to the sample books, same in-place refetch. */
  const handleLeaveSeapoint = useCallback(async () => {
    setSandboxSwitching(true);
    try {
      await endpoints.connection.leaveSeapointSandbox();
      const [status] = await Promise.all([
        endpoints.xero.status(),
        endpoints.xero.organisation().then((o) => setOrgData(o as unknown as OrgData)).catch(() => {}),
        endpoints.xero
          .profitAndLoss()
          .then((p) => setProfitAndLoss(p as unknown as ProfitAndLossData))
          .catch(() => {}),
      ]);
      setXeroMode(status.mode);
      setProvenance(
        status.provenance ?? (status.mode === "demo" ? "sample" : status.live ? "live" : "sandbox"),
      );
      if (status.platform_display_name) setPlatformName(status.platform_display_name);
      setUserConnection({ connected: false });
      await loadFindings();
    } catch {
      setErrorBanner("Couldn't leave the sandbox — try again.");
    } finally {
      setSandboxSwitching(false);
    }
  }, [loadFindings]);

  // Deep link: /books?source=seapoint connects once on load (ref-guarded
  // like the demo-scenario seeding), then strips the param.
  const seapointDeepLinkRef = useRef(false);
  useEffect(() => {
    if (seapointDeepLinkRef.current) return;
    if (searchParams.get("source") !== "seapoint") return;
    if (!seapointOffered || provenance === "sandbox") return;
    seapointDeepLinkRef.current = true;
    void handleConnectSeapoint();
    const params = new URLSearchParams(searchParams.toString());
    params.delete("source");
    const qs = params.toString();
    window.history.replaceState(null, "", `${pathname}${qs ? `?${qs}` : ""}`);
  }, [searchParams, seapointOffered, provenance, handleConnectSeapoint, pathname]);

  // Seed demo memories when running in demo mode so first-time judges see
  // proactive memory alerts and cross-session recall without a warm-up chat.
  useEffect(() => {
    if (xeroMode !== "demo" || demoSeededRef.current) return;
    demoSeededRef.current = true;
    void endpoints.memory.seedDemo().catch(() => {});
  }, [xeroMode]);

  // Preserve the intent of the landing-page CTA through the workspace handoff.
  // We do not auto-send an agent prompt: the user sees the evidence first and
  // explicitly chooses the next action.
  useEffect(() => {
    if (
      financeCheckHandledRef.current ||
      searchParams.get("flow") !== "check" ||
      searchParams.get("connected") === "true" ||
      findingsLoading
    ) return;
    financeCheckHandledRef.current = true;
    if (findings && !findings.clean && findings.findings.length > 0) {
      setFinanceCheckOpen(true);
    }
  }, [findings, findingsLoading, searchParams]);

  // Landing page paths: /books?persona=siki|zana sets the active owl once.
  const personaFromUrlRef = useRef(false);
  useEffect(() => {
    if (personaFromUrlRef.current) return;
    const p = searchParams.get("persona");
    if (p !== "siki" && p !== "zana") return;
    personaFromUrlRef.current = true;
    // Explicit handoff intent outranks the stored profile persona.
    personaSyncedRef.current = true;
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
    // The post-connect scan is the live equivalent of the sample-book
    // handoff. Once its reveal has been acknowledged, keep the user on the
    // same evidence-first path instead of dropping them into generic chat.
    if (findings && !findings.clean && findings.findings.length > 0) {
      setFinanceCheckOpen(true);
    }
    // Free plan + money on the table → frame the upgrade. Never on a
    // read-only sandbox — no upsell inside a third-party demo frame.
    if (provenance !== "sandbox" && findings && findings.money_found > 0 && (!me || me.plan === "free")) {
      const label = provenance === "sample" ? "the sample books" : "your books";
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
      setProvenance("sample");
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
      for await (const event of endpoints.xero.chatStream(
        message,
        tid,
        persona,
        controller.signal,
        !memoryEnabled,
        sector ? getSectorTips(sector as SectorId, "chat") : undefined,
      )) {
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
    if (!me?.authenticated && provenance === "live") {
      setErrorBanner("Sign in to save an AP review decision.");
      return;
    }
    setReviewingFindingIds((prev) => new Set(prev).add(finding.id));
    try {
      await endpoints.xero.reviewFinding(finding, { state, ...outcome });
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
       
      if (lastSeen > 0) setRecoveredCelebration(total - lastSeen);
      // First-ever recovery also celebrates (lastSeen 0 → show full total).
       
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
    // Persist to the profile so the choice follows the user across devices.
    if (me?.authenticated) {
      void endpoints.profile.update({ persona: next }).catch(() => {});
    }
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

  const highlightedFinding = findings?.findings[0];

  // One bundle for both FindingsPanel instances (mobile card + sidebar) —
  // the surfaces share data path and callbacks, never drift apart.
  const findingsPanelProps: FindingsPanelProps = {
    data: findings,
    loading: findingsLoading,
    askedIds: askedFindingIds,
    savedIds: savedFindingIds,
    disabled: isLoading,
    chasedIds: chasedFindingIds,
    reviewingIds: reviewingFindingIds,
    suggestions: starterQueries.slice(0, 3),
    persona,
    onAct: handleFindingAct,
    onSave: handleFindingSave,
    onAutoChase: (f) => void handleAutoChase(f),
    onReview: (f, state) => void handleFindingReview(f, state),
    onSuggest: (prompt) => {
      setInput(prompt);
      inputRef.current?.focus();
    },
  };

  return (
    <main className="min-h-screen bg-stone-100 flex flex-col">
      {/* Rotated reveal transition — slides away on page load */}
      <RotatedReveal />
      <BooksNav
        theme={theme}
        me={me}
        xeroMode={xeroMode}
        provenance={provenance}
        platformName={platformName}
        demoScenario={demoScenario}
        userConnection={userConnection}
        oauthConfigured={oauthConfigured}
        connecting={connecting}
        sandboxSwitching={sandboxSwitching}
        navOpen={navOpen}
        onToggleNav={() => setNavOpen((v) => !v)}
        onCloseNav={() => setNavOpen(false)}
        onConnect={handleConnectXero}
        onDisconnect={() => void handleDisconnect()}
        onLeaveSandbox={() => void handleLeaveSeapoint()}
      />

      <DemoBanner
        xeroMode={xeroMode}
        connected={userConnection?.connected ?? false}
        oauthConfigured={oauthConfigured}
        connecting={connecting}
        theme={theme}
        onConnect={handleConnectXero}
      />

      <FinanceCheckHandoff
        open={financeCheckOpen}
        finding={highlightedFinding}
        provenance={provenance}
        platformName={platformName}
        xeroMode={xeroMode}
        seapointOffered={seapointOffered}
        sandboxSwitching={sandboxSwitching}
        theme={theme}
        isLoading={isLoading}
        onConnectSandbox={() => void handleConnectSeapoint()}
        onReview={handleFindingAct}
        onViewAll={() => setFinanceCheckOpen(false)}
      />

      <div className="flex-1 flex flex-col items-center lg:flex-row lg:items-stretch lg:justify-center p-4 gap-4">
        {/* Mobile: the findings panel stacks ABOVE the chat — small screens
            get the audit's value instead of losing the sidebar entirely.
            Compact, capped at 3 with "+N more": a business drowning in
            findings must not have the chat pushed below the fold. */}
        <div className="lg:hidden w-full max-w-2xl bg-white rounded-2xl shadow-sm border border-stone-200 p-4">
          <TodaySummary
            data={findings}
            loading={findingsLoading}
            persona={persona}
            disabled={isLoading}
            onReviewPriority={handleFindingAct}
          />
          <FindingsPanel {...findingsPanelProps} compact />

          {/* Siki's sector note — mirrors the desktop sidebar on small screens */}
          {sector && <SectorNoteCard sector={sector as SectorId} />}
        </div>

        <BooksSidebar
          xeroMode={xeroMode}
          provenance={provenance}
          orgData={orgData}
          pnLoading={pnLoading}
          profitAndLoss={profitAndLoss}
          metricSnapshots={metricSnapshots}
          showWelcome={showWelcome}
          theme={theme}
          copy={copy}
          sector={sector}
          persona={persona}
          findingsLoading={findingsLoading}
          isLoading={isLoading}
          onReviewPriority={handleFindingAct}
          findingsPanel={findingsPanelProps}
        />

        {/* Chat — dvh on mobile so browser chrome doesn't fight the layout */}
        <div className="w-full max-w-2xl bg-white rounded-2xl shadow-xl flex flex-col h-[70dvh] lg:h-[78vh] overflow-hidden border border-stone-200">
          <ChatHeader
            persona={persona}
            theme={theme}
            isLoading={isLoading}
            thinkingMessage={thinkingMessage}
            memoryEnabled={memoryEnabled}
            hasMessages={messages.length > 0}
            confirmClear={confirmClear}
            modeHintShown={modeHintShown}
            memoryAvailable={memory}
            onPersonaChange={handlePersonaChange}
            onToggleMemory={() => setMemoryEnabled((m) => !m)}
            onAskClear={() => setConfirmClear(true)}
            onConfirmClear={() => { newSession(); setConfirmClear(false); }}
            onCancelClear={() => setConfirmClear(false)}
          />

          <ChatBanners
            errorBanner={errorBanner}
            upgradeBanner={upgradeBanner}
            chaseNotice={chaseNotice}
            signInNudge={signInNudge}
            persona={persona}
            theme={theme}
            onDismissError={() => setErrorBanner(null)}
            onDismissUpgrade={() => setUpgradeBanner(null)}
            onDismissChase={() => setChaseNotice(null)}
            onDismissNudge={() => {
              setSignInNudge(null);
              sessionStorage.setItem("siki_signin_nudged", "1");
            }}
          />

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
              <ChatEmptyState
                persona={persona}
                theme={theme}
                staggerShown={staggerShown}
                showWelcome={showWelcome}
                provenance={provenance}
                platformName={platformName}
                xeroMode={xeroMode}
                sector={sector}
                sectorSaved={sectorSaved}
                starterQueries={starterQueries}
                onDismissWelcome={dismissWelcome}
                onSectorPick={(v) => void handleSectorPick(v)}
                onStartSample={handleStartSample}
                onAsk={(q) => {
                  setInput(q);
                  inputRef.current?.focus();
                }}
              />
            )}

            <ChatMessages
              messages={messages}
              persona={persona}
              theme={theme}
              threadId={threadId}
              rememberedMessages={rememberedMessages}
              isLoading={isLoading}
              lastContextResults={lastContextResults}
              lastQuery={lastQuery}
              currentTool={currentTool}
              thinkingMessage={thinkingMessage}
              findings={findings}
              onRemember={(i, c) => void handleRemember(i, c)}
              onJournalPosted={() => {
                setShowSuccessCheck(true);
                setTimeout(() => setShowSuccessCheck(false), 3000);
                refreshMetricSnapshots(true);
              }}
              onJournalReject={() => {
                // Pre-fill the chat so the user tells the agent what to change.
                setInput("Don't post that entry — ");
                inputRef.current?.focus();
              }}
              onPersonaChange={handlePersonaChange}
              onContextResults={setLastContextResults}
            />
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
              <span className="text-xs text-stone-500">
                Sikizana · Get paid faster · Human-in-the-loop by design
              </span>
            </div>
          </div>
        </div>
      </div>

      <footer className="text-center py-3">
        <p className="text-xs text-stone-400">
          Sikizana · AI finance assistant for Xero · Human-in-the-loop by design
        </p>
      </footer>

      <BooksOverlays
        persona={persona}
        theme={theme}
        findings={findings}
        showSuccessCheck={showSuccessCheck}
        successDialogRef={successDialogRef}
        onDismissSuccess={() => setShowSuccessCheck(false)}
        connectStage={connectStage}
        connectCopy={connectCopy}
        onDismissConnect={dismissConnectMoment}
        showConnectConfirm={showConnectConfirm}
        connecting={connecting}
        onStartOAuth={() => void startXeroOAuth()}
        onCancelConnect={() => setShowConnectConfirm(false)}
        recoveredCelebration={recoveredCelebration}
        recoveredCopy={recoveredCopy}
        onDismissRecovered={() => setRecoveredCelebration(null)}
      />
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
