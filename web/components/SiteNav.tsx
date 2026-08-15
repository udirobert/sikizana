"use client";

/**
 * SiteNav — the single shared navigation bar across every public surface.
 *
 * Three variants cover the app's nav needs without 11 copy-pasted inline navs:
 *  - "marketing": sticky + blurred, big CTA buttons, auth-aware sign-in/account
 *    (landing, music, margin note, any future sector landing)
 *  - "product":   logo + subtitle, compact links or custom right-side content
 *    (pricing, impact, account)
 *  - "legal":     logo + subtitle, cross-links to sibling legal pages
 *    (privacy, terms, security, cookies)
 *
 * Auth awareness (useMe + PlanBadge) is built in so a logged-in user sees
 * "Account" on every surface, not just the main landing — the inconsistency
 * that motivated this component.
 */

import Link from "next/link";
import type { ReactNode } from "react";
import {
  COMPARE_TYPICALS_HREF,
  SAMPLE_BOOKS_HREF,
} from "@/components/MarketingCtas";
import { SikiMascot } from "@/components/SikiMascot";
import { PlanBadge } from "@/components/PlanBadge";
import { useMe } from "@/hooks/useMe";

export type NavVariant = "marketing" | "product" | "legal";

export interface NavLink {
  href: string;
  label: string;
}

export interface SiteNavProps {
  variant?: NavVariant;
  /** Subtitle under the logo (product/legal variants). */
  subtitle?: string;
  /** Compact right-side links (product/legal variants). Ignored if children are passed. */
  links?: NavLink[];
  /** Custom right-side content (e.g. books page connection status). Overrides links. */
  children?: ReactNode;
}

const LINK_CLS = "text-xs text-stone-500 hover:text-stone-700 px-2 py-1 rounded hover:bg-stone-100 btn-press transition-colors";

function AuthLink() {
  const { me } = useMe();
  return (
    <Link href="/account" className={LINK_CLS}>
      {me?.authenticated ? (
        <span className="flex items-center gap-1.5">
          Account <PlanBadge plan={me.plan} />
        </span>
      ) : (
        "Sign in"
      )}
    </Link>
  );
}

export function SiteNav({ variant = "marketing", subtitle, links, children }: SiteNavProps) {
  if (variant === "marketing") {
    return (
      <nav className="bg-white border-b border-stone-200 px-4 py-3 sticky top-0 z-50 backdrop-blur-md bg-white/90">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 group">
            <SikiMascot size={32} mood="idle" />
            <span className="text-base font-bold text-stone-900 tracking-tight group-hover:text-sky-600 transition-colors">
              SIKIZANA
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <Link
              href={COMPARE_TYPICALS_HREF}
              className="bg-sky-600 hover:bg-sky-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition btn-press"
            >
              Compare typicals
            </Link>
            <Link
              href={SAMPLE_BOOKS_HREF}
              className="bg-white hover:bg-stone-50 text-stone-700 text-sm font-medium px-4 py-2 rounded-lg transition border border-stone-200 btn-press"
            >
              Sample books
            </Link>
            <Link
              href="/pricing"
              className="hidden sm:inline-flex bg-white hover:bg-stone-50 text-stone-700 text-sm font-medium px-4 py-2 rounded-lg transition border border-stone-200 btn-press"
            >
              Pricing
            </Link>
            <AuthLink />
          </div>
        </div>
      </nav>
    );
  }

  // product + legal share the same shell; only the right side differs
  const defaultSubtitle = variant === "legal" ? "Get paid faster · Works with Xero" : subtitle;
  return (
    <nav className="bg-white border-b border-stone-200 px-4 py-3">
      <div className="max-w-6xl mx-auto flex items-center justify-between gap-2">
        <Link href="/" aria-label="Sikizana home" className="flex items-center gap-3 group">
          <SikiMascot size={36} mood="idle" />
          <div>
            <h1 className="text-base font-bold text-stone-900 leading-none transition-colors group-hover:text-sky-600">
              SIKIZANA
            </h1>
            {defaultSubtitle && (
              <p className="text-[10px] text-stone-500 leading-none mt-0.5">{defaultSubtitle}</p>
            )}
          </div>
        </Link>
        <div className="flex items-center gap-2">
          {children ??
            (links ? (
              <>
                {links.map((l) => (
                  <Link key={l.href + l.label} href={l.href} className={LINK_CLS}>
                    {l.label}
                  </Link>
                ))}
                {variant === "product" && <AuthLink />}
              </>
            ) : (
              <AuthLink />
            ))}
        </div>
      </div>
    </nav>
  );
}
