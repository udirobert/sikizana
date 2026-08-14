"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { SikiMascot } from "@/components/SikiMascot";
import { SiteNav } from "@/components/SiteNav";
import { ThinkingTrace, type TraceStep } from "@/components/ThinkingTrace";
import { SectorTipsCard } from "@/components/SectorTipsCard";
import { sectorCheckHref, type ResolvedSnapshot, type SectorId } from "@/lib/sector-benchmarks";
import { getSectorTips } from "@/lib/sector-tips";
import { api } from "@/lib/api";

// ─── Types ──────────────────────────────────────────────────────────────────

type Phase = "ready" | "scanning" | "findings" | "handoff";

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

interface BenchmarksResponse {
  resolved: true;
  sector: string;
  sector_label: string;
  benchmarks: {
    gross_margin: number;
    net_margin: number;
    avg_receivables_days: number;
    avg_overdue_rate: number;
  };
  ratios: SectorRatio[];
}

interface BenchmarksUnresolved {
  resolved: false;
  slug: string;
  suggestions: { id: string; label: string }[];
}

type BenchmarksResult = BenchmarksResponse | BenchmarksUnresolved;

interface ScanResponse {
  resolved: true;
  sector: string;
  sector_label: string;
  org_name: string;
  findings: QuickFinding[];
  source: "agent" | "rules";
  ratios: SectorRatio[];
  benchmarks: BenchmarksResponse["benchmarks"];
  meta: {
    total_invoices: number;
    overdue_count: number;
    total_overdue_amount: number;
    ap_findings_count: number;
    gross_margin: number;
    net_margin: number;
  };
}

const TONE_CLASSES: Record<QuickFinding["tone"], { badge: string; border: string }> = {
  info: { badge: "bg-sky-50 text-sky-700 border-sky-100", border: "border-l-sky-400" },
  watch: { badge: "bg-amber-50 text-amber-700 border-amber-100", border: "border-l-amber-400" },
  risk: { badge: "bg-rose-50 text-rose-700 border-rose-100", border: "border-l-rose-400" },
};

function buildTraceSteps(label: string): TraceStep[] {
  return [
    { text: `Opening the ${label.toLowerCase()} demo books…`, durationMs: 400 },
    { text: "Scanning for duplicate bills and payment anomalies…", durationMs: 600 },
    { text: `Checking how your margins compare to typical ${label.toLowerCase()} ranges…`, durationMs: 500 },
    { text: "Looking at who's overdue and by how much…", durationMs: 500 },
    { text: "Putting it all together for you…", durationMs: 700 },
  ];
}

// ─── Sector Picker ──────────────────────────────────────────────────────────

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
  benchmarks: BenchmarksResponse["benchmarks"];
  ratios: SectorRatio[];
  sectorLabel: string;
}) {
  const [grossInput, setGrossInput] = useState("");
  const [netInput, setNetInput] = useState("");
  const [ratioInputs, setRatioInputs] = useState<Record<string, string>>({});

  const gross = parseNum(grossInput);
  const net = parseNum(netInput);

  const hasAnyInput = gross !== null || net !== null || Object.values(ratioInputs).some((v) => parseNum(v) !== null);

  const fillExample = () => {
    setGrossInput(String(benchmarks.gross_margin));
    setNetInput(String(benchmarks.net_margin));
    setRatioInputs((prev) => ({
      ...prev,
      ...Object.fromEntries(
        ratios.map((r) => [r.id, String(Math.round(r.typical * r.multiplier))])
      ),
    }));
  };

  const clearNumbers = () => {
    setGrossInput("");
    setNetInput("");
    setRatioInputs({});
  };

  return (
    <div className="fade-in-up">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-stone-400">
            Typical UK · {sectorLabel}
          </p>
          <p className="mt-0.5 text-xs text-stone-500">
            Add your {sectorLabel.toLowerCase()} numbers — I&rsquo;ll compare as you type.
          </p>
        </div>
        <button
          type="button"
          onClick={fillExample}
          className="mt-0.5 shrink-0 whitespace-nowrap text-[11px] font-semibold text-sky-700 underline-offset-2 transition hover:text-sky-800 hover:underline"
        >
          Try an example →
        </button>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <BenchmarkCard
          label="Gross margin"
          typical={benchmarks.gross_margin}
          unit="%"
          value={grossInput}
          onChange={setGrossInput}
        />
        <BenchmarkCard
          label="Net margin"
          typical={benchmarks.net_margin}
          unit="%"
          value={netInput}
          onChange={setNetInput}
        />
        {ratios.map((r) => (
          <BenchmarkCard
            key={r.id}
            label={r.label}
            typical={Math.round(r.typical * r.multiplier)}
            unit={r.unit}
            range={[
              Math.round(r.range[0] * r.multiplier),
              Math.round(r.range[1] * r.multiplier),
            ]}
            value={ratioInputs[r.id] ?? ""}
            onChange={(v) => setRatioInputs((prev) => ({ ...prev, [r.id]: v }))}
          />
        ))}
      </div>

      {hasAnyInput && (
        <div className="mt-4 rounded-xl border border-sky-200 bg-gradient-to-br from-sky-50/70 to-white p-4 fade-in-up">
          <div className="flex items-start gap-2.5">
            <SikiMascot size={30} mood="look" />
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-sky-700">
                Siki&rsquo;s read
              </p>
              <p className="mt-1 text-xs leading-relaxed text-stone-700">
                {buildYoursRead(benchmarks, ratios, gross, net, ratioInputs, sectorLabel)}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={clearNumbers}
            className="mt-2 text-[10px] font-semibold text-stone-400 underline decoration-stone-300 underline-offset-2 transition hover:text-stone-600"
          >
            Clear my numbers
          </button>
        </div>
      )}
    </div>
  );
}

type MetricTone = "band" | "above" | "below";

const READ_TONES: Record<MetricTone, { text: string; dot: string }> = {
  band: { text: "text-emerald-700", dot: "bg-emerald-500" },
  above: { text: "text-sky-700", dot: "bg-sky-500" },
  below: { text: "text-amber-700", dot: "bg-amber-500" },
};

/** Per-field plain-English read with a tone for colouring. */
function metricRead(opts: {
  label: string;
  typical: number;
  value: number;
  unit: string;
  range?: [number, number];
}): { text: string; tone: MetricTone } {
  const { label, typical, value, unit, range } = opts;
  const unitSuffix = unit === "%" ? "%" : unit;
  const short = label.split(" ")[0];

  if (range) {
    const [lo, hi] = range;
    if (value >= lo && value <= hi) return { tone: "band", text: `In the typical ${lo}–${hi}${unitSuffix} band.` };
    if (value > hi) return { tone: "above", text: `${short} (${value}${unitSuffix}) sits above the typical ${hi}${unitSuffix} ceiling — worth investigating.` };
    return { tone: "below", text: `${short} (${value}${unitSuffix}) sits below typical ${lo}${unitSuffix} — lean, but check capacity.` };
  }

  const diff = value - typical;
  if (Math.abs(diff) <= 4) return { tone: "band", text: `In the typical band (around ${typical}${unitSuffix}).` };
  if (diff > 0) return { tone: "above", text: `Above typical (${typical}${unitSuffix}) — check what&rsquo;s driving it.` };
  return {
    tone: "below",
    text: `Below typical (${typical}${unitSuffix}) — ${label.toLowerCase().includes("net") ? "overheads usually explain it" : "check what&rsquo;s included first"}.`,
  };
}

/** Thin crisp bar (Zone B: no dither) showing where "yours" sits vs typical. */
function CompareBar({
  typical,
  yours,
  range,
  tone,
}: {
  typical: number;
  yours: number | null;
  range?: [number, number];
  tone: MetricTone | null;
}) {
  const cap = Math.max(typical * 4, range ? range[1] * 1.3 : 0, yours ?? 0, 100);
  const pos = (v: number) => Math.min(100, Math.max(0, (v / cap) * 100));
  const dotColor = tone ? READ_TONES[tone].dot : "bg-stone-400";

  return (
    <div className="relative mt-2 h-1 rounded-full bg-stone-100" aria-hidden>
      {range && (
        <span
          className="absolute top-0 h-full rounded-full bg-stone-200"
          style={{ left: `${pos(range[0])}%`, width: `${Math.max(0, pos(range[1]) - pos(range[0]))}%` }}
        />
      )}
      <span
        className="absolute top-1/2 h-2 w-0.5 -translate-y-1/2 rounded bg-stone-400 ring-1 ring-white"
        style={{ left: `${pos(typical)}%` }}
      />
      {yours !== null && (
        <span
          className={`absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-white ${dotColor} transition-colors duration-150`}
          style={{ left: `${pos(yours)}%` }}
        />
      )}
    </div>
  );
}

function BenchmarkCard({
  label,
  typical,
  unit,
  range,
  value,
  onChange,
}: {
  label: string;
  typical: number;
  unit: string;
  range?: [number, number];
  value: string;
  onChange: (v: string) => void;
}) {
  const parsed = parseNum(value);
  const read = parsed !== null ? metricRead({ label, typical, value: parsed, unit, range }) : null;

  return (
    <div className="rounded-xl border border-stone-200 bg-white px-3.5 py-3 transition-shadow hover:shadow-sm">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] font-semibold text-stone-500">{label}</span>
        <span className="text-[10px] text-stone-400">
          UK typical{" "}
          <span className="ml-0.5 font-bold tabular-nums text-stone-700">
            {typical}{unit === "%" ? "%" : unit}
          </span>
        </span>
      </div>

      <div className="relative mt-2">
        <input
          inputMode="decimal"
          placeholder={`Your ${unit === "%" ? "%" : unit}…`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-lg border border-stone-200 bg-stone-50 px-2.5 py-1.5 pr-8 text-right text-sm font-bold tabular-nums text-stone-950 outline-none transition placeholder:font-normal placeholder:text-stone-300 focus:border-sky-400 focus:bg-white focus:ring-2 focus:ring-sky-100"
        />
        {unit === "%" && (
          <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-stone-400">
            %
          </span>
        )}
      </div>

      <CompareBar typical={typical} yours={parsed} range={range} tone={read ? read.tone : null} />

      {read && (
        <p className={`mt-1.5 text-[11px] font-medium leading-snug ${READ_TONES[read.tone].text}`}>
          {read.text}
        </p>
      )}
    </div>
  );
}

function parseNum(raw: string): number | null {
  if (!raw.trim()) return null;
  const n = Number(raw.replace(/%/g, "").trim());
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 10) / 10;
}

function buildYoursRead(
  benchmarks: BenchmarksResponse["benchmarks"],
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
 * Page loads in "ready" state with benchmarks + yours inputs (lightweight
 * /benchmarks endpoint, cached 24h). The deeper scan (AP integrity + LLM)
 * only fires when the user explicitly clicks "Run Siki's check".
 *
 * Zero API cost if the visitor just reads benchmarks and leaves.
 */
export function QuickCheck({
  slug,
  hint,
}: {
  slug: string;
  hint: ResolvedSnapshot | null;
}) {
  const [phase, setPhase] = useState<Phase>("ready");
  const [benchData, setBenchData] = useState<BenchmarksResponse | null>(null);
  const [scanData, setScanData] = useState<ScanResponse | null>(null);
  const [unresolved, setUnresolved] = useState<BenchmarksUnresolved | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [reviewed, setReviewed] = useState<Set<string>>(new Set());
  const [scanError, setScanError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Fetch lightweight benchmarks on mount (static, cached 24h, no LLM)
  useEffect(() => {
    let cancelled = false;
    async function fetchBenchmarks() {
      try {
        const res = await api.get<BenchmarksResult>(`/api/check/${encodeURIComponent(slug)}/benchmarks`);
        if (cancelled) return;
        if (!res.resolved) {
          setUnresolved(res);
        } else {
          setBenchData(res);
        }
      } catch {
        // If benchmarks fail, we still show the page with hint data
        if (cancelled) return;
      }
    }
    void fetchBenchmarks();
    return () => { cancelled = true; };
  }, [slug]);

  // Scan trigger (user-initiated)
  const [apiDone, setApiDone] = useState(false);
  const forceTraceComplete = apiDone;

  const runScan = useCallback(() => {
    setPhase("scanning");
    setApiDone(false);
    setScanError(null);

    async function doScan() {
      try {
        const res = await api.get<ScanResponse>(`/api/check/${encodeURIComponent(slug)}`);
        setScanData(res);
      } catch {
        setScanError("Siki couldn't complete the scan right now. Try again or explore sample books.");
      } finally {
        setApiDone(true);
      }
    }
    void doScan();
  }, [slug]);

  const onTraceComplete = useCallback(() => {
    setPhase("findings");
  }, []);

  // If unresolved, render picker
  if (unresolved) {
    return <SectorPicker slug={unresolved.slug} suggestions={unresolved.suggestions} />;
  }

  const sectorLabel = benchData?.sector_label ?? hint?.label ?? decodeURIComponent(slug).replace(/[-_]/g, " ");
  const resolvedSector = benchData?.sector ?? hint?.id;
  const booksHref = resolvedSector ? sectorCheckHref(resolvedSector as SectorId, { connect: true }) : "/books?flow=check&connect=1";
  const demoHref = resolvedSector ? sectorCheckHref(resolvedSector as SectorId) : "/books?flow=check";
  const handoffTips = resolvedSector
    ? getSectorTips(resolvedSector as SectorId, "post-findings")
    : [];
  const shareUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/check/${slug}`
      : `https://sikizana.persidian.com/check/${slug}`;

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
    if (scanData && reviewed.size + 1 >= scanData.findings.length) {
      setTimeout(() => setPhase("handoff"), 400);
    }
  };

  const traceSteps = buildTraceSteps(sectorLabel);
  const watchTip = hint?.bench?.watchFor;

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
              mood={phase === "scanning" ? "look" : phase === "handoff" ? "wave" : "idle"}
            />
            <div className="min-w-0 pt-0.5">
              <p className="text-sm font-bold tracking-tight text-stone-950">SIKIZANA</p>
              <h1 className="mt-1 text-2xl sm:text-[1.75rem] font-bold text-stone-950 tracking-tight leading-tight">
                {phase === "scanning"
                  ? `Checking ${sectorLabel.toLowerCase()}…`
                  : phase === "findings" || phase === "handoff"
                    ? `Siki's ${sectorLabel.toLowerCase()} check`
                    : `${sectorLabel} benchmarks`}
              </h1>
              {phase === "ready" && (
                <p className="mt-1 text-xs text-stone-500">
                  Instant sector check — no signup needed. Add your numbers below to compare.
                </p>
              )}
              {phase === "scanning" && (
                <p className="mt-1 text-xs text-stone-500">
                  Give me a moment — I&apos;m reading the books carefully.
                </p>
              )}
            </div>
          </div>

          {/* ─── Ready state: Benchmarks + Yours (instant, no scan needed) ─── */}
          {phase === "ready" && benchData && (
            <>
              {/* Siki persona guidance card */}
              <div className="mt-5 flex items-start gap-2.5 rounded-2xl border border-stone-200 bg-white p-4 fade-in-up">
                <SikiMascot size={30} mood="look" />
                <div className="min-w-0">
                  <p className="text-xs text-stone-700">
                    <span className="font-semibold text-sky-700">
                      Here&rsquo;s how a typical UK {sectorLabel.toLowerCase()} looks.
                    </span>{" "}
                    Add your numbers and I&rsquo;ll tell you exactly where you stand.
                  </p>
                  {watchTip && (
                    <p className="mt-1.5 text-[11px] leading-snug text-stone-500">
                      <span className="font-semibold text-stone-600">What to watch: </span>
                      {watchTip}
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-4">
                <YoursComparison
                  benchmarks={benchData.benchmarks}
                  ratios={benchData.ratios}
                  sectorLabel={benchData.sector_label}
                />
              </div>

              {/* CTA to run deeper scan */}
              <div className="mt-6 space-y-3 fade-in-up fade-in-up-delay-1">
                <button
                  type="button"
                  onClick={runScan}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-stone-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-stone-800 btn-press"
                >
                  Run Siki&rsquo;s check on sample books
                </button>
                <p className="text-center text-xs text-stone-500">
                  Siki scans demo {sectorLabel.toLowerCase()} books for duplicates, overdue invoices, and payment risks.
                </p>
                <p className="text-center text-xs">
                  <Link href={demoHref} className="font-semibold text-stone-600 hover:text-stone-900 underline underline-offset-2">
                    Skip the comparison — see what the check finds on sample books →
                  </Link>
                </p>
              </div>
            </>
          )}

          {/* Loading state for benchmarks */}
          {phase === "ready" && !benchData && (
            <div className="mt-8 flex items-center gap-2 text-sm text-stone-400 fade-in-up">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sky-400 opacity-60" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-sky-500" />
              </span>
              Loading benchmarks…
            </div>
          )}

          {/* ─── Scanning: Thinking trace (user-initiated) ─── */}
          {phase === "scanning" && (
            <div className="mt-7 fade-in-up">
              <ThinkingTrace
                steps={traceSteps}
                forceComplete={forceTraceComplete}
                onComplete={onTraceComplete}
              />
            </div>
          )}

          {/* ─── Findings (from real scan) ─── */}
          {(phase === "findings" || phase === "handoff") && scanData && (
            <div className="mt-6 space-y-3 fade-in-up">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-stone-400">
                {scanData.findings.length} findings · {scanData.org_name}
                {scanData.source === "agent" ? " · Siki's voice" : " · demo books"}
              </p>

              {scanData.findings.map((f) => {
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

          {/* Scan error */}
          {(phase === "findings") && scanError && (
            <div className="mt-6 fade-in-up">
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                <p className="text-xs text-amber-800">{scanError}</p>
              </div>
            </div>
          )}

          {/* ─── Handoff ─── */}
          {phase === "handoff" && (
            <div className="mt-6 space-y-3 fade-in-up">
              {handoffTips.length > 0 && (
                <SectorTipsCard tips={handoffTips} sectorLabel={sectorLabel} />
              )}
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

          {/* ─── CTA during findings phase ─── */}
          {phase === "findings" && !scanError && (
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

          {/* Trust line */}
          <p className="mt-6 text-[10px] leading-relaxed text-stone-400 text-center">
            Benchmarks are typical UK ranges — not a peer dataset.
            {phase !== "ready" && phase !== "scanning" && " Siki remembers your sector for next time."}
          </p>
        </div>
      </section>
    </main>
  );
}
