/**
 * Tiny typed wrapper around localStorage. Falls back to in-memory map when
 * localStorage is unavailable (private mode, SSR pre-render).
 */

const memoryFallback = new Map<string, string>();

function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    const probeKey = "__sikizana_probe__";
    window.localStorage.setItem(probeKey, "1");
    window.localStorage.removeItem(probeKey);
    return window.localStorage;
  } catch {
    return null;
  }
}

export const localStore = {
  get<T>(key: string, fallback: T): T {
    const s = storage();
    try {
      const raw = s ? s.getItem(key) : memoryFallback.get(key) ?? null;
      if (raw === null) return fallback;
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  },

  set<T>(key: string, value: T): void {
    const raw = JSON.stringify(value);
    const s = storage();
    if (s) s.setItem(key, raw);
    else memoryFallback.set(key, raw);
  },

  remove(key: string): void {
    const s = storage();
    if (s) s.removeItem(key);
    memoryFallback.delete(key);
  },
};

/** Storage keys used across the app. Centralised to prevent typos. */
export const StorageKeys = {
  THREAD_ID: "sikizana.thread_id",
  MESSAGES: "sikizana.messages",
  PREFERRED_LANGUAGE: "sikizana.lang",
  LAST_PHONE: "sikizana.phone",
  ONBOARDED: "sikizana.onboarded",
  SAMPLE_DISPUTE: "sikizana.sample_dispute",
  BOOKS_VISITED: "sikizana.books_visited",
} as const;
