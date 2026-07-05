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
  money_found: number;
  overdue_count: number;
  discrepancies_found: number;
  estimated_tax_savings: number;
  feedback: { up: number; down: number; total: number };
}

/** Contextual HMRC/tax content from /api/context/search (Exa-powered). */
export interface ContextResult {
  title: string;
  url: string;
  snippet: string;
  /** Clean summary extracted by Firecrawl from the top result (if available). */
  summary?: string;
}

/** How the backend is talking to Xero. "demo" means no real Xero write happens. */
export type XeroMode = "live-oauth" | "live-cli" | "demo";

export interface XeroStatus {
  live: boolean;
  mode: XeroMode;
  tenant_name: string | null;
}

export interface JournalPostPayload {
  description: string;
  debit_account_code: string;
  credit_account_code: string;
  amount: number;
  thread_id?: string;
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
}

export interface FindingsResponse {
  mode: XeroMode;
  money_found: number;
  counts: { overdue: number; unreconciled: number; tax_flags: number };
  clean: boolean;
  /** Pre-sorted by severity then amount. */
  findings: Finding[];
}

// ---- Session audit trail (/activity) ----

export interface ActivityEvent {
  id: number;
  action: "journal_posted" | "journal_reversed" | "query_asked" | "tool_called";
  description: string;
  amount: number | null;
  journal_id: string;
  created_at: string;
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

export interface MeResponse {
  authenticated: boolean;
  email: string | null;
  plan: Plan;
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
  health: () => api.get<{ status: string }>("/api/health"),

  feedback: (payload: FeedbackPayload) =>
    api.post<{ received: boolean }>("/api/feedback", payload),

  /** Contextual HMRC/tax content while Siki is working (Exa-powered). */
  contextSearch: (q: string) =>
    api.get<{ results: ContextResult[]; source: string }>(`/api/context/search?q=${encodeURIComponent(q)}`),

  impact: () => api.get<ImpactMetrics>("/api/impact"),

  /** This session's audit trail — journals posted/reversed, newest first. */
  activity: () => api.get<{ events: ActivityEvent[] }>("/api/activity"),

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
  },

  /** Current session — works for anonymous sessions too (authenticated: false). */
  me: () => api.get<MeResponse>("/api/me"),

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
          body: JSON.stringify({ message, thread_id, persona }),
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
