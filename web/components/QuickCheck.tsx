"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { SikiMascot } from "@/components/SikiMascot";
import { SiteNav } from "@/components/SiteNav";
import { ThinkingTrace, type TraceStep } from "@/components/ThinkingTrace";
import { sectorCheckHref, type ResolvedSnapshot, type SectorId } from "@/lib/sector-benchmarks";
import { api } from "@/lib/api";

// ─── Types ──────────────────────────────────────────────────────────────────

type Phase = "thinking" | "benchmarks" | "findings" | "handoff";

interface QuickFinding {
  id: string;
  label: string;
  detail: string;
  tone: "info" | "watch" | "risk";
  evidence: string;
}

interface SectorRatio {
  id: string;
  label: string;
  typical: number;
  range: [number, number];
  unit: string;
  multiplier: number;
}

interface CheckResponseResolved {
  resolved: true;
  sector: string;
  sector_label: string;
  org_name: string;
  findings: QuickFinding[];
  source: "agent" | "rules";
  ratios: SectorRatio[];
  benchmarks: {
    gross_margin: number;
    net_margin: number;
    avg_receivables_days: number;
    avg_overdue_rate: number;
  };
  meta: {
    total_invoices: number;
    overdue_count: number;
    total_overdue_amount: number;
    ap_findings_count: number;
    gross_margin: number;
    net_margin: number;
  };
}

interface CheckResponseUnresolved {
  resolved: false;
  slug: string;
  suggestions: { id: string; label: string }[];
}

type CheckResponse = CheckResponseResolved | CheckResponseUnresolved;

const TONE_CLASSES: Record<QuickFinding["tone"], { badge: string; border: string }> = {
  info: { badge: "bg-sky-50 text-sky-700 border-sky-100", border: "border-l-sky-400" },
  watch: { badge: "bg-amber-50 text-amber-700 border-amber-100", border: "border-l-amber-400" },
  risk: { badge: "bg-rose-50 text-rose-700 border-rose-100", border: "border-l-rose-400" },
};

function buildTraceSteps(label: string): TraceStep[] {
  return [
    { text: `Loading ${label.toLowerCase()} demo books…`, durationMs: 400 },
    { text: "Running AP integrity scan…", durationMs: 600 },
    { text: "Comparing margins against sector benchmarks…", durationMs: 500 },
    { text: "Checking overdue exposure…", durationMs: 500 },
    { text: "Siki is writing up findings…", durationMs: 700 },
  ];
}

// ─── Sector Picker (shown when backend can't resolve the slug) ──────────────

function SectorPicker({
  slug,
  suggestions,
}: {
  slug: string;
  suggestions: { id: string; label: string }[];
}) {
  return (
    <main className="min-h-screen bg-stone-50 flex flex-col">
      <SiteNav variant="marketing" />
      <section className="flex-1 flex flex-col justify-center px-5 py-10">
        <div className="mx-auto w-full max-w-md">
          <div className="flex items-start gap-3 fade-in-up">
            <SikiMascot size={44} mood="look" />
            <div className="min-w-0 pt-0.5">
              <p className="text-sm font-bold tracking-tight text-stone-950">SIKIZANA</p>
              <h1 className="mt-1 text-2xl font-bold text-stone-950 tracking-tight leading-tight">
                Which sector is closest?
              </h1>
              <p className="mt-1 text-sm text-stone-500">
                I couldn&rsquo;t match &ldquo;{decodeURIComponent(slug)}&rdquo; to a sector — pick the closest and I&rsquo;ll run the check.
              </p>
            </div>
          </div>
          <div className="mt-7 grid grid-cols-2 gap-2.5 fade-in-up fade-in-up-delay-1">
            {suggestions.map((s) => (
              <Link
                key={s.id}
                href={`/check/${s.id}`}
                className="rounded-lg border border-stone-200 bg-white px-4 py-3 text-sm font-semibold text-stone-900 shadow-sm transition hover:border-sky-300 hover:shadow-md btn-press"
              >
                {s.label}
              </Link>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}

// ─── Yours comparison inputs ────────────────────────────────────────────────

function YoursComparison({
  benchmarks,
  ratios,
  sectorLabel,
}: {
  benchmarks: CheckResponseResolved["benchmarks"];
  ratios: SectorRatio[];
  sectorLabel: string;
}) {
  const [grossInput, setGrossInput] = useState("");
  const [netInput, setNetInput] = useState("");
  const [ratioInputs, setRatioInputs] = useState<Record<string, string>>({});

  const gross = parseNum(grossInput);
  const net = parseNum(netInput);

  const hasAnyInput = gross !== null || net !== null || Object.values(ratioInputs).some((v) => parseNum(v) !== null);

  return (
    <div className="border-y border-stone-200 py-5 fade-in-up">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-stone-400">
        Typical UK · {sectorLabel} · add yours to compare
      </p>

      {/* Core margins */}
      <div className="mt-3 grid grid-cols-2 gap-4">
        <BenchmarkInput
          label="Gross margin"
          typical={benchmarks.gross_margin}
          unit="%"
          value={grossInput}
          onChange={setGrossInput}
        />
        <BenchmarkInput
          label="Net margin"
          typical={benchmarks.net_margin}
          unit="%"
          value={netInput}
          onChange={setNetInput}
        />
      </div>

      {/* Sector-specific ratios */}
      {ratios.length > 0 && (
        <div className="mt-3 grid grid-cols-2 gap-4">
          {ratios.map((r) => (
            <BenchmarkInput
              key={r.id}
              label={r.label}
              typical={Math.round(r.typical * r.multiplier)}
              unit={r.unit}
              value={ratioInputs[r.id] ?? ""}
              onChange={(v) => setRatioInputs((prev) => ({ ...prev, [r.id]: v }))}
            />
          ))}
        </div>
      )}

      {/* Siki's read on their inputs */}
      {hasAnyInput && (
        <div className="mt-4 flex gap-2.5 fade-in-up">
          <SikiMascot size={24} mood="look" />
          <p className="text-xs leading-snug text-stone-600 pt-0.5">
            <span className="font-semibold text-sky-700">Siki&rsquo;s read · </span>
            {buildYoursRead(benchmarks, ratios, gross, net, ratioInputs, sectorLabel)}
          </p>
        </div>
      )}
    </div>
  );
}

function BenchmarkInput({
  label,
  typical,
  unit,
  value,
  onChange,
}: {
  label: string;
  typical: number;
  unit: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-[11px] font-semibold text-stone-500">{label}</span>
      <div className="mt-0.5 flex items-baseline gap-1.5">
        <span className="text-2xl font-bold tabular-nums text-stone-950 leading-none">
          {typical}{unit === "%" ? "%" : ""}
        </span>
        <span className="text-[10px] text-stone-400">typical</span>
      </div>
      <input
        inputMode="decimal"
        placeholder="Yours"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1.5 w-full border-0 border-b border-stone-300 bg-transparent px-0 py-1 text-sm font-bold tabular-nums text-stone-950 outline-none placeholder:text-stone-300 focus:border-sky-500"
      />
    </label>
  );
}

function parseNum(raw: string): number | null {
  if (!raw.trim()) return null;
  const n = Number(raw.replace(/%/g, "").trim());
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 10) / 10;
}

function buildYoursRead(
  benchmarks: CheckResponseResolved["benchmarks"],
  ratios: SectorRatio[],
  gross: number | null,
  net: number | null,
  ratioInputs: Record<string, string>,
  sectorLabel: string,
): string {
  const parts: string[] = [];

  if (gross !== null) {
    const diff = gross - benchmarks.gross_margin;
    if (Math.abs(diff) <= 4) parts.push("Gross is near typical.");
    else if (diff > 0) parts.push("Gross sits above typical — check what COGS includes.");
    else parts.push("Gross sits below typical — mix or COGS is the first look.");
  }
  if (net !== null) {
    const diff = net - benchmarks.net_margin;
    if (Math.abs(diff) <= 3) parts.push("Net is in the normal band.");
    else if (diff > 0) parts.push("Net looks healthy vs sector.");
    else parts.push("Net sits below typical — overheads usually explain it.");
  }
  for (const r of ratios) {
    const val = parseNum(ratioInputs[r.id] ?? "");
    if (val === null) continue;
    const typicalVal = Math.round(r.typical * r.multiplier);
    const [lo, hi] = [Math.round(r.range[0] * r.multiplier), Math.round(r.range[1] * r.multiplier)];
    if (val >= lo && val <= hi) {
      parts.push(`${r.label.split(" ")[0]} is within the typical ${lo}–${hi}${r.unit} band.`);
    } else if (val > hi) {
      parts.push(`${r.label.split(" ")[0]} (${val}${r.unit}) is above the typical ${hi}${r.unit} ceiling — worth investigating.`);
    } else {
      parts.push(`${r.label.split(" ")[0]} (${val}${r.unit}) is below typical ${lo}${r.unit} — lean, but check capacity.`);
    }
  }

  return parts.length > 0 ? parts.join(" ") : `In the typical band for ${sectorLabel.toLowerCase()}.`;
}

// ─── Main Component ─────────────────────────────────────────────────────────

/**
 * QuickCheck — the agentic lead magnet.
 *
 * Accepts a raw slug (may be unknown). Fetches /api/check/{slug} which
 * resolves the sector dynamically. If unresolved, shows a picker.
 * If resolved: instant benchmarks + "yours" inputs, then deeper findings
 * from real AP scan + optional LLM enrichment.
 */
export function QuickCheck({
  slug,
  hint,
}: {
  slug: string;
  /** Optional local hint from known aliases — used for initial label. */
  hint: ResolvedSnapshot | null;
}) {
  const [phase, setPhase] = useState<Phase>("thinking");
  const [data, setData] = useState<CheckResponseResolved | null>(null);
  const [unresolved, setUnresolved] = useState<CheckResponseUnresolved | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [reviewed, setReviewed] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  // Track fetch timing for honest trace
  const fetchStarted = useRef(Date.now());
  const [apiDone, setApiDone] = useState(false);
  const [minTraceElapsed, setMinTraceElapsed] = useState(false);

  // Minimum trace time: 800ms (enough to show 2 steps)
  useEffect(() => {
    const t = setTimeout(() => setMinTraceElapsed(true), 800);
    return () => clearTimeout(t);
  }, []);

  // Fetch from backend
  useEffect(() => {
    let cancelled = false;

    async function fetchCheck() {
      try {
        const response = await api.get<CheckResponse>(`/api/check/${encodeURIComponent(slug)}`);
        if (cancelled) return;

        if (!response.resolved) {
          setUnresolved(response);
        } else {
          setData(response);
        }
      } catch {
        if (cancelled) return;
        setError("Siki couldn't complete the check right now.");
      } finally {
        if (!cancelled) setApiDone(true);
      }
    }

    void fetchCheck();
    return () => { cancelled = true; };
  }, [slug]);

  // Transition from thinking → benchmarks once both conditions met
  const shouldReveal = apiDone && minTraceElapsed;
  const forceTraceComplete = apiDone; // signal trace to finish early if API is fast

  const onTraceComplete = useCallback(() => {
    if (data) setPhase("benchmarks");
    else if (error) setPhase("benchmarks");
    // If unresolved, the picker renders instead — no phase transition needed
  }, [data, error]);

  // Auto-transition when both ready
  useEffect(() => {
    if (shouldReveal && phase === "thinking") {
      onTraceComplete();
    }
  }, [shouldReveal, phase, onTraceComplete]);

  // If unresolved, render picker immediately once API responds
  if (unresolved) {
    return <SectorPicker slug={unresolved.slug} suggestions={unresolved.suggestions} />;
  }

  const sectorLabel = data?.sector_label ?? hint?.label ?? decodeURIComponent(slug);
  const booksHref = data ? sectorCheckHref(data.sector as SectorId, { connect: true }) : "/books?flow=check&connect=1";
  const demoHref = data ? sectorCheckHref(data.sector as SectorId) : "/books?flow=check";
  const shareUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/check/${slug}`
      : `https://sikizana.persidian.com/check/${slug}`;

  const [copied, setCopied] = useState(false);
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* blocked */ }
  };

  const toggleExpand = (id: string) => setExpandedId((prev) => (prev === id ? null : id));

  const markReviewed = (id: string) => {
    setReviewed((prev) => new Set(prev).add(id));
    if (data && reviewed.size + 1 >= data.findings.length) {
      setTimeout(() => setPhase("handoff"), 400);
    }
  };

  const showFindings = () => setPhase("findings");
  const traceSteps = buildTraceSteps(sectorLabel);

  return (
    <main className="min-h-screen bg-stone-50 flex flex-col">
      <SiteNav variant="marketing" />

      <section className="relative flex-1 flex flex-col justify-center px-5 py-10 sm:py-14">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.18]"
          style={{
            backgroundImage:
              "radial-gradient(ellipse 60% 35% at 50% -5%, rgb(125 211 252 / 0.4), transparent)",
          }}
          aria-hidden
        />

        <div className="relative mx-auto w-full max-w-lg">
          {/* Brand + headline */}
          <div className="flex items-start gap-3 fade-in-up">
            <SikiMascot
              size={44}
              mood={phase === "thinking" ? "look" : phase === "handoff" ? "wave" : "idle"}
            />
            <div className="min-w-0 pt-0.5">
              <p className="text-sm font-bold tracking-tight text-stone-950">SIKIZANA</p>
              <h1 className="mt-1 text-2xl sm:text-[1.75rem] font-bold text-stone-950 tracking-tight leading-tight">
                {phase === "thinking"
                  ? `Checking ${sectorLabel.toLowerCase()}…`
                  : phase === "benchmarks"
                    ? `${sectorLabel} benchmarks`
                    : phase === "findings"
                      ? `Siki's ${sectorLabel.toLowerCase()} check`
                      : "Ready to check your books"}
              </h1>
            </div>
          </div>

          {/* ─── Phase 1: Thinking ─── */}
          {phase === "thinking" && (
            <div className="mt-7 fade-in-up fade-in-up-delay-1">
              <ThinkingTrace
                steps={traceSteps}
                forceComplete={forceTraceComplete}
                onComplete={onTraceComplete}
              />
            </div>
          )}

          {/* ─── Phase 2: Benchmarks + Yours (instant value) ─── */}
          {phase !== "thinking" && data && (
            <>
              <div className="mt-6">
                <YoursComparison
                  benchmarks={data.benchmarks}
                  ratios={data.ratios}
                  sectorLabel={data.sector_label}
                />
              </div>

              {/* Prompt to see deeper findings */}
              {phase === "benchmarks" && (
                <div className="mt-5 fade-in-up fade-in-up-delay-1">
                  <button
                    type="button"
                    onClick={showFindings}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-stone-200 bg-white px-5 py-3 text-sm font-semibold text-stone-900 shadow-sm transition hover:border-sky-300 hover:shadow-md btn-press"
                  >
                    <span className="text-sky-600">↓</span>
                    See what Siki found in sample {sectorLabel.toLowerCase()} books
                    {data.meta.ap_findings_count > 0 && (
                      <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-700">
                        {data.meta.ap_findings_count} risk{data.meta.ap_findings_count !== 1 ? "s" : ""}
                      </span>
                    )}
                  </button>
                </div>
              )}
            </>
          )}

          {/* ─── Phase 3: Findings (from real API) ─── */}
          {(phase === "findings" || phase === "handoff") && data && (
            <div className="mt-5 space-y-3 fade-in-up">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-stone-400">
                {data.findings.length} findings · {data.org_name}
                {data.source === "agent" ? " · Siki's voice" : " · demo books"}
              </p>

              {data.findings.map((f) => {
                const tone = (["info", "watch", "risk"].includes(f.tone) ? f.tone : "info") as QuickFinding["tone"];
                const { badge, border } = TONE_CLASSES[tone];
                const isExpanded = expandedId === f.id;
                const isReviewed = reviewed.has(f.id);

                return (
                  <div
                    key={f.id}
                    className={`rounded-lg border border-stone-200 bg-white border-l-[3px] ${border} overflow-hidden transition-shadow duration-200 ${
                      isExpanded ? "shadow-md" : "shadow-sm"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => toggleExpand(f.id)}
                      aria-expanded={isExpanded}
                      className="flex w-full items-start justify-between gap-3 px-4 py-3.5 text-left"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-stone-900">{f.label}</p>
                        <p className="mt-0.5 text-xs text-stone-500 leading-snug">{f.detail}</p>
                      </div>
                      <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${badge}`}>
                        {isReviewed ? "Reviewed ✓" : tone === "risk" ? "Review" : "View"}
                      </span>
                    </button>

                    {isExpanded && (
                      <div className="border-t border-stone-100 px-4 py-3 bg-stone-50/50 fade-in-up">
                        <p className="text-xs text-stone-600 leading-relaxed">{f.evidence}</p>
                        {!isReviewed && (
                          <button
                            type="button"
                            onClick={() => markReviewed(f.id)}
                            className="mt-2.5 inline-flex items-center gap-1.5 rounded-md bg-stone-900 px-3 py-1.5 text-[11px] font-semibold text-white transition hover:bg-stone-700"
                          >
                            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                            Mark reviewed
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* ─── Phase 4: Handoff ─── */}
          {phase === "handoff" && (
            <div className="mt-6 space-y-3 fade-in-up">
              <div className="rounded-xl border border-sky-200 bg-gradient-to-br from-sky-50/60 to-white p-5">
                <p className="text-sm font-semibold text-stone-900">
                  That was demo data. Imagine this on <em>your</em> books.
                </p>
                <p className="mt-1.5 text-xs text-stone-500 leading-relaxed">
                  Connect Xero and Siki runs the same scan on your actual invoices,
                  payments, and P&L — real numbers, real risks, same format.
                </p>
                <Link
                  href={booksHref}
                  className="mt-4 inline-flex w-full items-center justify-center rounded-xl bg-sky-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-sky-700 btn-press"
                >
                  Connect Xero — check my books
                </Link>
                <div className="mt-2.5 flex items-center justify-center gap-3 text-xs">
                  <Link href={demoHref} className="font-semibold text-stone-600 hover:text-stone-900 underline-offset-2 hover:underline">
                    Try with sample data
                  </Link>
                  <span className="text-stone-300">·</span>
                  <button type="button" onClick={() => void copyLink()} className="font-semibold text-stone-600 hover:text-stone-900 underline-offset-2 hover:underline">
                    {copied ? "Link copied ✓" : "Share this check"}
                  </button>
                </div>
              </div>
              <p className="text-center text-[10px] text-stone-400">
                Read-only · Human-in-the-loop · Your data never leaves your Xero account
              </p>
            </div>
          )}

          {/* ─── CTA (persistent during benchmarks and findings) ─── */}
          {(phase === "findings") && (
            <div className="mt-6 flex flex-col items-center gap-2.5 fade-in-up fade-in-up-delay-2">
              <Link
                href={booksHref}
                className="inline-flex w-full items-center justify-center rounded-xl bg-stone-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-stone-800 btn-press"
              >
                Connect Xero — Siki checks your actual books
              </Link>
              <p className="text-center text-xs text-stone-500">
                <Link href={demoHref} className="font-semibold text-stone-700 hover:text-stone-950">
                  Try sample books first
                </Link>
                {" · "}
                <button type="button" onClick={() => void copyLink()} className="font-semibold text-stone-700 hover:text-stone-950">
                  {copied ? "Copied ✓" : "Share this check"}
                </button>
              </p>
            </div>
          )}

          {/* Error state */}
          {error && phase !== "thinking" && (
            <div className="mt-6 fade-in-up">
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                <p className="text-xs text-amber-800">{error}</p>
              </div>
              <Link
                href="/books?flow=check"
                className="mt-3 inline-flex w-full items-center justify-center rounded-xl bg-stone-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-stone-800 btn-press"
              >
                Try sample books instead
              </Link>
            </div>
          )}

          {/* Trust line */}
          <p className="mt-6 text-[10px] leading-relaxed text-stone-400 text-center">
            Benchmarks are typical UK ranges — not a peer dataset.
            {phase !== "thinking" && " Siki remembers your sector for next time."}
          </p>
        </div>
      </section>
    </main>
  );
}
