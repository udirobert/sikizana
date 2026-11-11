"use client";

import { useMe } from "@/hooks/useMe";

/**
 * UI localization v1 — chrome strings only.
 *
 * The profile `language` field already steers the agent's replies; this
 * layer makes the interface chrome honor the same preference. Strings are
 * keyed lookups with English fallback — a missing locale or key never
 * breaks the UI, it just shows English.
 *
 * Add a string here first, then call `t("key")` from a component wrapped
 * in `useT()`. Keep the dictionary to short, factual chrome labels — long
 * marketing copy and agent-generated text stay outside this layer.
 */

export type ChromeStringKey =
  | "nav.tagline"
  | "nav.activity"
  | "nav.account"
  | "nav.signin"
  | "nav.pricing"
  | "nav.home"
  | "nav.connectXero"
  | "nav.connecting"
  | "nav.switchOrg"
  | "nav.disconnect"
  | "nav.switchToSample"
  | "nav.switching"
  | "nav.menu"
  | "demo.title"
  | "demo.body"
  | "demo.connectCta";

const EN: Record<ChromeStringKey, string> = {
  "nav.tagline": "Get paid faster · Works with Xero",
  "nav.activity": "Activity",
  "nav.account": "Account",
  "nav.signin": "Sign in",
  "nav.pricing": "Pricing",
  "nav.home": "Home",
  "nav.connectXero": "Connect Xero",
  "nav.connecting": "Connecting…",
  "nav.switchOrg": "Switch org",
  "nav.disconnect": "Disconnect",
  "nav.switchToSample": "Switch to sample books",
  "nav.switching": "Switching…",
  "nav.menu": "Menu",
  "demo.title": "You're looking at sample data",
  "demo.body": "This is a demo business so you can explore. Connect your Xero to see your real numbers.",
  "demo.connectCta": "Connect My Xero →",
};

const FR: Partial<Record<ChromeStringKey, string>> = {
  "nav.tagline": "Soyez payé plus vite · Compatible Xero",
  "nav.activity": "Activité",
  "nav.account": "Compte",
  "nav.signin": "Connexion",
  "nav.pricing": "Tarifs",
  "nav.home": "Accueil",
  "nav.connectXero": "Connecter Xero",
  "nav.connecting": "Connexion…",
  "nav.disconnect": "Déconnecter",
  "nav.menu": "Menu",
  "demo.title": "Vous consultez des données d'exemple",
  "demo.body": "C'est une entreprise de démonstration. Connectez votre Xero pour voir vos vrais chiffres.",
  "demo.connectCta": "Connecter mon Xero →",
};

const ES: Partial<Record<ChromeStringKey, string>> = {
  "nav.tagline": "Cobra antes · Funciona con Xero",
  "nav.activity": "Actividad",
  "nav.account": "Cuenta",
  "nav.signin": "Iniciar sesión",
  "nav.pricing": "Precios",
  "nav.home": "Inicio",
  "nav.connectXero": "Conectar Xero",
  "nav.connecting": "Conectando…",
  "nav.disconnect": "Desconectar",
  "nav.menu": "Menú",
  "demo.title": "Estás viendo datos de ejemplo",
  "demo.body": "Es una empresa de demostración para explorar. Conecta tu Xero para ver tus cifras reales.",
  "demo.connectCta": "Conectar mi Xero →",
};

const PL: Partial<Record<ChromeStringKey, string>> = {
  "nav.tagline": "Szybsze płatności · Działa z Xero",
  "nav.activity": "Aktywność",
  "nav.account": "Konto",
  "nav.signin": "Zaloguj się",
  "nav.pricing": "Cennik",
  "nav.home": "Start",
  "nav.connectXero": "Połącz Xero",
  "nav.connecting": "Łączenie…",
  "nav.disconnect": "Odłącz",
  "nav.menu": "Menu",
  "demo.title": "Przeglądasz dane przykładowe",
  "demo.body": "To firma demonstracyjna. Połącz swoje Xero, aby zobaczyć prawdziwe liczby.",
  "demo.connectCta": "Połącz moje Xero →",
};

const LOCALES: Record<string, Partial<Record<ChromeStringKey, string>>> = {
  en: EN,
  fr: FR,
  es: ES,
  pl: PL,
};

/** Normalize a stored profile language ("en", "en-GB", "English") to a
    locale key, or null when unsupported. */
export function resolveLocale(language: string | null | undefined): string | null {
  if (!language) return null;
  const l = language.trim().toLowerCase();
  if (!l) return null;
  if (l.startsWith("en") || l.startsWith("english")) return "en";
  if (l.startsWith("fr") || l.startsWith("french") || l.startsWith("français")) return "fr";
  if (l.startsWith("es") || l.startsWith("spanish") || l.startsWith("español")) return "es";
  if (l.startsWith("pl") || l.startsWith("polish") || l.startsWith("polski")) return "pl";
  return null;
}

export function t(key: ChromeStringKey, language: string | null | undefined): string {
  const dict = LOCALES[resolveLocale(language) ?? "en"];
  return dict[key] ?? EN[key];
}

/** React hook — chrome strings localized to the signed-in user's profile
    language, English otherwise. */
export function useT(): (key: ChromeStringKey) => string {
  const { me } = useMe();
  const language = me?.profile?.language;
  return (key) => t(key, language);
}
