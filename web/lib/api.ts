/**
 * Single API client for the Sikizana backend — Xero AI Finance Assistant.
 *
 * Centralises:
 *   - Base URL resolution (NEXT_PUBLIC_API_BASE)
 *   - JSON request/response handling
 *   - Error normalisation (status code + message + optional details)
 *   - Timeout enforcement
 *
 * Components and hooks MUST use this client rather than calling `fetch`
 * directly. That keeps the backend contract in one place.
 */

import type { AgentEvent } from "@/lib/types";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// When deployed on the VPS, the API is on the same domain (Traefik routes /api/* to the backend).
// In dev, it falls back to localhost:8080.
const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8080";
const DEFAULT_TIMEOUT_MS = 30_000;

export interface RequestOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  options: RequestOptions = {},
): Promise<T> {
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  if (options.signal) {
    options.signal.addEventListener("abort", () => controller.abort());
  }

  const headers: Record<string, string> = {};
  if (body) headers["Content-Type"] = "application/json";

  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
      // Send the HttpOnly session cookie the backend sets.
      credentials: "include",
    });

    const contentType = res.headers.get("content-type") || "";
    const isJson = contentType.includes("application/json");
    const payload = isJson ? await res.json() : await res.text();

    if (!res.ok) {
      const message =
        (isJson &&
          typeof payload === "object" &&
          ((payload as { detail?: string }).detail ||
            (payload as { error?: string }).error)) ||
        (typeof payload === "string" && payload) ||
        res.statusText ||
        `HTTP ${res.status}`;
      throw new ApiError(res.status, message, payload);
    }

    return payload as T;
  } finally {
    clearTimeout(timer);
  }
}

export const api = {
  get: <T>(path: string, options?: RequestOptions) => request<T>("GET", path, undefined, options),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>("POST", path, body, options),
  put: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>("PUT", path, body, options),
  delete: <T>(path: string, options?: RequestOptions) => request<T>("DELETE", path, undefined, options),

  baseUrl: API_BASE,
};

// ---- Typed endpoint contracts ----

export interface FeedbackPayload {
  thread_id: string;
  message_index: number;
  rating: "up" | "down";
  comment?: string;
}

export interface ImpactMetrics {
  mode?: XeroMode;
  money_found: number;
  overdue_count: number;
  discrepancies_found: number;
  estimated_tax_savings: number;
  feedback: { up: number; down: number; total: number };
  snapshots?: Array<{
    captured_at: string;
    total_overdue: number;
    net_margin: number;
    total_revenue: number;
  }>;
}

/** Contextual HMRC/tax content from /api/context/search (Exa-powered). */
export interface ContextResult {
  title: string;
  url: string;
  snippet: string;
  /** Clean summary extracted by Firecrawl from the top result (if available). */
  summary?: string;
}

/** A memory entry from Supermemory — what Siki remembers about the business. */
export interface MemoryEntry {
  id: string;
  content: string;
  score?: number;
  status?: string;
  metadata?: Record<string, unknown>;
}

/** How the backend is talking to the accounting platform. "demo" means no real write happens. */
export type XeroMode = "live-oauth" | "live-cli" | "demo";

/** Platform-agnostic connection mode (same values, forward-compatible name). */
export type ConnectionMode = XeroMode;

export interface XeroStatus {
  live: boolean;
  mode: XeroMode;
  tenant_name: string | null;
}

/** Platform-agnostic connection status — works with any connector. */
export interface ConnectionStatus {
  connected: boolean;
  platform: string;
  platform_display_name: string;
  mode: ConnectionMode;
  tenant_id?: string;
  tenant_name?: string | null;
  available_platforms?: AvailablePlatform[];
}

export interface AvailablePlatform {
  platform: string;
  display_name: string;
  auth_type: string;
  supports_webhooks?: boolean;
  supports_journal_write?: boolean;
}

export interface JournalPostPayload {
  description: string;
  debit_account_code: string;
  credit_account_code: string;
  amount: number;
  thread_id?: string;
  /** Stable per-proposal key: double-clicks and retries can't double-post. */
  idempotency_key?: string;
}

export interface JournalPostResponse {
  posted: boolean;
  mode: XeroMode;
  journal_id: string | null;
  message: string;
}

// ---- Structured audit findings (books-page panel) ----

export type FindingKind = "overdue_invoice" | "overdue_bill" | "unreconciled" | "tax_flag";
export type FindingSeverity = "high" | "medium" | "low";

export interface FindingAction {
  type: "chase" | "fix" | "explain";
  label: string;
  /** Ready to send to the chat verbatim. */
  prompt: string;
}

export interface Finding {
  id: string;
  kind: FindingKind;
  severity: FindingSeverity;
  title: string;
  amount: number;
  detail: string;
  days_overdue?: number;
  action: FindingAction;
  /** Present on overdue_invoice findings — enables one-click auto-chase. */
  invoice_number?: string;
  invoice_id?: string;
}

export interface AgingBucketSummary {
  key: string;
  label: string;
  amount: number;
  count: number;
}

export interface AgingSummary {
  buckets: AgingBucketSummary[];
  total_outstanding: number;
  /** Average days customers take to pay (from payment history); null = no history. */
  dso_days: number | null;
}

export interface FindingsResponse {
  mode: XeroMode;
  money_found: number;
  counts: { overdue: number; unreconciled: number; tax_flags: number };
  clean: boolean;
  /** Pre-sorted by severity then amount. */
  findings: Finding[];
  /** Aged-receivables summary (30/60/90 buckets) — best-effort, may be null. */
  aging?: AgingSummary | null;
  /** Money recovered by the chase loop for this session (paid after ≥1 chase). */
  recovered?: { total: number; count: number } | null;
}

// ---- Chase sequences (automated follow-ups) ----

export interface ChaseEvent {
  id: number;
  sequence_id: number;
  stage: number;
  outcome: "sent" | "simulated" | "failed" | "skipped_paid";
  subject: string;
  to_email: string;
  detail: string;
  created_at: string;
}

export interface ChaseSequence {
  id: number;
  invoice_number: string;
  contact_name: string;
  contact_email: string;
  amount: number;
  due_date: string;
  status: "active" | "completed" | "cancelled" | "exhausted";
  simulated: number;
  next_stage: number;
  next_send_at: string | null;
  events: ChaseEvent[];
}

export interface ChaseStartResponse {
  sequence: ChaseSequence;
  mode: XeroMode;
  message: string;
  stage_labels: Record<string, string>;
}

// ---- Session audit trail (/activity) ----

export interface ActivityEvent {
  id: number;
  action:
    | "journal_posted"
    | "journal_reversed"
    | "query_asked"
    | "tool_called"
    | "chase_sent"
    | "chase_recovered"
    | "chase_exhausted";
  description: string;
  amount: number | null;
  journal_id: string;
  created_at: string;
}

/** Aggregate activity across all sessions (last 7 days) — social proof. */
export interface AggregateActivity {
  queries: number;
  tool_calls: number;
  journals_posted: number;
  active_sessions: number;
}

// ---- Weekly digest ----

export interface DigestPreview {
  configured: boolean;
  subject: string;
  text: string;
  html: string;
  findings_count: number;
}

// ---- Accounts & billing ----

export type Plan = "free" | "pro" | "business";

export interface AuthUser {
  email: string;
  plan: Plan;
}

export interface AuthResponse {
  ok: boolean;
  user: AuthUser;
}

export interface UserProfile {
  name: string | null;
  business_name: string | null;
  timezone: string | null;
  language: string | null;
  industry: string | null;
}

export interface MeResponse {
  authenticated: boolean;
  email: string | null;
  plan: Plan;
  email_verified: boolean;
  profile: UserProfile;
  usage: {
    used: number;
    /** null = unlimited */
    limit: number | null;
    month: string;
  };
  billing_enforced: boolean;
  stripe_configured: boolean;
  /** Weekly email digest opt-in (false for anonymous sessions). */
  digest_opt_in: boolean;
}

export type PaidPlan = "pro" | "business";

/** Overall wall-clock budget for a single streamed chat response.
 *  Allows for: 30s NVIDIA timeout → Venice fallback → 3-4 tool calls
 *  → final inference → streamed response. */
const STREAM_TIMEOUT_MS = 180_000;

// ---- Endpoint functions (typed) ----

export const endpoints = {
  health: () => api.get<{ status: string; supermemory?: boolean }>("/api/health"),

  feedback: (payload: FeedbackPayload) =>
    api.post<{ received: boolean }>("/api/feedback", payload),

  /** Contextual HMRC/tax content while Siki is working (Exa-powered). */
  contextSearch: (q: string) =>
    api.get<{ results: ContextResult[]; source: string }>(`/api/context/search?q=${encodeURIComponent(q)}`),

  /** Multi-region semantic tax RAG search (Supermemory Local). */
  taxRag: (q: string, region: string) =>
    api.get<{
      query: string;
      region: string;
      region_info: { name: string; authority: string; currency: string; symbol: string };
      supermemory: boolean;
      results: MemoryEntry[];
    }>(`/api/tax/rag?q=${encodeURIComponent(q)}&region=${encodeURIComponent(region)}`),

  impact: () => api.get<ImpactMetrics>("/api/impact"),

  /** This session's audit trail — journals posted/reversed, newest first. */
  activity: () => api.get<{ events: ActivityEvent[]; aggregate: AggregateActivity }>("/api/activity"),

  prefs: {
    /** Store the user's sector — asked once, personalizes benchmarks. */
    set: (sector: string) => api.post<{ ok: boolean; sector: string }>("/api/prefs", { sector }),
    get: () => api.get<{ sector: string | null }>("/api/prefs"),
  },

  data: {
    /** Disconnect the accounting platform but KEEP memories and conversations.
     *  The user can reconnect later and Siki still remembers their business. */
    disconnect: () =>
      api.post<{ disconnected: boolean; memories_preserved: boolean; message: string }>(
        "/api/data/disconnect",
        {},
      ),
    /** Full erasure — disconnect platform AND delete everything including memories.
     *  GDPR right-to-erasure. The nuclear option. */
    delete: () =>
      api.post<{ deleted: boolean; platform_disconnected: boolean; counts: Record<string, number>; message: string }>(
        "/api/data/delete",
        {},
      ),
  },

  connection: {
    /** Get the active platform connection status — works with any connector. */
    status: () =>
      api.get<ConnectionStatus>("/api/connection/status"),
    /** List all available accounting platform connectors. */
    platforms: () =>
      api.get<{ platforms: AvailablePlatform[] }>("/api/connection/platforms"),
  },

  memory: {
    /** List all memories Supermemory has stored for this session. */
    list: () =>
      api.get<{ memories: MemoryEntry[]; available: boolean }>("/api/memory"),
    /** Delete a specific memory by document ID (right-to-erasure). */
    delete: (documentId: string) =>
      api.delete<{ deleted: boolean; id: string }>(`/api/memory/${documentId}`),
    /** Seed demo memories for the current session. */
    seedDemo: () => api.post<{ seeded: number; mode: string }>("/api/memory/seed-demo"),
    /** Explicitly remember a fact from the chat. */
    remember: (content: string) =>
      api.post<{ remembered: boolean; id: string }>("/api/memory/remember", { content }),
  },

  chase: {
    /** Approve automatic follow-ups for one overdue invoice (server resolves
     *  amount/contact/dates from Xero; stops on payment). */
    start: (invoice_number: string, invoice_id?: string) =>
      api.post<ChaseStartResponse>("/api/chase/start", { invoice_number, invoice_id }),
    list: () =>
      api.get<{ sequences: ChaseSequence[]; stage_labels: Record<string, string> }>(
        "/api/chase/list",
      ),
    cancel: (sequence_id: number) =>
      api.post<{ cancelled: boolean }>("/api/chase/cancel", { sequence_id }),
  },

  digest: {
    /** Preview this week's digest email for the current session's books. */
    preview: () => api.get<DigestPreview>("/api/digest/preview"),
    /** Toggle the weekly digest. 401 when not signed in. */
    opt: (enabled: boolean) =>
      api.post<{ ok: boolean; enabled: boolean }>("/api/digest/opt", { enabled }),
  },

  // ---- Accounts & billing ----

  auth: {
    /** Create an account bound to the current anonymous session. 409 if email taken. */
    register: (email: string, password: string) =>
      api.post<AuthResponse>("/api/auth/register", { email, password }),
    /** Sign in. 401 on bad credentials. */
    login: (email: string, password: string) =>
      api.post<AuthResponse>("/api/auth/login", { email, password }),
    logout: () => api.post<{ ok: boolean }>("/api/auth/logout", {}),
    /** Request a password reset email. Always returns success (doesn't leak
     *  whether the email exists). */
    requestPasswordReset: (email: string) =>
      api.post<{ ok: boolean; message: string }>("/api/auth/password-reset/request", { email }),
    /** Reset password using a token from the reset email. */
    confirmPasswordReset: (token: string, password: string) =>
      api.post<{ ok: boolean; message: string }>("/api/auth/password-reset/confirm", { token, password }),
    /** Verify an email address using a token from the verification email. */
    verifyEmail: (token: string) =>
      api.post<{ ok: boolean; message: string }>("/api/auth/verify-email", { token }),
    /** Resend the email verification link. */
    resendVerification: (email: string) =>
      api.post<{ ok: boolean; message: string }>("/api/auth/verify-email/resend", { email }),
  },

  /** Current session — works for anonymous sessions too (authenticated: false). */
  me: () => api.get<MeResponse>("/api/me"),

  profile: {
    /** Get the current user's profile. 401 if not authenticated. */
    get: () => api.get<{ profile: UserProfile }>("/api/profile"),
    /** Update one or more profile fields. Only sent fields are updated. */
    update: (fields: Partial<UserProfile>) =>
      api.put<{ ok: boolean; profile: UserProfile }>("/api/profile", fields),
  },

  billing: {
    /** Start a Stripe Checkout session. 401 if not logged in, 503 if Stripe not configured. */
    checkout: (plan: PaidPlan) => api.post<{ url: string }>("/api/billing/checkout", { plan }),
    /** Open the Stripe customer portal. 401/503 as above. */
    portal: () => api.post<{ url: string }>("/api/billing/portal", {}),
  },

  // ---- Xero (Bookkeeper mode) ----

  xero: {
    /**
     * Streaming chat — returns an async generator of events.
     * Events: tool_call, tool_result, text, done
     * This lets the frontend show the agent's tool calls in real-time.
     *
     * Pass an AbortSignal to cancel mid-stream (e.g. a Stop button).
     * The whole stream is also capped at STREAM_TIMEOUT_MS.
     */
    chatStream: async function* (
      message: string,
      thread_id?: string,
      persona?: string,
      signal?: AbortSignal,
      disableMemory?: boolean,
    ): AsyncGenerator<AgentEvent> {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), STREAM_TIMEOUT_MS);
      const onAbort = () => controller.abort();
      if (signal) {
        if (signal.aborted) controller.abort();
        else signal.addEventListener("abort", onAbort);
      }

      let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
      try {
        const res = await fetch(`${API_BASE}/api/xero/chat/stream`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message, thread_id, persona, disable_memory: disableMemory }),
          signal: controller.signal,
          credentials: "include",
        });
        if (!res.ok || !res.body) {
          throw new ApiError(res.status, await res.text().catch(() => res.statusText));
        }
        reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";
          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                yield JSON.parse(line.slice(6)) as AgentEvent;
              } catch {
                // skip malformed lines
              }
            }
          }
        }
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
        // Make sure the reader is released even when the consumer bails early.
        await reader?.cancel().catch(() => {});
      }
    },
    status: () => api.get<XeroStatus>("/api/xero/status"),
    organisation: () => api.get<Record<string, unknown>>("/api/xero/organisation"),
    discrepancies: () =>
      api.get<{ unreconciled: unknown[]; overdue: unknown[] }>("/api/xero/discrepancies"),
    /** Structured audit findings — the books-page findings panel. */
    findings: () => api.get<FindingsResponse>("/api/xero/findings"),
    profitAndLoss: (from_date?: string, to_date?: string) => {
      const search = new URLSearchParams();
      if (from_date) search.set("from_date", from_date);
      if (to_date) search.set("to_date", to_date);
      const q = search.toString();
      return api.get<Record<string, unknown>>(`/api/xero/profit-and-loss${q ? "?" + q : ""}`);
    },
    /** Daily metric snapshots for sidebar trend charts. */
    metricSnapshots: (opts?: { force?: boolean }) => {
      const q = opts?.force ? "?force=true" : "";
      return api.get<{
        snapshots: Array<{
          captured_at: string;
          total_revenue: number;
          net_margin: number;
          total_overdue: number;
          overdue_count: number;
          avg_receivables_days: number;
          overdue_rate: number;
        }>;
      }>(`/api/metrics/snapshots${q}`);
    },
    /** Post an approved journal entry. In "demo" mode the write is simulated. */
    journal: (payload: JournalPostPayload) =>
      api.post<JournalPostResponse>("/api/xero/journal", payload),
    /**
     * Reverse a posted journal entry — pass the ORIGINAL entry's fields;
     * the backend swaps debit/credit and prefixes "Reversal:".
     * Same 403 (Pro-gated) / 502 semantics as `journal`.
     */
    reverseJournal: (payload: JournalPostPayload) =>
      api.post<JournalPostResponse>("/api/xero/journal/reverse", payload),
    uploadReceipt: (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      return fetch(`${API_BASE}/api/xero/upload-receipt`, {
        method: "POST",
        body: formData,
        credentials: "include",
      }).then(async (res) => {
        if (!res.ok) {
          const detail = await res.text().catch(() => res.statusText);
          throw new ApiError(res.status, detail);
        }
        return res.json() as Promise<{
          response: string;
          agent_available: boolean;
          filename: string;
        }>;
      });
    },
    webhookEvents: (since = 0) =>
      api.get<{
        events: Array<{
          eventType: string;
          entity: string;
          entityId: string;
          tenantId: string;
          message: string;
          timestamp: string;
        }>;
        total: number;
      }>(`/api/xero/webhook/events?since=${since}`),
    // OAuth: Connect Your Xero flow
    auth: (session?: string) =>
      api.get<{
        configured: boolean;
        auth_url: string | null;
        message?: string;
      }>(`/api/xero/auth${session ? `?session=${session}` : ""}`),
    connection: (session?: string) =>
      api.get<{
        connected: boolean;
        oauth_configured: boolean;
        tenant_id?: string;
        tenant_name?: string;
      }>(`/api/xero/connection${session ? `?session=${session}` : ""}`),
    disconnect: (session?: string) =>
      api.post<{ disconnected: boolean }>(
        `/api/xero/disconnect${session ? `?session=${session}` : ""}`,
        {},
      ),
  },
};
