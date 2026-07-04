"use client";

import { useSyncExternalStore } from "react";
import { localStore, StorageKeys } from "@/lib/storage";
import type { Language } from "@/lib/types";

/** Snapshot of per-user preferences stored in localStorage. */
interface UserPrefs {
  onboarded: boolean;
  language: Language;
}

const SERVER_SNAPSHOT: UserPrefs = { onboarded: false, language: "en" };

function subscribe(callback: () => void) {
  const handler = () => callback();
  window.addEventListener("sikizana:storage", handler);
  return () => window.removeEventListener("sikizana:storage", handler);
}

// ── Snapshot caching ─────────────────────────────────────────────
// useSyncExternalStore requires getSnapshot to return the SAME object
// reference when nothing has changed.
let cachedOnboardedRaw: string | null = null;
let cachedLangRaw: string | null = null;
let cachedPrefs: UserPrefs = { onboarded: false, language: "en" };

function getSnapshot(): UserPrefs {
  const s = typeof window !== "undefined" ? window.localStorage : null;
  const onboardedRaw = s ? s.getItem(StorageKeys.ONBOARDED) : null;
  const langRaw = s ? s.getItem(StorageKeys.PREFERRED_LANGUAGE) : null;

  if (onboardedRaw !== cachedOnboardedRaw || langRaw !== cachedLangRaw) {
    cachedOnboardedRaw = onboardedRaw;
    cachedLangRaw = langRaw;
    cachedPrefs = {
      onboarded: localStore.get<boolean>(StorageKeys.ONBOARDED, false),
      language: localStore.get<Language>(StorageKeys.PREFERRED_LANGUAGE, "en"),
    };
  }

  return cachedPrefs;
}

export function useUserPrefs(): UserPrefs {
  return useSyncExternalStore(subscribe, getSnapshot, () => SERVER_SNAPSHOT);
}
