import Link from "next/link";
import { SikiMascot } from "@/components/SikiMascot";

const LINKS = [
  { href: "/security", label: "Security" },
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
  { href: "/cookies", label: "Cookies" },
  { href: "/music", label: "Music" },
  { href: "/pricing", label: "Pricing" },
] as const;

export function MarketingFooter() {
  return (
    <footer className="border-t border-stone-200 bg-white">
      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="flex items-center justify-center gap-2 mb-4">
          <SikiMascot size={28} mood="idle" />
          <span className="text-sm font-bold text-stone-900">SIKIZANA</span>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-4 mb-3">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="text-xs text-stone-500 hover:text-stone-700">
              {l.label}
            </Link>
          ))}
        </div>
        <p className="text-[11px] text-stone-400 text-center">
          Find money. Stop leaks. Get paid. · Works with Xero
        </p>
      </div>
    </footer>
  );
}
