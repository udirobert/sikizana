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

function getSnapshot(): UserPrefs {
  return {
    onboarded: localStore.get<boolean>(StorageKeys.ONBOARDED, false),
    language: localStore.get<Language>(StorageKeys.PREFERRED_LANGUAGE, "en"),
  };
}

export function useUserPrefs(): UserPrefs {
  return useSyncExternalStore(subscribe, getSnapshot, () => SERVER_SNAPSHOT);
}
