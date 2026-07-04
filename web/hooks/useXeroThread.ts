"use client";

import { useSyncExternalStore, useCallback } from "react";
import { localStore } from "@/lib/storage";
import type { Message } from "@/lib/types";

/**
 * Separate thread persistence for Xero/bookkeeper mode.
 * Uses its own localStorage keys so arbitration and Xero chats don't collide.
 */

const XERO_THREAD_KEY = "sikizana.xero.thread_id";
const XERO_MESSAGES_KEY = "sikizana.xero.messages";

function genThreadId(): string {
  return `xero_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

const SERVER_SNAPSHOT = { messages: [], threadId: "" };

// ── Snapshot caching ─────────────────────────────────────────────
// useSyncExternalStore requires getSnapshot to return the SAME object
// reference when nothing has changed.  JSON.parse creates a new object
// every call, so we cache the raw strings and only re-parse when they
// actually change.

let cachedMessagesRaw: string | null = null;
let cachedThreadIdRaw: string | null = null;
let cachedSnapshot: { messages: Message[]; threadId: string } = {
  messages: [],
  threadId: "",
};

function getSnapshot() {
  const s = typeof window !== "undefined" ? window.localStorage : null;
  const messagesRaw = s ? s.getItem(XERO_MESSAGES_KEY) : null;
  const threadIdRaw = s ? s.getItem(XERO_THREAD_KEY) : null;

  // Only re-parse if the raw strings changed
  if (messagesRaw !== cachedMessagesRaw || threadIdRaw !== cachedThreadIdRaw) {
    cachedMessagesRaw = messagesRaw;
    cachedThreadIdRaw = threadIdRaw;
    cachedSnapshot = {
      messages: messagesRaw ? (JSON.parse(messagesRaw) as Message[]) : [],
      threadId: threadIdRaw ? (JSON.parse(threadIdRaw) as string) : "",
    };
  }

  return cachedSnapshot;
}

function subscribeToStorage(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener("sikizana:storage", callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("sikizana:storage", callback);
  };
}

function notifyInTab() {
  window.dispatchEvent(new Event("sikizana:storage"));
}

export function useXeroThread() {
  const snap = useSyncExternalStore(subscribeToStorage, getSnapshot, () => SERVER_SNAPSHOT);

  const addMessage = useCallback((msg: Message) => {
    const current = localStore.get<Message[]>(XERO_MESSAGES_KEY, []);
    const next = [...current, msg];
    localStore.set(XERO_MESSAGES_KEY, next);
    notifyInTab();
  }, []);

  const updateLastAgentMessage = useCallback((updates: Partial<Message>) => {
    const current = localStore.get<Message[]>(XERO_MESSAGES_KEY, []);
    if (current.length === 0) return;
    // Find the last agent message
    for (let i = current.length - 1; i >= 0; i--) {
      if (current[i].role === "agent") {
        current[i] = { ...current[i], ...updates };
        break;
      }
    }
    localStore.set(XERO_MESSAGES_KEY, current);
    notifyInTab();
  }, []);

  const ensureThread = useCallback((): string => {
    const existing = localStore.get<string>(XERO_THREAD_KEY, "");
    if (existing) return existing;
    const fresh = genThreadId();
    localStore.set(XERO_THREAD_KEY, fresh);
    notifyInTab();
    return fresh;
  }, []);

  const newSession = useCallback(() => {
    const fresh = genThreadId();
    localStore.set(XERO_THREAD_KEY, fresh);
    localStore.set(XERO_MESSAGES_KEY, []);
    notifyInTab();
  }, []);

  return {
    threadId: snap.threadId,
    messages: snap.messages,
    addMessage,
    updateLastAgentMessage,
    ensureThread,
    newSession,
  };
}
