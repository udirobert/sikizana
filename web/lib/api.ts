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
    });

    const contentType = res.headers.get("content-type") || "";
    const isJson = contentType.includes("application/json");
    const payload = isJson ? await res.json() : await res.text();

    if (!res.ok) {
      const message =
        (isJson && typeof payload === "object" && (payload as { error?: string }).error) ||
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

export interface ChatResponse {
  response: string;
  thread_id: string;
  agent_available?: boolean;
}

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

// ---- Endpoint functions (typed) ----

export const endpoints = {
  health: () => api.get<{ status: string }>("/health"),

  feedback: (payload: FeedbackPayload) =>
    api.post<{ received: boolean }>("/api/feedback", payload),

  feedbackSummary: () =>
    api.get<{ up: number; down: number; total: number }>("/api/feedback/summary"),

  impact: () => api.get<ImpactMetrics>("/api/impact"),

  // ---- Xero (Bookkeeper mode) ----

  xero: {
    chat: (message: string, thread_id?: string, persona?: string) =>
      api.post<ChatResponse>("/api/xero/chat", { message, thread_id, persona }),

    /**
     * Streaming chat — returns an async generator of events.
     * Events: tool_call, tool_result, text, done
     * This lets the frontend show the agent's tool calls in real-time.
     */
    chatStream: async function* (
      message: string,
      thread_id?: string,
      persona?: string,
    ): AsyncGenerator<AgentEvent> {
      const res = await fetch(`${API_BASE}/api/xero/chat/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, thread_id, persona }),
      });
      if (!res.ok || !res.body) {
        throw new ApiError(res.status, await res.text().catch(() => res.statusText));
      }
      const reader = res.body.getReader();
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
    },
    status: () => api.get<{ live: boolean; mode: "live" | "demo" }>("/api/xero/status"),
    organisation: () => api.get<Record<string, unknown>>("/api/xero/organisation"),
    discrepancies: () =>
      api.get<{ unreconciled: unknown[]; overdue: unknown[] }>("/api/xero/discrepancies"),
    invoices: (params?: { status?: string; invoice_type?: string }) => {
      const search = new URLSearchParams();
      if (params?.status) search.set("status", params.status);
      if (params?.invoice_type) search.set("invoice_type", params.invoice_type);
      const q = search.toString();
      return api.get<unknown[]>(`/api/xero/invoices${q ? "?" + q : ""}`);
    },
    bankTransactions: (txn_type?: string) => {
      const q = txn_type ? `?txn_type=${txn_type}` : "";
      return api.get<unknown[]>(`/api/xero/bank-transactions${q}`);
    },
    profitAndLoss: (from_date?: string, to_date?: string) => {
      const search = new URLSearchParams();
      if (from_date) search.set("from_date", from_date);
      if (to_date) search.set("to_date", to_date);
      const q = search.toString();
      return api.get<Record<string, unknown>>(`/api/xero/profit-and-loss${q ? "?" + q : ""}`);
    },
    balanceSheet: (as_of?: string) => {
      const q = as_of ? `?as_of=${as_of}` : "";
      return api.get<Record<string, unknown>>(`/api/xero/balance-sheet${q}`);
    },
    uploadReceipt: (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      return fetch(`${API_BASE}/api/xero/upload-receipt`, {
        method: "POST",
        body: formData,
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
