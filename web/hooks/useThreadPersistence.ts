"use client";

import { useSyncExternalStore, useCallback } from "react";
import { localStore, StorageKeys } from "@/lib/storage";
import type { Message } from "@/lib/types";

/**
 * Persistent chat thread. Survives page reloads by mirroring messages to
 * localStorage and reusing the same thread_id so the agent retains context.
 *
 * Uses useSyncExternalStore to read localStorage values synchronously on the
 * client without setState-in-effect anti-patterns.
 */

function genThreadId(): string {
  return `t_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// Server-side snapshot (used during SSR/pre-render).
const SERVER_SNAPSHOT = { messages: [], threadId: "" };

function subscribeToStorage(callback: () => void) {
  window.addEventListener("storage", callback);
  // Custom event lets in-tab updates also notify.
  window.addEventListener("sikizana:storage", callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("sikizana:storage", callback);
  };
}

function notifyInTab() {
  window.dispatchEvent(new Event("sikizana:storage"));
}

function getSnapshot() {
  return {
    messages: localStore.get<Message[]>(StorageKeys.MESSAGES, []),
    threadId: localStore.get<string>(StorageKeys.THREAD_ID, ""),
  };
}

export function useThreadPersistence() {
  // useSyncExternalStore is the React 19-sanctioned pattern for reading
  // mutable external state (localStorage) without useEffect setState hacks.
  const snap = useSyncExternalStore(subscribeToStorage, getSnapshot, () => SERVER_SNAPSHOT);

  const addMessage = useCallback((msg: Message) => {
    const current = localStore.get<Message[]>(StorageKeys.MESSAGES, []);
    const next = [...current, msg];
    localStore.set(StorageKeys.MESSAGES, next);
    notifyInTab();
  }, []);

  const ensureThread = useCallback((): string => {
    const existing = localStore.get<string>(StorageKeys.THREAD_ID, "");
    if (existing) return existing;
    const fresh = genThreadId();
    localStore.set(StorageKeys.THREAD_ID, fresh);
    notifyInTab();
    return fresh;
  }, []);

  const newSession = useCallback(() => {
    const fresh = genThreadId();
    localStore.set(StorageKeys.THREAD_ID, fresh);
    localStore.set(StorageKeys.MESSAGES, []);
    notifyInTab();
  }, []);

  return {
    threadId: snap.threadId,
    messages: snap.messages,
    addMessage,
    ensureThread,
    newSession,
  };
}
