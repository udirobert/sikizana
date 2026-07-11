"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { SikiMascot } from "@/components/SikiMascot";
import { ApiError, endpoints } from "@/lib/api";

/**
 * Email verification page — verifies the token from the URL query param.
 * Shows success or error state, with a link back to the account page.
 */
function VerifyEmailContent() {
  const params = useSearchParams();
  const token = params.get("token");
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setMessage("No verification token found in the link.");
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const res = await endpoints.auth.verifyEmail(token);
        if (!cancelled) {
          setStatus("success");
          setMessage(res.message || "Your email has been verified.");
        }
      } catch (err) {
        if (!cancelled) {
          setStatus("error");
          setMessage(err instanceof ApiError ? err.message : "Verification failed.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const mood = status === "success" ? "wave" : status === "error" ? "idle" : "look";

  return (
    <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-stone-200 p-6 fade-in-up text-center">
      <SikiMascot size={56} mood={mood as "wave" | "idle" | "look"} />
      {status === "loading" && (
        <>
          <h2 className="text-lg font-bold text-stone-900 mt-3">Verifying…</h2>
          <p className="text-sm text-stone-500 mt-2">Please wait while we verify your email.</p>
        </>
      )}
      {status === "success" && (
        <>
          <h2 className="text-lg font-bold text-stone-900 mt-3">Email verified</h2>
          <p className="text-sm text-stone-600 mt-2">{message}</p>
          <Link
            href="/account"
            className="inline-block mt-4 text-sm font-semibold text-sky-600 hover:text-sky-800"
          >
            Continue to your account
          </Link>
        </>
      )}
      {status === "error" && (
        <>
          <h2 className="text-lg font-bold text-stone-900 mt-3">Verification failed</h2>
          <p className="text-sm text-red-600 mt-2">{message}</p>
          <Link
            href="/account"
            className="inline-block mt-4 text-sm font-semibold text-sky-600 hover:text-sky-800"
          >
            Back to sign in
          </Link>
        </>
      )}
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center px-4">
      <Suspense fallback={<div className="text-stone-400 text-sm">Loading…</div>}>
        <VerifyEmailContent />
      </Suspense>
    </div>
  );
}
