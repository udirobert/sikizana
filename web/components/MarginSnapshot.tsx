"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { BenchmarkCompareBar } from "@/components/BenchmarkCompareBar";
import { SikiMascot } from "@/components/SikiMascot";
import { SiteNav } from "@/components/SiteNav";
import {
  compareMetricTone,
  METRIC_STATUS_LABEL,
  METRIC_TONE_CLASSES,
} from "@/lib/benchmark-compare";
import {
  buildShareBlurb,
  marginNoteRead,
  sectorCheckHref,
  snapshotPath,
  type ResolvedSnapshot,
} from "@/lib/sector-benchmarks";

/** Compact sector list for the note — no chip cluster. */
const SECTOR_OPTIONS: { slug: string; label: string }[] = [
  { slug: "catering", label: "Catering" },
  { slug: "music", label: "Music" },
  { slug: "services", label: "Services" },
  { slug: "retail", label: "Retail" },
  { slug: "construction", label: "Construction" },
  { slug: "manufacturing", label: "Manufacturing" },
  { slug: "wholesale", label: "Wholesale" },
];

function parseOptionalPct(raw: string): number | null {
  if (!raw.trim()) return null;
  const n = Number(raw.replace(/%/g, "").trim());
  if (!Number.isFinite(n) || n < 0 || n > 100) return null;
  return Math.round(n * 10) / 10;
}

function MarginCompare({
  label,
  typicalPct,
  value,
  input,
  onChange,
  nearBand = 4,
}: {
  label: string;
  typicalPct: number;
  value: number | null;
  input: string;
  onChange: (v: string) => void;
  nearBand?: number;
}) {
  const tone = value != null ? compareMetricTone({ typical: typicalPct, value, nearBand }) : null;
  return (
    <div>
      <p className="text-[11px] font-semibold text-stone-500">{label}</p>
      <p className="mt-0.5 text-4xl font-bold tabular-nums tracking-tight text-stone-950 leading-none">
        {typicalPct}%
      </p>
      <label className="mt-3 block">
        <span className="text-[11px] font-semibold text-sky-800">Yours</span>
        <input
          inputMode="decimal"
          placeholder="—"
          value={input}
          onChange={(e) => onChange(e.target.value)}
          className="mt-1 w-full border-0 border-b border-stone-300 bg-transparent px-0 py-1.5 text-lg font-bold tabular-nums text-stone-950 outline-none placeholder:text-stone-300 focus:border-sky-500"
        />
      </label>
      <BenchmarkCompareBar typical={typicalPct} yours={value} tone={tone} unit="%" />
      {tone && (
        <p className={`mt-1.5 text-[11px] font-semibold ${METRIC_TONE_CLASSES[tone].text}`}>
          {METRIC_STATUS_LABEL[tone]}
        </p>
      )}
    </div>
  );
}

/**
 * Shareable margin note — Zone A voice (Siki) + Zone B proof strip.
 * One composition: brand, sector, numbers, optional yours, one share action.
 */
export function MarginSnapshot({
  resolved,
  initialGross,
  initialNet,
}: {
  resolved: ResolvedSnapshot;
  initialGross: number | null;
  initialNet: number | null;
}) {
  const router = useRouter();
  const [grossInput, setGrossInput] = useState(initialGross != null ? String(initialGross) : "");
  const [netInput, setNetInput] = useState(initialNet != null ? String(initialNet) : "");
  const [copied, setCopied] = useState<"note" | "link" | null>(null);

  const gross = parseOptionalPct(grossInput);
  const net = parseOptionalPct(netInput);
  const typicalGross = Math.round(resolved.bench.avgGrossMargin * 100);
  const typicalNet = Math.round(resolved.bench.avgNetMargin * 100);
  const hasYours = gross != null || net != null;
  const read = marginNoteRead(resolved.bench, gross, net);
  const booksHref = sectorCheckHref(resolved.id);

  const selectValue =
    SECTOR_OPTIONS.find((o) => o.slug === resolved.slug)?.slug ??
    (resolved.id === "hospitality" ? "catering" : resolved.id === "professional_services" ? "services" : resolved.slug);

  const shareUrl = useMemo(() => {
    const path = snapshotPath(resolved.slug, { g: gross, n: net });
    if (typeof window === "undefined") return `https://sikizana.persidian.com${path}`;
    return `${window.location.origin}${path}`;
  }, [resolved.slug, gross, net]);

  const blurb = useMemo(
    () =>
      buildShareBlurb({
        label: resolved.label,
        bench: resolved.bench,
        gross,
        net,
        url: shareUrl,
      }),
    [resolved.label, resolved.bench, gross, net, shareUrl],
  );

  useEffect(() => {
    const next = snapshotPath(resolved.slug, { g: gross, n: net });
    window.history.replaceState(null, "", next);
  }, [resolved.slug, gross, net]);

  const copy = async (mode: "note" | "link") => {
    const text = mode === "link" ? shareUrl : blurb;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(mode);
      window.setTimeout(() => setCopied(null), 1800);
    } catch {
      /* clipboard may be blocked */
    }
  };

  return (
    <main className="min-h-screen bg-stone-50 flex flex-col">
      <SiteNav variant="marketing" />

      <section className="relative flex-1 flex flex-col justify-center px-5 py-10 sm:py-14">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.22]"
          style={{
            backgroundImage:
              "radial-gradient(ellipse 70% 40% at 50% -5%, rgb(125 211 252 / 0.35), transparent)",
          }}
          aria-hidden
        />

        <div className="relative mx-auto w-full max-w-md">
          {/* Brand first */}
          <div className="flex items-start gap-3 fade-in-up">
            <SikiMascot size={44} mood="wave" />
            <div className="min-w-0 pt-0.5">
              <p className="text-sm font-bold tracking-tight text-stone-950">SIKIZANA</p>
              <h1 className="mt-1 text-2xl sm:text-[1.75rem] font-bold text-stone-950 tracking-tight leading-tight">
                Are these margins normal?
              </h1>
            </div>
          </div>

          <p className="mt-3 text-sm text-stone-600 leading-snug fade-in-up fade-in-up-delay-1">
            Typical UK ranges for{" "}
            <label className="inline-flex items-baseline gap-1 font-semibold text-stone-900">
              <span className="sr-only">Sector</span>
              <select
                value={selectValue}
                onChange={(e) => router.push(snapshotPath(e.target.value, { g: gross, n: net }))}
                className="appearance-none bg-transparent border-b border-stone-400 border-dotted font-semibold text-stone-950 pr-4 cursor-pointer outline-none focus:border-sky-500"
                style={{
                  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' fill='none'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%2378716c' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`,
                  backgroundRepeat: "no-repeat",
                  backgroundPosition: "right center",
                }}
              >
                {SECTOR_OPTIONS.map((o) => (
                  <option key={o.slug} value={o.slug}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            {" "}— type yours to compare.
          </p>
          {resolved.bench.watchFor && (
            <p className="mt-2 text-[11px] leading-snug text-stone-500 fade-in-up fade-in-up-delay-1">
              <span className="font-semibold text-stone-600">What to watch · </span>
              {resolved.bench.watchFor}
            </p>
          )}

          {/* Zone B — proof strip, not a card */}
          <div className="mt-7 border-y border-stone-200 py-5 fade-in-up fade-in-up-delay-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-stone-400">
              Typical UK · indicative · {resolved.label}
            </p>
            <div className="mt-3 grid grid-cols-2 gap-6">
              <MarginCompare
                label="Gross"
                typicalPct={typicalGross}
                value={gross}
                input={grossInput}
                onChange={setGrossInput}
              />
              <MarginCompare
                label="Net"
                typicalPct={typicalNet}
                value={net}
                input={netInput}
                onChange={setNetInput}
                nearBand={3}
              />
            </div>
            <p className="mt-3 text-[10px] text-stone-400">Tick = typical · dot = yours</p>
          </div>

          {hasYours && (
            <div className="mt-5 flex gap-2.5 fade-in-up fade-in-up-delay-2">
              <SikiMascot size={28} mood="look" />
              <p className="text-sm leading-snug text-stone-700 pt-0.5">
                <span className="font-semibold text-sky-800">Siki&rsquo;s read · </span>
                {read}
              </p>
            </div>
          )}

          <div className="mt-7 flex flex-col gap-2.5 fade-in-up fade-in-up-delay-3">
            <button
              type="button"
              onClick={() => void copy("note")}
              className="inline-flex items-center justify-center rounded-xl bg-stone-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-stone-800 btn-press"
            >
              {copied === "note" ? "Copied — paste into WhatsApp or X" : "Copy note to share"}
            </button>
            <p className="text-center text-xs text-stone-500">
              <button
                type="button"
                onClick={() => void copy("link")}
                className="font-semibold text-stone-700 hover:text-stone-950 underline-offset-2 hover:underline"
              >
                {copied === "link" ? "Link copied" : "Copy link only"}
              </button>
              {" · "}
              <Link href={booksHref} className="font-semibold text-sky-700 hover:text-sky-800">
                Compare in your books →
              </Link>
            </p>
          </div>

          <p className="mt-6 text-[11px] leading-relaxed text-stone-400 text-center">
            Sanity check only — not a peer dataset.
          </p>
        </div>
      </section>
    </main>
  );
}
