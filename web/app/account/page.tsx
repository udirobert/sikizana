"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { SikiMascot } from "@/components/SikiMascot";
import { RotatedReveal } from "@/components/RotatedReveal";
import { ApiError, endpoints } from "@/lib/api";
import type { MeResponse, PaidPlan } from "@/lib/api";
import { useMe } from "@/hooks/useMe";
import { useXeroMode } from "@/hooks/useXeroMode";
import { PLAN_LABELS, PlanBadge } from "@/components/PlanBadge";
import { ModeBadge } from "@/components/ModeBadge";
import { DESIGN_PARTNER_MAILTO } from "@/lib/design-partner";

/**
 * Account page — sign in / create account when logged out; plan, usage
 * and billing management when logged in.
 *
 * Supports ?intent=pro|business (set by the pricing page): when Stripe is
 * configured, a successful login/signup auto-starts Checkout for that plan.
 * Otherwise paid-plan interest is routed to design-partner onboarding.
 */

function parseIntent(value: string | null): PaidPlan | null {
  return value === "pro" || value === "business" ? value : null;
}

function AuthCard({ onAuthed }: { onAuthed: () => void }) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);

  const toggleMode = () => {
    setMode((m) => (m === "signin" ? "signup" : "signin"));
    setError(null);
    // Move focus back to the start of the form when the mode changes.
    emailRef.current?.focus();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError(null);

    const trimmed = email.trim();
    if (!trimmed || !trimmed.includes("@")) {
      setError("Please enter a valid email address.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setSubmitting(true);
    try {
      if (mode === "signup") {
        await endpoints.auth.register(trimmed, password);
      } else {
        await endpoints.auth.login(trimmed, password);
      }
      onAuthed();
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.status === 401
            ? "Incorrect email or password."
            : err.message
          : "Something went wrong. Please try again.";
      setError(message);
      setSubmitting(false);
    }
  };

  return (
    <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-stone-200 p-6 fade-in-up">
      <div className="flex flex-col items-center text-center mb-5">
        <SikiMascot size={56} mood="wave" />
        <h2 className="text-lg font-bold text-stone-900 mt-3">
          {mode === "signin" ? "Welcome back" : "Create your account"}
        </h2>
        <p className="text-xs text-stone-500 mt-1">
          {mode === "signin"
            ? "Sign in to manage your plan and billing."
            : "Keep your books, usage and plan in one place."}
        </p>
      </div>

      <form onSubmit={handleSubmit} noValidate className="space-y-3">
        <div>
          <label htmlFor="account-email" className="block text-xs font-medium text-stone-600 mb-1">
            Email
          </label>
          <input
            ref={emailRef}
            id="account-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
            placeholder="you@company.com"
            className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500 bg-white"
          />
        </div>
        <div>
          <label
            htmlFor="account-password"
            className="block text-xs font-medium text-stone-600 mb-1"
          >
            Password
          </label>
          <input
            id="account-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            required
            minLength={8}
            placeholder={mode === "signup" ? "At least 8 characters" : "Your password"}
            className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500 bg-white"
          />
        </div>

        {/* aria-live so screen readers hear auth errors as they appear */}
        <div aria-live="polite" role="status">
          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 fade-in-up">
              {error}
            </p>
          )}
        </div>

        {/* Forgot password link — only on sign-in mode */}
        {mode === "signin" && (
          <div className="text-right">
            <Link
              href="/reset-password"
              className="text-xs text-stone-500 hover:text-sky-600"
            >
              Forgot password?
            </Link>
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full text-sm font-semibold py-2.5 rounded-lg bg-sky-600 text-white hover:bg-sky-700 btn-press transition-colors disabled:opacity-50 disabled:cursor-wait"
        >
          {submitting
            ? mode === "signin"
              ? "Signing in…"
              : "Creating account…"
            : mode === "signin"
              ? "Sign in"
              : "Create account"}
        </button>
      </form>

      <p className="text-xs text-stone-500 text-center mt-4">
        {mode === "signin" ? "New to Sikizana?" : "Already have an account?"}{" "}
        <button
          type="button"
          onClick={toggleMode}
          className="font-semibold text-sky-600 hover:text-sky-800 btn-press"
        >
          {mode === "signin" ? "Create an account" : "Sign in"}
        </button>
      </p>

      {/* Sign in with Xero — one click creates a Sikizana account AND
          connects Xero. The OAuth callback auto-creates/links the account
          from the Xero user's email (id_token). */}
      <div className="mt-5 pt-4 border-t border-stone-100">
        <p className="text-[11px] text-stone-400 text-center mb-3">
          Or sign in with your accounting platform
        </p>
        <button
          type="button"
          onClick={async () => {
            try {
              const res = await endpoints.xero.auth();
              if (res.auth_url) {
                window.location.href = res.auth_url;
              } else {
                setError("Xero OAuth is not configured. Use email sign-in instead.");
              }
            } catch {
              setError("Could not start Xero sign-in. Please try again.");
            }
          }}
          className="w-full flex items-center justify-center gap-2 text-sm font-semibold py-2.5 rounded-lg bg-white border border-stone-300 text-stone-700 hover:bg-stone-50 btn-press transition-colors"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" className="text-sky-500">
            <path d="M3 3h7.5v7.5H3V3zm10.5 0H21v7.5h-7.5V3zM3 13.5h7.5V21H3v-7.5zm10.5 0H21V21h-7.5v-7.5z" />
          </svg>
          Sign in with Xero
        </button>
        <p className="text-[10px] text-stone-400 text-center mt-2">
          Connects your Xero org and creates your Sikizana account in one step.
        </p>
      </div>
    </div>
  );
}

function UsageMeter({ usage }: { usage: MeResponse["usage"] }) {
  if (usage.limit === null) {
    return (
      <div className="bg-stone-50 border border-stone-200 rounded-xl p-3">
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-wide text-stone-500 font-semibold">
            Usage this month
          </span>
          <span className="text-xs font-bold text-emerald-700">Unlimited</span>
        </div>
        <p className="text-[11px] text-stone-500 mt-1">
          {usage.used} AI quer{usage.used === 1 ? "y" : "ies"} used — no monthly cap on your plan.
        </p>
      </div>
    );
  }

  const pct = usage.limit > 0 ? Math.min(100, Math.round((usage.used / usage.limit) * 100)) : 0;
  const exhausted = usage.used >= usage.limit;

  return (
    <div className="bg-stone-50 border border-stone-200 rounded-xl p-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wide text-stone-500 font-semibold">
          Usage this month
        </span>
        <span className={`text-xs font-bold ${exhausted ? "text-amber-700" : "text-stone-700"}`}>
          {usage.used} of {usage.limit} AI queries used
        </span>
      </div>
      <div
        className="mt-2 h-1.5 rounded-full bg-stone-200 overflow-hidden"
        role="progressbar"
        aria-valuenow={usage.used}
        aria-valuemin={0}
        aria-valuemax={usage.limit}
        aria-label="AI queries used this month"
      >
        <div
          className={`h-full rounded-full transition-width-fast ${exhausted ? "bg-amber-500" : "bg-sky-500"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {exhausted && (
        <p className="text-[11px] text-amber-700 mt-1.5">
          You&apos;ve used all your free queries — upgrade for unlimited.
        </p>
      )}
    </div>
  );
}

function DigestToggle({ initial }: { initial: boolean }) {
  const [enabled, setEnabled] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const next = !enabled;
    try {
      await endpoints.digest.opt(next);
      setEnabled(next);
    } catch {
      setError("Couldn't update your digest preference. Try again.");
    }
    setBusy(false);
  };

  return (
    <div className="bg-stone-50 border border-stone-200 rounded-xl p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1 min-w-0">
          <span className="text-[10px] uppercase tracking-wide text-stone-500 font-semibold">
            Weekly digest
          </span>
          <p className="text-[11px] text-stone-500 mt-0.5">
            Siki emails you what changed in your books each week.
          </p>
        </div>
        <button
          onClick={() => void toggle()}
          disabled={busy}
          role="switch"
          aria-checked={enabled}
          aria-label="Weekly email digest"
          className={`relative shrink-0 w-9 h-5 rounded-full transition-colors btn-press disabled:opacity-50 ${
            enabled ? "bg-sky-600" : "bg-stone-300"
          }`}
        >
          <span
            className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-position-quick ${
              enabled ? "left-[18px]" : "left-0.5"
            }`}
          />
        </button>
      </div>
      {error && (
        <p className="text-[11px] text-red-600 mt-1.5" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function YourImpact() {
  const [journals, setJournals] = useState<{ count: number; total: number } | null>(null);
  const [moneyFound, setMoneyFound] = useState<number | null>(null);
  const { isDemo } = useXeroMode();

  useEffect(() => {
    void endpoints
      .activity()
      .then((r) => {
        const posted = r.events.filter((e) => e.action === "journal_posted");
        setJournals({
          count: posted.length,
          total: posted.reduce((sum, e) => sum + (e.amount ?? 0), 0),
        });
      })
      .catch(() => {});
    void endpoints.xero
      .findings()
      .then((f) => setMoneyFound(f.money_found))
      .catch(() => {});
  }, []);

  if (journals === null && moneyFound === null) return null;

  return (
    <div className="bg-stone-50 border border-stone-200 rounded-xl p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-wide text-stone-500 font-semibold">
            Your impact
          </span>
          {isDemo && <ModeBadge isDemo={isDemo} />}
        </div>
        <Link href="/activity" className="text-[11px] font-medium text-sky-600 hover:text-sky-800">
          View activity →
        </Link>
      </div>
      <div className="flex items-center gap-5 mt-2">
        {moneyFound !== null && (
          <div>
            <div className="text-sm font-bold text-stone-900">
              £{Math.round(moneyFound).toLocaleString()}
            </div>
            <div className="text-[10px] text-stone-500">
              {isDemo ? "found in sample books" : "found in your books"}
            </div>
          </div>
        )}
        {journals !== null && (
          <div>
            <div className="text-sm font-bold text-stone-900">{journals.count}</div>
            <div className="text-[10px] text-stone-500">
              journal{journals.count === 1 ? "" : "s"} posted
              {journals.total > 0
                ? ` · £${journals.total.toLocaleString(undefined, { minimumFractionDigits: 2 })}`
                : ""}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function AccountView() {
  const searchParams = useSearchParams();
  const intent = parseIntent(searchParams.get("intent"));
  const { me, loading, refresh } = useMe();

  const [billingBusy, setBillingBusy] = useState<PaidPlan | "portal" | null>(null);
  const [billingError, setBillingError] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const intentStartedRef = useRef(false);

  const startCheckout = async (plan: PaidPlan) => {
    setBillingBusy(plan);
    setBillingError(null);
    try {
      const { url } = await endpoints.billing.checkout(plan);
      window.location.assign(url);
      return; // keep the button in its busy state during navigation
    } catch (err) {
      setBillingError(
        err instanceof ApiError && err.status === 503
          ? "Billing is not yet enabled — check back soon."
          : err instanceof ApiError
            ? err.message
            : "Could not start checkout. Please try again.",
      );
      setBillingBusy(null);
    }
  };

  const openPortal = async () => {
    setBillingBusy("portal");
    setBillingError(null);
    try {
      const { url } = await endpoints.billing.portal();
      window.location.assign(url);
      return;
    } catch (err) {
      setBillingError(
        err instanceof ApiError && err.status === 503
          ? "Billing is not yet enabled — check back soon."
          : err instanceof ApiError
            ? err.message
            : "Could not open the billing portal. Please try again.",
      );
      setBillingBusy(null);
    }
  };

  const [deleteState, setDeleteState] = useState<"idle" | "confirm" | "deleting" | "done">("idle");
  const [deleteError, setDeleteError] = useState<string | null>(null);

  /**
   * The /security page promises "one click erases everything we stored" —
   * this is that click. Revokes the Xero connection, wipes conversations,
   * audit trail, chase sequences, and snapshots server-side, then clears
   * the browser's local copies too.
   */
  const handleDeleteData = async () => {
    setDeleteState("deleting");
    setDeleteError(null);
    try {
      await endpoints.data.delete();
      try {
        localStorage.clear();
        sessionStorage.clear();
      } catch {
        /* ignore */
      }
      setDeleteState("done");
      await refresh();
    } catch (e) {
      setDeleteState("confirm");
      setDeleteError(
        e instanceof ApiError ? e.message : "Deletion failed — nothing was removed. Try again.",
      );
    }
  };

  const handleSignOut = async () => {
    setSigningOut(true);
    setBillingError(null);
    try {
      await endpoints.auth.logout();
    } catch {
      // Even if the request fails, re-check session state below.
    }
    await refresh();
    setSigningOut(false);
  };

  // ?intent=pro|business — auto-start checkout once the user is signed in
  // only when Stripe is configured. Otherwise the account page shows the
  // manual design-partner path instead of a dead checkout state.
  useEffect(() => {
    if (intentStartedRef.current) return;
    if (!intent || !me?.authenticated || !me.stripe_configured) return;
    if (me.plan === intent) return; // already on that plan
    intentStartedRef.current = true;
    // Deferred so the redirect (an external-system effect) doesn't set state
    // synchronously inside the effect body. No cleanup on purpose: the ref
    // guard already makes this once-only, and cancelling on a `me` re-notify
    // would silently drop the checkout.
    setTimeout(() => void startCheckout(intent), 0);
  }, [intent, me]);

  const authed = me?.authenticated === true && me.email;

  return (
    <main className="min-h-screen bg-stone-100 flex flex-col">
      <RotatedReveal />
      <nav className="bg-white border-b border-stone-200 px-4 py-3">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-2">
          <Link href="/" aria-label="Sikizana home" className="flex items-center gap-3 group">
            <SikiMascot size={36} mood="idle" />
            <div>
              <h1 className="text-base font-bold text-stone-900 leading-none transition-colors group-hover:text-sky-600">SIKIZANA</h1>
              <p className="text-[10px] text-stone-500 leading-none mt-0.5">
                Get paid faster · Works with Xero
              </p>
            </div>
          </Link>
          <div className="flex items-center gap-3">
            <Link
              href="/pricing"
              className="text-xs text-stone-500 hover:text-stone-700 px-2 py-1 rounded hover:bg-stone-100 btn-press"
            >
              Pricing
            </Link>
            <Link
              href="/books"
              className="text-xs text-stone-500 hover:text-stone-700 px-2 py-1 rounded hover:bg-stone-100 btn-press"
            >
              Open Sikizana →
            </Link>
          </div>
        </div>
      </nav>

      <div className="flex-1 flex flex-col items-center justify-center p-6">
        {loading ? (
          <div
            className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-stone-200 p-6 flex flex-col items-center gap-3"
            role="status"
            aria-label="Loading your account"
          >
            <SikiMascot size={48} mood="look" />
            <p className="text-xs text-stone-500 t-shimmer">Checking your account…</p>
          </div>
        ) : !authed ? (
          <>
            <AuthCard onAuthed={() => {
              void refresh();
              const redirect = searchParams.get("redirect");
              if (redirect && redirect.startsWith("/") && !redirect.startsWith("//")) {
                window.location.href = redirect;
              }
            }} />
            {intent && (
              <p className="text-[11px] text-stone-500 mt-3 fade-in-up">
                Sign in or create an account to upgrade to{" "}
                <span className="font-semibold">{PLAN_LABELS[intent]}</span>.
              </p>
            )}
          </>
        ) : (
          <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-stone-200 p-6 fade-in-up">
            <div className="flex items-center gap-3 pb-4 border-b border-stone-100">
              <SikiMascot size={44} mood="idle" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-stone-900 truncate">{me.email}</p>
                <p className="text-[11px] text-stone-500">Signed in</p>
              </div>
              <PlanBadge plan={me.plan} />
            </div>

            {/* Email verification banner */}
            {!me.email_verified && (
              <EmailVerificationBanner email={me.email} />
            )}

            {/* Profile section */}
            <ProfileSection initialProfile={me.profile} />

            <div className="mt-4 space-y-3">
              <UsageMeter usage={me.usage} />
              <YourImpact />
              <DigestToggle initial={me.digest_opt_in} />

              {/* aria-live so billing errors are announced */}
              <div aria-live="polite" role="status">
                {billingError && (
                  <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 fade-in-up">
                    {billingError}
                  </p>
                )}
              </div>

              {me.plan === "free" && me.stripe_configured && (
                <div>
                  <button
                    onClick={() => void startCheckout("pro")}
                    disabled={billingBusy !== null}
                    className="w-full text-sm font-semibold py-2.5 rounded-lg bg-sky-600 text-white hover:bg-sky-700 btn-press transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {billingBusy === "pro" ? "Redirecting to checkout…" : "Upgrade to Pro — £29/mo"}
                  </button>
                </div>
              )}

              {me.plan === "free" && !me.stripe_configured && (
                <div className="rounded-lg border border-sky-100 bg-sky-50 p-3">
                  <p className="text-xs font-semibold text-stone-900">Design partner access</p>
                  <p className="text-[11px] text-stone-600 mt-1">
                    Paid plans are not taking card payments yet. We are onboarding early Xero
                    users manually for the free read-only finance check.
                  </p>
                  <a
                    href={DESIGN_PARTNER_MAILTO}
                    className="mt-3 block w-full text-center text-sm font-semibold py-2.5 rounded-lg bg-sky-600 text-white hover:bg-sky-700 btn-press transition-colors"
                  >
                    Ask for design partner access
                  </a>
                </div>
              )}

              {(me.plan === "pro" || me.plan === "business") && (
                <button
                  onClick={() => void openPortal()}
                  disabled={billingBusy !== null}
                  className="w-full text-sm font-semibold py-2.5 rounded-lg bg-stone-100 text-stone-700 hover:bg-stone-200 btn-press transition-colors disabled:opacity-50"
                >
                  {billingBusy === "portal" ? "Opening billing portal…" : "Manage billing"}
                </button>
              )}

              <button
                onClick={() => void handleSignOut()}
                disabled={signingOut}
                className="w-full text-xs text-stone-500 hover:text-red-600 py-2 rounded-lg hover:bg-red-50 btn-press transition-colors disabled:opacity-50"
              >
                {signingOut ? "Signing out…" : "Sign out"}
              </button>
            </div>
          </div>
        )}

        {/* Data deletion — available to EVERYONE, signed in or not: an
            anonymous visitor who connected Xero has data worth erasing. */}
        {!loading && (
          <div className="w-full max-w-md mt-4 bg-white rounded-2xl shadow-sm border border-stone-200 p-5 fade-in-up">
            <h3 className="text-xs font-bold text-stone-900 uppercase tracking-wide mb-1">
              Your data
            </h3>
            {deleteState === "done" ? (
              <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2" role="status">
                ✓ Done. Your Xero connection is revoked and everything Sikizana stored —
                conversations, activity, chase schedules — is erased.
              </p>
            ) : (
              <>
                <p className="text-xs text-stone-600 mb-3">
                  Disconnect your Xero and permanently erase everything Sikizana has stored for
                  you: conversations, activity history, chase schedules, and metrics.{" "}
                  <Link href="/security" className="text-sky-600 hover:text-sky-700 underline">
                    How your data is protected
                  </Link>
                </p>
                {deleteState === "idle" && (
                  <button
                    onClick={() => setDeleteState("confirm")}
                    className="text-xs font-semibold px-3 py-2 rounded-lg bg-white text-red-600 border border-red-200 hover:bg-red-50 btn-press transition-colors"
                  >
                    Delete my data
                  </button>
                )}
                {(deleteState === "confirm" || deleteState === "deleting") && (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-stone-700 font-medium">
                      This can&apos;t be undone. Erase everything?
                    </span>
                    <button
                      onClick={() => void handleDeleteData()}
                      disabled={deleteState === "deleting"}
                      className="text-xs font-semibold px-3 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 btn-press transition-colors disabled:opacity-60 disabled:cursor-wait"
                    >
                      {deleteState === "deleting" ? "Erasing…" : "Yes, erase everything"}
                    </button>
                    <button
                      onClick={() => {
                        setDeleteState("idle");
                        setDeleteError(null);
                      }}
                      disabled={deleteState === "deleting"}
                      className="text-xs font-medium px-3 py-2 rounded-lg bg-stone-100 text-stone-600 hover:bg-stone-200 btn-press transition-colors disabled:opacity-60"
                    >
                      Cancel
                    </button>
                  </div>
                )}
                {deleteError && (
                  <p className="text-xs text-red-600 mt-2" role="alert">
                    {deleteError}
                  </p>
                )}
              </>
            )}
          </div>
        )}

        <p className="text-[10px] text-stone-400 mt-6">
          Your anonymous demo session carries over when you create an account.
        </p>
      </div>
    </main>
  );
}

function ProfileSection({ initialProfile }: { initialProfile: import("@/lib/api").UserProfile }) {
  const [profile, setProfile] = useState(initialProfile);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync if the profile data changes (e.g. after refresh)
  useEffect(() => {
    setProfile(initialProfile);
  }, [initialProfile]);

  const hasProfile = profile.name || profile.business_name || profile.industry || profile.timezone;

  const handleSave = async (fields: Partial<import("@/lib/api").UserProfile>) => {
    setSaving(true);
    setError(null);
    try {
      const res = await endpoints.profile.update(fields);
      setProfile(res.profile);
      setEditing(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save profile.");
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return <ProfileEditForm initial={profile} onSave={handleSave} onCancel={() => setEditing(false)} saving={saving} error={error} />;
  }

  return (
    <div className="mt-3 border border-stone-200 rounded-lg p-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-semibold text-stone-700 uppercase tracking-wide">Your Profile</h3>
        <button
          onClick={() => setEditing(true)}
          className="text-xs text-sky-600 hover:text-sky-800 font-semibold"
        >
          {hasProfile ? "Edit" : "Set up"}
        </button>
      </div>
      {hasProfile ? (
        <dl className="space-y-1.5">
          {profile.name && (
            <div className="flex justify-between text-xs">
              <dt className="text-stone-500">Name</dt>
              <dd className="text-stone-900 font-medium">{profile.name}</dd>
            </div>
          )}
          {profile.business_name && (
            <div className="flex justify-between text-xs">
              <dt className="text-stone-500">Business</dt>
              <dd className="text-stone-900 font-medium">{profile.business_name}</dd>
            </div>
          )}
          {profile.industry && (
            <div className="flex justify-between text-xs">
              <dt className="text-stone-500">Industry</dt>
              <dd className="text-stone-900 font-medium capitalize">{profile.industry.replace("_", " ")}</dd>
            </div>
          )}
          {profile.timezone && (
            <div className="flex justify-between text-xs">
              <dt className="text-stone-500">Timezone</dt>
              <dd className="text-stone-900 font-medium">{profile.timezone}</dd>
            </div>
          )}
          {profile.language && profile.language !== "en" && (
            <div className="flex justify-between text-xs">
              <dt className="text-stone-500">Language</dt>
              <dd className="text-stone-900 font-medium">{profile.language}</dd>
            </div>
          )}
        </dl>
      ) : (
        <p className="text-xs text-stone-500">
          Tell Siki your name and business so it can personalize responses and benchmarks.
        </p>
      )}
    </div>
  );
}

function ProfileEditForm({
  initial,
  onSave,
  onCancel,
  saving,
  error,
}: {
  initial: import("@/lib/api").UserProfile;
  onSave: (fields: Partial<import("@/lib/api").UserProfile>) => void;
  onCancel: () => void;
  saving: boolean;
  error: string | null;
}) {
  const [name, setName] = useState(initial.name || "");
  const [businessName, setBusinessName] = useState(initial.business_name || "");
  const [industry, setIndustry] = useState(initial.industry || "");
  const [timezone, setTimezone] = useState(initial.timezone || "");
  const [language, setLanguage] = useState(initial.language || "en");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      name: name.trim() || undefined,
      business_name: businessName.trim() || undefined,
      industry: industry.trim() || undefined,
      timezone: timezone.trim() || undefined,
      language: language.trim() || undefined,
    });
  };

  const inputClass = "w-full px-2.5 py-1.5 border border-stone-200 rounded-md text-xs focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500";

  return (
    <form onSubmit={handleSubmit} className="mt-3 border border-stone-200 rounded-lg p-3 space-y-2.5">
      <h3 className="text-xs font-semibold text-stone-700 uppercase tracking-wide">Edit Profile</h3>
      <div>
        <label className="text-[11px] text-stone-500 block mb-0.5">Your name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Rishi Patel" className={inputClass} />
      </div>
      <div>
        <label className="text-[11px] text-stone-500 block mb-0.5">Business name</label>
        <input value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="Patel & Co Ltd" className={inputClass} />
      </div>
      <div>
        <label className="text-[11px] text-stone-500 block mb-0.5">Industry</label>
        <select value={industry} onChange={(e) => setIndustry(e.target.value)} className={inputClass}>
          <option value="">Auto-detect from org name</option>
          <option value="retail">Retail</option>
          <option value="construction">Construction</option>
          <option value="manufacturing">Manufacturing</option>
          <option value="professional_services">Professional Services</option>
          <option value="transport">Transport & Logistics</option>
          <option value="hospitality">Hospitality</option>
          <option value="healthcare">Healthcare</option>
          <option value="technology">Technology</option>
          <option value="agriculture">Agriculture</option>
          <option value="real_estate">Real Estate</option>
          <option value="education">Education</option>
          <option value="other">Other</option>
        </select>
      </div>
      <div>
        <label className="text-[11px] text-stone-500 block mb-0.5">Timezone</label>
        <input value={timezone} onChange={(e) => setTimezone(e.target.value)} placeholder="Europe/London" className={inputClass} />
      </div>
      <div>
        <label className="text-[11px] text-stone-500 block mb-0.5">Preferred language</label>
        <select value={language} onChange={(e) => setLanguage(e.target.value)} className={inputClass}>
          <option value="en">English</option>
          <option value="es">Spanish</option>
          <option value="fr">French</option>
          <option value="de">German</option>
          <option value="hi">Hindi</option>
          <option value="zh">Chinese</option>
          <option value="ar">Arabic</option>
          <option value="pt">Portuguese</option>
        </select>
      </div>
      {error && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-2.5 py-1.5">{error}</p>
      )}
      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={saving}
          className="flex-1 text-xs font-semibold py-1.5 rounded-md bg-sky-600 text-white hover:bg-sky-700 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-3 text-xs font-semibold py-1.5 rounded-md border border-stone-300 text-stone-600 hover:bg-stone-100"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}


function EmailVerificationBanner({ email }: { email: string | null }) {
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const handleResend = async () => {
    if (sending || !email) return;
    setSending(true);
    try {
      await endpoints.auth.resendVerification(email);
      setSent(true);
    } catch {
      // Silently fail — don't reveal whether the email exists
      setSent(true);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="mt-3 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 flex items-start gap-2">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-amber-600 mt-0.5 flex-shrink-0">
        <path d="M12 9v4M12 17h.01M4.93 19h14.14a2 2 0 001.74-3l-7.07-12a2 2 0 00-3.48 0l-7.07 12a2 2 0 001.74 3z" />
      </svg>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-amber-800 font-medium">
          Please verify your email address
        </p>
        <p className="text-[11px] text-amber-700 mt-0.5">
          {sent ? (
            "Verification email sent. Check your inbox."
          ) : (
            <>
              Didn&apos;t get the email?{" "}
              <button
                onClick={handleResend}
                disabled={sending}
                className="font-semibold underline hover:text-amber-900 disabled:opacity-50"
              >
                {sending ? "Sending…" : "Resend"}
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  );
}


export default function AccountPage() {
  return (
    <Suspense fallback={null}>
      <AccountView />
    </Suspense>
  );
}
