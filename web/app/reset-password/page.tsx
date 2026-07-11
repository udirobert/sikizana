"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { SikiMascot } from "@/components/SikiMascot";
import { ApiError, endpoints } from "@/lib/api";

/**
 * Password reset page — two modes:
 * 1. No token: show the "request reset" form (enter email)
 * 2. ?token=xxx: show the "set new password" form
 */
function ResetPasswordContent() {
  const params = useSearchParams();
  const token = params.get("token");

  if (token) {
    return <ConfirmReset token={token} />;
  }
  return <RequestReset />;
}

function RequestReset() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setError(null);
    setLoading(true);
    try {
      await endpoints.auth.requestPasswordReset(email.trim());
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-stone-200 p-6 fade-in-up text-center">
        <SikiMascot size={56} mood="wave" />
        <h2 className="text-lg font-bold text-stone-900 mt-3">Check your email</h2>
        <p className="text-sm text-stone-600 mt-2">
          If an account exists for <span className="font-semibold">{email}</span>, a reset link has been sent.
          The link expires in 1 hour.
        </p>
        <Link
          href="/account"
          className="inline-block mt-4 text-sm font-semibold text-sky-600 hover:text-sky-800"
        >
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-stone-200 p-6 fade-in-up">
      <div className="flex flex-col items-center text-center mb-5">
        <SikiMascot size={56} mood="wave" />
        <h2 className="text-lg font-bold text-stone-900 mt-3">Reset your password</h2>
        <p className="text-xs text-stone-500 mt-1">
          Enter your email and we&apos;ll send you a reset link.
        </p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-3">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          placeholder="you@company.com"
          className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
        />
        {error && (
          <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={loading}
          className="w-full text-sm font-semibold py-2.5 rounded-lg bg-sky-600 text-white hover:bg-sky-700 disabled:opacity-50"
        >
          {loading ? "Sending…" : "Send reset link"}
        </button>
      </form>
      <p className="text-xs text-stone-500 text-center mt-4">
        <Link href="/account" className="font-semibold text-sky-600 hover:text-sky-800">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}

function ConfirmReset({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setError(null);
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setLoading(true);
    try {
      await endpoints.auth.confirmPasswordReset(token, password);
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-stone-200 p-6 fade-in-up text-center">
        <SikiMascot size={56} mood="wave" />
        <h2 className="text-lg font-bold text-stone-900 mt-3">Password reset</h2>
        <p className="text-sm text-stone-600 mt-2">
          Your password has been reset. You can now sign in with your new password.
        </p>
        <Link
          href="/account"
          className="inline-block mt-4 text-sm font-semibold text-sky-600 hover:text-sky-800"
        >
          Sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-stone-200 p-6 fade-in-up">
      <div className="flex flex-col items-center text-center mb-5">
        <SikiMascot size={56} mood="wave" />
        <h2 className="text-lg font-bold text-stone-900 mt-3">Set a new password</h2>
        <p className="text-xs text-stone-500 mt-1">Enter your new password below.</p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-3">
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
          placeholder="At least 8 characters"
          className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
        />
        {error && (
          <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={loading}
          className="w-full text-sm font-semibold py-2.5 rounded-lg bg-sky-600 text-white hover:bg-sky-700 disabled:opacity-50"
        >
          {loading ? "Resetting…" : "Reset password"}
        </button>
      </form>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center px-4">
      <Suspense fallback={<div className="text-stone-400 text-sm">Loading…</div>}>
        <ResetPasswordContent />
      </Suspense>
    </div>
  );
}
