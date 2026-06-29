/**
 * Single API client for the Sikizana backend.
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

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8080";
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
  // Attach the team token for protected endpoints if it's been set.
  const teamToken = getTeamToken();
  if (teamToken) headers["X-Team-Token"] = teamToken;

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

// ---- Team token (shared password) for /admin endpoints ----

const TEAM_TOKEN_KEY = "sikizana.team_token";

export function getTeamToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(TEAM_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setTeamToken(token: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(TEAM_TOKEN_KEY, token);
  } catch {
    // ignore
  }
}

export function clearTeamToken(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(TEAM_TOKEN_KEY);
  } catch {
    // ignore
  }
}

export function isTeamAuthenticated(): boolean {
  return getTeamToken() !== null;
}

// ---- Typed endpoint contracts ----

export interface ChatResponse {
  response: string;
  thread_id: string;
  agent_available?: boolean;
}

export interface StkPushResponse {
  CheckoutRequestID?: string;
  ResponseCode?: string | number;
  ResponseDescription?: string;
  CustomerMessage?: string;
  errorMessage?: string;
  errorCode?: string | number;
}

export type PaymentStatus = "PENDING" | "CONFIRMED" | "FAILED" | "NOT_FOUND";

export interface PaymentStatusResponse {
  status: PaymentStatus;
  mpesa_receipt?: string | null;
  amount?: number;
  confirmed_at?: string | null;
  result_desc?: string;
}

export interface RevenueSummary {
  total_payments: number;
  confirmed_count: number | null;
  total_revenue_kes: number | null;
  pending_count: number | null;
  failed_count: number | null;
}

export interface FeedbackPayload {
  thread_id: string;
  message_index: number;
  rating: "up" | "down";
  comment?: string;
}

export type LeadStatus =
  | "contacted"
  | "interested"
  | "demoed"
  | "paid"
  | "testimonial"
  | "inactive";

export interface Lead {
  id: number;
  chama_name: string;
  contact_name: string | null;
  contact_phone: string | null;
  contact_handle: string | null;
  language: "en" | "sw" | "sheng";
  county: string | null;
  source: string | null;
  status: LeadStatus;
  notes: string | null;
  owner: string | null;
  created_at: string;
  updated_at: string;
}

export interface LeadCreatePayload {
  chama_name: string;
  contact_name?: string;
  contact_phone?: string;
  contact_handle?: string;
  language?: "en" | "sw" | "sheng";
  county?: string;
  source?: string;
  status?: LeadStatus;
  notes?: string;
  owner?: string;
}

export interface ScoreboardRow {
  owner: string;
  lead_count: number;
  engaged_count: number;
  paid_count: number;
  revenue_kes: number;
  revenue_tx_count: number;
}

export interface FunnelSummary {
  contacted: number;
  interested: number;
  demoed: number;
  paid: number;
  testimonial: number;
  inactive: number;
}

export interface Testimonial {
  id: number;
  chama_name: string;
  contact_name: string | null;
  quote: string;
  language: "en" | "sw" | "sheng";
  approved_public: boolean;
  created_at: string;
}

// ---- Endpoint functions (typed) ----

export const endpoints = {
  chat: (message: string, thread_id?: string) =>
    api.post<ChatResponse>("/chat", { message, thread_id }),

  stkPush: (phone: string, amount: number, dispute_context: string) =>
    api.post<StkPushResponse>("/api/payments/stk-push", {
      phone,
      amount,
      dispute_context,
    }),

  paymentStatus: (checkoutId: string) =>
    api.get<PaymentStatusResponse>(`/api/payments/status/${checkoutId}`),

  revenue: () => api.get<RevenueSummary>("/api/revenue"),

  health: () => api.get<{ status: string }>("/health"),

  feedback: (payload: FeedbackPayload) =>
    api.post<{ received: boolean }>("/api/feedback", payload),

  leads: {
    create: (payload: LeadCreatePayload) => api.post<Lead>("/api/leads", payload),
    list: (params?: { owner?: string; status?: LeadStatus }) => {
      const search = new URLSearchParams();
      if (params?.owner) search.set("owner", params.owner);
      if (params?.status) search.set("status_filter", params.status);
      const q = search.toString();
      return api.get<Lead[]>(`/api/leads${q ? "?" + q : ""}`);
    },
    setStatus: (id: number, status: LeadStatus, actor: string, notes?: string) =>
      api.post<Lead>(`/api/leads/${id}/status`, { status, actor, notes }),
    claim: (id: number, actor: string) =>
      api.post<Lead>(`/api/leads/${id}/claim`, { actor }),
    logActivity: (id: number, event: string, actor: string, notes?: string) =>
      api.post<{ id: number }>(`/api/leads/${id}/activity`, { event, actor, notes }),
    activity: (id: number) => api.get<unknown[]>(`/api/leads/${id}/activity`),
    scoreboard: (actor?: string) => {
      const search = actor ? `?actor=${encodeURIComponent(actor)}` : "";
      return api.get<ScoreboardRow[]>(`/api/leads/aggregate/scoreboard${search}`);
    },
    funnel: () => api.get<FunnelSummary>("/api/leads/aggregate/funnel"),
    dailyRevenue: () =>
      api.get<Array<{ day: string; owner: string; revenue_kes: number; tx_count: number }>>(
        "/api/leads/aggregate/daily-revenue",
      ),
  },

  testimonials: {
    create: (payload: { chama_name: string; quote: string; contact_name?: string; language?: "en" | "sw" | "sheng"; approved_public?: boolean }) =>
      api.post<Testimonial>("/api/testimonials", payload),
    list: (approved_only = true) =>
      api.get<Testimonial[]>(`/api/testimonials${approved_only ? "?approved_only=true" : ""}`),
  },
};
