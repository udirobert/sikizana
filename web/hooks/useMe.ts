"use client";

import { useCallback, useEffect, useState } from "react";
import { endpoints } from "@/lib/api";
import type { MeResponse } from "@/lib/api";

/**
 * useMe — current session (auth state, plan, usage) from GET /api/me.
 *
 * Fetches once per page load and caches the result in module state, so
 * every component mounting the hook shares a single request (no polling,
 * no context provider needed). Call `refresh()` after login/logout/checkout
 * to re-fetch and notify all subscribers.
 */

let cached: MeResponse | null = null;
/** True once the first fetch settled (success OR failure) — drives `loading`. */
let settled = false;
let inflight: Promise<MeResponse | null> | null = null;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((l) => l());
}

function fetchMe(): Promise<MeResponse | null> {
  inflight ??= endpoints
    .me()
    .then((me) => {
      cached = me;
      return me;
    })
    .catch(() => {
      // Backend unreachable or endpoint missing — treat as anonymous.
      return null;
    })
    .finally(() => {
      settled = true;
      inflight = null;
      notify();
    });
  return inflight;
}

/** Invalidate the cache and re-fetch (e.g. after login/logout). */
export function refreshMe(): Promise<MeResponse | null> {
  cached = null;
  settled = false;
  notify();
  return fetchMe();
}

export function useMe() {
  const [, setVersion] = useState(0);

  useEffect(() => {
    const listener = () => setVersion((v) => v + 1);
    listeners.add(listener);
    if (!settled && !inflight) void fetchMe();
    return () => {
      listeners.delete(listener);
    };
  }, []);

  const refresh = useCallback(() => refreshMe(), []);

  return { me: cached, loading: !settled, refresh };
}
