"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useMe } from "@/hooks/useMe";
import { SikiMascot } from "@/components/SikiMascot";

/**
 * RequireAuth — client-side route guard for pages that need authentication.
 *
 * The auth state lives in the FastAPI backend (HttpOnly session cookie),
 * not in Next.js server state, so we guard on the client via useMe().
 * Unauthenticated users are redirected to /account with a redirect param
 * so they come back after logging in.
 *
 * Usage: wrap the page content in <RequireAuth>...</RequireAuth>
 */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { me, loading } = useMe();
  const router = useRouter();

  useEffect(() => {
    if (!loading && me && !me.authenticated) {
      router.replace("/account?redirect=/memory");
    }
  }, [loading, me, router]);

  // While loading or redirecting, show a minimal placeholder
  if (loading || !me || !me.authenticated) {
    return (
      <div className="min-h-screen bg-stone-50 flex flex-col items-center justify-center gap-4">
        <SikiMascot size={64} mood="idle" />
        <p className="text-sm text-stone-400">Checking your session…</p>
      </div>
    );
  }

  return <>{children}</>;
}
