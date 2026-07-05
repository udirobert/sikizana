"use client";

import { useSyncExternalStore, useCallback } from "react";
import { localStore } from "@/lib/storage";
import type { Message } from "@/lib/types";

/**
 * Separate thread persistence for Xero/bookkeeper mode.
 * Uses its own localStorage keys so arbitration and Xero chats don't collide.
 *
 * State lives in an in-memory store (so streaming token updates are cheap)
 * and is persisted to localStorage on a throttle — at most every 500ms
 * during streaming, plus an explicit flush() when a response completes.
 */

const XERO_THREAD_KEY = "sikizana.xero.thread_id";
const XERO_MESSAGES_KEY = "sikizana.xero.messages";
const PERSIST_THROTTLE_MS = 500;

function genThreadId(): string {
  return `xero_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

const SERVER_SNAPSHOT = { messages: [], threadId: "" };

// ── In-memory store ──────────────────────────────────────────────
// useSyncExternalStore requires getSnapshot to return the SAME object
// reference when nothing has changed, so we keep a cached snapshot and
// only rebuild it when a mutation bumps the version counter.

let memLoaded = false;
let memMessages: Message[] = [];
let memThreadId = "";
let version = 0;
let snapshotVersion = -1;
let cachedSnapshot: { messages: Message[]; threadId: string } = {
  messages: [],
  threadId: "",
};

function loadFromStorage() {
  memMessages = localStore.get<Message[]>(XERO_MESSAGES_KEY, []);
  memThreadId = localStore.get<string>(XERO_THREAD_KEY, "");
  memLoaded = true;
  version++;
}

function getSnapshot() {
  if (!memLoaded) loadFromStorage();
  if (snapshotVersion !== version) {
    snapshotVersion = version;
    cachedSnapshot = { messages: memMessages, threadId: memThreadId };
  }
  return cachedSnapshot;
}

// ── Throttled persistence ────────────────────────────────────────

let lastPersistAt = 0;
let persistTimer: ReturnType<typeof setTimeout> | null = null;

function persistNow() {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  localStore.set(XERO_MESSAGES_KEY, memMessages);
  localStore.set(XERO_THREAD_KEY, memThreadId);
  lastPersistAt = Date.now();
}

/** Persist at most once per PERSIST_THROTTLE_MS; trailing write guaranteed. */
function persistThrottled() {
  const elapsed = Date.now() - lastPersistAt;
  if (elapsed >= PERSIST_THROTTLE_MS) {
    persistNow();
  } else if (!persistTimer) {
    persistTimer = setTimeout(persistNow, PERSIST_THROTTLE_MS - elapsed);
  }
}

function subscribeToStorage(callback: () => void) {
  // Another tab wrote — reload from localStorage before notifying.
  const onCrossTab = () => {
    loadFromStorage();
    callback();
  };
  window.addEventListener("storage", onCrossTab);
  window.addEventListener("sikizana:storage", callback);
  return () => {
    window.removeEventListener("storage", onCrossTab);
    window.removeEventListener("sikizana:storage", callback);
  };
}

function notifyInTab() {
  window.dispatchEvent(new Event("sikizana:storage"));
}

export function useXeroThread() {
  const snap = useSyncExternalStore(subscribeToStorage, getSnapshot, () => SERVER_SNAPSHOT);

  const addMessage = useCallback((msg: Message) => {
    if (!memLoaded) loadFromStorage();
    memMessages = [...memMessages, msg];
    version++;
    persistNow();
    notifyInTab();
  }, []);

  const updateLastAgentMessage = useCallback((updates: Partial<Message>) => {
    if (!memLoaded) loadFromStorage();
    if (memMessages.length === 0) return;
    // Find the last agent message
    const next = [...memMessages];
    for (let i = next.length - 1; i >= 0; i--) {
      if (next[i].role === "agent") {
        next[i] = { ...next[i], ...updates };
        break;
      }
    }
    memMessages = next;
    version++;
    // Called per streamed token — keep the UI live but throttle the disk write.
    persistThrottled();
    notifyInTab();
  }, []);

  /** Force a write-through, e.g. once a streamed response is done. */
  const flush = useCallback(() => {
    if (!memLoaded) return;
    persistNow();
  }, []);

  const ensureThread = useCallback((): string => {
    if (!memLoaded) loadFromStorage();
    if (memThreadId) return memThreadId;
    memThreadId = genThreadId();
    version++;
    persistNow();
    notifyInTab();
    return memThreadId;
  }, []);

  const newSession = useCallback(() => {
    if (!memLoaded) loadFromStorage();
    memThreadId = genThreadId();
    memMessages = [];
    version++;
    persistNow();
    notifyInTab();
  }, []);

  return {
    threadId: snap.threadId,
    messages: snap.messages,
    addMessage,
    updateLastAgentMessage,
    flush,
    ensureThread,
    newSession,
  };
}
