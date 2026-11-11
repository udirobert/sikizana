"use client";

import Link from "next/link";
import { SikiMascot } from "@/components/SikiMascot";
import { PlanBadge } from "@/components/PlanBadge";
import type { MeResponse, XeroMode } from "@/lib/api";
import type { getPersonaTheme } from "@/lib/persona-theme";
import { useT } from "@/lib/i18n";

export interface BooksNavProps {
  theme: ReturnType<typeof getPersonaTheme>;
  me: MeResponse | null;
  xeroMode: XeroMode | "unknown";
  provenance: string;
  platformName: string;
  demoScenario: string | null;
  userConnection: { connected: boolean; tenant_name?: string } | null;
  oauthConfigured: boolean;
  connecting: boolean;
  sandboxSwitching: boolean;
  navOpen: boolean;
  onToggleNav: () => void;
  onCloseNav: () => void;
  onConnect: () => void;
  onDisconnect: () => void;
  onLeaveSandbox: () => void;
}

export function BooksNav({
  theme,
  me,
  xeroMode,
  provenance,
  platformName,
  demoScenario,
  userConnection,
  oauthConfigured,
  connecting,
  sandboxSwitching,
  navOpen,
  onToggleNav,
  onCloseNav,
  onConnect,
  onDisconnect,
  onLeaveSandbox,
}: BooksNavProps) {
  const t = useT();
  const statusBadge =
    xeroMode === "live-oauth" || xeroMode === "live-cli"
      ? "● Xero Live"
      : provenance === "sandbox"
        ? xeroMode === "seapoint-snapshot"
          ? `● ${platformName} sandbox snapshot · read-only`
          : `● ${platformName} sandbox · read-only`
        : xeroMode === "demo"
          ? demoScenario === "music"
            ? "● Demo · Music books"
            : demoScenario === "cafe"
              ? "● Demo · Café books"
              : "● Demo Data"
          : "○ Connecting...";

  const navItems = [
    { href: "/activity", label: t("nav.activity") },
    { href: "/account", label: me?.authenticated ? t("nav.account") : t("nav.signin") },
    { href: "/pricing", label: t("nav.pricing") },
    { href: "/", label: t("nav.home") },
  ];

  return (
    <nav className="bg-white border-b border-stone-200 px-4 py-3">
      <div className="max-w-6xl mx-auto flex items-center justify-between gap-2">
        <Link href="/" className="flex items-center gap-3 group min-w-0">
          <SikiMascot size={36} mood="idle" />
          <div className="min-w-0">
            <h1 className="text-base font-bold text-stone-900 leading-none transition-colors group-hover:text-sky-600">SIKIZANA</h1>
            <p className="text-xs text-stone-500 leading-none mt-0.5 hidden xs:block sm:block">
              {t("nav.tagline")}
            </p>
          </div>
        </Link>
        <div className="flex items-center gap-3">
          {/* Connection status / Connect button */}
          {userConnection?.connected ? (
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium px-2 py-1 rounded-lg bg-emerald-50 text-emerald-700 max-w-[140px] truncate">
                ● {userConnection.tenant_name || "Your Xero"}
              </span>
              {/* Switch org — re-runs the Xero OAuth flow so the user can
                  pick a different org. Minimal practice mode: doesn't
                  support instant switching (that needs multi-tenant token
                  storage), but makes multi-org awareness visible for
                  accountants managing multiple clients. */}
              <button
                onClick={onConnect}
                disabled={connecting}
                className="text-xs text-stone-500 hover:text-sky-600 px-1.5 py-1 rounded hover:bg-sky-50 btn-press transition-colors hidden sm:block"
                title="Connect a different Xero org"
              >
                Switch org
              </button>
              <button
                onClick={onDisconnect}
                className="text-xs text-stone-500 hover:text-red-600 px-1.5 py-1 rounded hover:bg-red-50 btn-press"
                title="Disconnect your Xero"
              >
                {t("nav.disconnect")}
              </button>
            </div>
          ) : oauthConfigured ? (
            <button
              onClick={onConnect}
              disabled={connecting}
              className={`text-xs font-semibold px-3 py-1.5 rounded-lg ${theme.btnPrimary} btn-press transition-colors disabled:opacity-50`}
            >
              {connecting ? t("nav.connecting") : t("nav.connectXero")}
            </button>
          ) : (
            <span
              className={`text-xs font-medium px-2 py-1 rounded-lg transition-opacity-quick ${
                xeroMode === "live-oauth" || xeroMode === "live-cli"
                  ? "bg-emerald-50 text-emerald-700"
                  : provenance === "sandbox" || xeroMode === "demo"
                    ? "bg-amber-50 text-amber-700"
                    : "bg-stone-100 text-stone-500"
              }`}
            >
              {statusBadge}
            </span>
          )}
          {provenance === "sandbox" && (
            <button
              onClick={onLeaveSandbox}
              disabled={sandboxSwitching}
              className="text-xs font-medium text-stone-500 hover:text-stone-700 hover:bg-stone-100 px-2 py-1 rounded-lg transition-colors disabled:opacity-50"
            >
              {sandboxSwitching ? t("nav.switching") : t("nav.switchToSample")}
            </button>
          )}
          {/* Nav links — inline from sm up; collapsed behind a menu button
              on phones so the Connect button never gets squeezed off-screen. */}
          <div className="hidden sm:flex items-center gap-3">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="text-xs text-stone-500 hover:text-stone-700 px-2 py-1 rounded hover:bg-stone-100 btn-press flex items-center gap-1.5"
              >
                {item.href === "/account" && me?.authenticated ? (
                  <>
                    {t("nav.account")} <PlanBadge plan={me.plan} />
                  </>
                ) : (
                  item.label
                )}
              </Link>
            ))}
          </div>
          <div className="relative sm:hidden">
            <button
              onClick={onToggleNav}
              aria-expanded={navOpen}
              aria-label={t("nav.menu")}
              className="p-2 rounded-lg text-stone-600 hover:bg-stone-100 btn-press"
            >
              <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M3 6h18M3 12h18M3 18h18" />
              </svg>
            </button>
            {navOpen && (
              <div className="absolute right-0 top-full mt-1 z-50 w-40 bg-white border border-stone-200 rounded-xl shadow-lg py-1 fade-in-up">
                {navItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onCloseNav}
                    className="block px-3 py-2 text-xs text-stone-600 hover:bg-stone-50"
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}

export interface DemoBannerProps {
  xeroMode: XeroMode | "unknown";
  connected: boolean;
  oauthConfigured: boolean;
  connecting: boolean;
  theme: ReturnType<typeof getPersonaTheme>;
  onConnect: () => void;
}

/** Persistent demo mode banner — always visible when in demo mode.
    Small business owners were confused about demo vs. real data.
    This banner makes it unmissable and offers a one-click connect. */
export function DemoBanner({
  xeroMode,
  connected,
  oauthConfigured,
  connecting,
  theme,
  onConnect,
}: DemoBannerProps) {
  const t = useT();
  if (xeroMode !== "demo" || connected) return null;
  return (
    <div className="w-full bg-amber-50 border-b border-amber-200 px-4 py-2.5">
      <div className="max-w-6xl mx-auto flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <span className="text-base">👀</span>
          <div>
            <p className="text-xs font-semibold text-amber-900">
              {t("demo.title")}
            </p>
            <p className="text-xs text-amber-700">
              {t("demo.body")}
            </p>
          </div>
        </div>
        {oauthConfigured && (
          <button
            onClick={onConnect}
            disabled={connecting}
            className={`text-xs font-semibold px-4 py-2 rounded-lg ${theme.btnPrimary} btn-press transition-colors disabled:opacity-50 whitespace-nowrap`}
          >
            {connecting ? t("nav.connecting") : t("demo.connectCta")}
          </button>
        )}
      </div>
    </div>
  );
}
