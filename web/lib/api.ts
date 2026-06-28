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

  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
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
};
