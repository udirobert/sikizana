"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { BenchmarkCompareBar } from "@/components/BenchmarkCompareBar";
import { SikiMascot } from "@/components/SikiMascot";
import { SiteNav } from "@/components/SiteNav";
import { ThinkingTrace, type TraceStep } from "@/components/ThinkingTrace";
import { SectorTipsCard } from "@/components/SectorTipsCard";
import { sectorCheckHref, type ResolvedSnapshot, type SectorId } from "@/lib/sector-benchmarks";
import {
  compareMetricTone,
  METRIC_STATUS_LABEL,
  METRIC_TONE_CLASSES,
  synthesizeBenchmarkRead,
  type BenchmarkMetricInput,
} from "@/lib/benchmark-compare";
import {
  buildCheckShareBlurb,
  buildCheckSharePath,
  buildCheckShareQuery,
  researchLabelFromSlug,
  type CheckShareState,
} from "@/lib/check-share";
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
  slug,
  researchLabel,
  initialShare,
}: {
  benchmarks: BenchmarksResponse["benchmarks"];
  ratios: SectorRatio[];
  sectorLabel: string;
  slug: string;
  researchLabel: string;
  initialShare: CheckShareState;
}) {
  const [grossInput, setGrossInput] = useState(initialShare.g != null ? String(initialShare.g) : "");
  const [netInput, setNetInput] = useState(initialShare.n != null ? String(initialShare.n) : "");
  const [ratioInputs, setRatioInputs] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      ratios.map((r) => [r.id, initialShare.ratios[r.id] != null ? String(initialShare.ratios[r.id]) : ""]),
    ),
  );
  const [include, setInclude] = useState<Set<string>>(initialShare.include);
  const [shareOpen, setShareOpen] = useState(initialShare.inbound);
  const [copied, setCopied] = useState<"link" | "note" | null>(null);
  const [allowRead, setAllowRead] = useState(
    !initialShare.inbound || initialShare.include.has("read"),
  );

  const gross = parseNum(grossInput);
  const net = parseNum(netInput);
  const ratioValues: Record<string, number | null> = Object.fromEntries(
    ratios.map((r) => [r.id, parseNum(ratioInputs[r.id] ?? "")]),
  );

  const setGross = (v: string) => {
    setAllowRead(true);
    setGrossInput(v);
  };
  const setNet = (v: string) => {
    setAllowRead(true);
    setNetInput(v);
  };
  const setRatio = (id: string, v: string) => {
    setAllowRead(true);
    setRatioInputs((prev) => ({ ...prev, [id]: v }));
  };

  const fillExample = () => {
    setAllowRead(true);
    setGrossInput(String(benchmarks.gross_margin));
    setNetInput(String(benchmarks.net_margin));
    setRatioInputs(
      Object.fromEntries(ratios.map((r) => [r.id, String(Math.round(r.typical * r.multiplier))])),
    );
  };

  const clearNumbers = () => {
    setGrossInput("");
    setNetInput("");
    setRatioInputs({});
    setInclude(new Set());
    setShareOpen(false);
  };

  const metricInputs: BenchmarkMetricInput[] = [
    { shortLabel: "Gross", typical: benchmarks.gross_margin, value: gross },
    { shortLabel: "Net", typical: benchmarks.net_margin, value: net, nearBand: 3 },
    ...ratios.map((r) => ({
      shortLabel: r.label.split(" ")[0],
      typical: Math.round(r.typical * r.multiplier),
      value: ratioValues[r.id] ?? null,
      range: [
        Math.round(r.range[0] * r.multiplier),
        Math.round(r.range[1] * r.multiplier),
      ] as [number, number],
    })),
  ];
  const sikiRead = synthesizeBenchmarkRead(metricInputs, sectorLabel);

  const artefactMetrics: BenchmarkMetricInput[] = metricInputs.filter((m, i) => {
    if (i === 0) return include.has("g") && m.value != null;
    if (i === 1) return include.has("n") && m.value != null;
    const id = ratios[i - 2]?.id;
    return Boolean(id && include.has(id) && m.value != null);
  });
  const artefactRead = include.has("read")
    ? synthesizeBenchmarkRead(artefactMetrics, sectorLabel)
    : null;

  const shareChoices: { id: string; label: string; enabled: boolean }[] = [
    { id: "g", label: "Gross", enabled: gross != null },
    { id: "n", label: "Net", enabled: net != null },
    ...ratios.map((r) => ({
      id: r.id,
      label: r.label.split(" ")[0],
      enabled: ratioValues[r.id] != null,
    })),
    { id: "read", label: "Siki's read", enabled: Boolean(sikiRead) },
  ];

  const openShare = () => {
    setInclude(
      new Set([
        ...(gross != null ? ["g"] : []),
        ...(net != null ? ["n"] : []),
        ...ratios.filter((r) => ratioValues[r.id] != null).map((r) => r.id),
        ...(sikiRead ? ["read"] : []),
      ]),
    );
    setShareOpen(true);
  };

  const toggleInclude = (id: string) => {
    setInclude((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const shareQuery = buildCheckShareQuery({
    g: gross,
    n: net,
    ratioValues,
    include,
  });
  const sharePath = buildCheckSharePath(slug, shareQuery);
  const shareUrl =
    typeof window !== "undefined" ? `${window.location.origin}${sharePath}` : `https://sikizana.persidian.com${sharePath}`;

  const blurbLines: string[] = [];
  if (include.has("g") && gross != null) blurbLines.push(`gross ${gross}%`);
  if (include.has("n") && net != null) blurbLines.push(`net ${net}%`);
  for (const r of ratios) {
    const val = ratioValues[r.id];
    if (include.has(r.id) && val != null) blurbLines.push(`${r.label.split(" ")[0].toLowerCase()} ${val}${r.unit}`);
  }
  const blurb = buildCheckShareBlurb({
    researchLabel,
    sectorLabel,
    lines: blurbLines,
    read: artefactRead,
    includeRead: include.has("read"),
    url: shareUrl,
  });

  const copyShare = async (mode: "link" | "note") => {
    try {
      await navigator.clipboard.writeText(mode === "link" ? shareUrl : blurb);
      setCopied(mode);
      window.setTimeout(() => setCopied(null), 1800);
    } catch {
      /* blocked */
    }
  };

  const hasAnyInput = gross != null || net != null || Object.values(ratioValues).some((v) => v != null);

  return (
    <div className="fade-in-up">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-stone-400">
          Typical UK · {sectorLabel}
        </p>
        <button
          type="button"
          onClick={fillExample}
          className="shrink-0 whitespace-nowrap text-[11px] font-semibold text-sky-700 underline-offset-2 transition hover:text-sky-800 hover:underline"
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
          onChange={setGross}
        />
        <BenchmarkCard
          label="Net margin"
          typical={benchmarks.net_margin}
          unit="%"
          value={netInput}
          onChange={setNet}
          nearBand={3}
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
            onChange={(v) => setRatio(r.id, v)}
          />
        ))}
      </div>

      <p className="mt-2 text-[10px] text-stone-400">
        Drag each bar · ballpark is fine · tick = typical
        {ratios.length > 0 ? " · green = typical band" : ""}
      </p>
      <p className="mt-1 text-[10px] leading-snug text-stone-400">
        {initialShare.inbound
          ? "This link only includes what the sender chose to share. Tweaks stay in your browser."
          : "Nothing is stored until you copy a link — this stays in your browser."}
      </p>

      {allowRead && sikiRead && (
        <div className="mt-3 flex items-start gap-2 fade-in-up">
          <SikiMascot size={26} mood="look" />
          <div className="min-w-0 pt-0.5">
            <p className="text-xs leading-snug text-stone-700">
              <span className="font-semibold text-sky-700">Siki&rsquo;s read · </span>
              {sikiRead}
            </p>
            <button
              type="button"
              onClick={clearNumbers}
              className="mt-1 text-[10px] font-semibold text-stone-400 underline decoration-stone-300 underline-offset-2 transition hover:text-stone-600"
            >
              Clear my numbers
            </button>
          </div>
        </div>
      )}

      {hasAnyInput && (
        <div className="mt-3 fade-in-up">
          {!shareOpen ? (
            <button
              type="button"
              onClick={openShare}
              className="text-[11px] font-semibold text-sky-700 underline-offset-2 hover:underline"
            >
              Share this comparison →
            </button>
          ) : (
            <div className="rounded-xl border border-stone-200 bg-white px-3.5 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-stone-400">
                In the note
              </p>
              <p className="mt-0.5 text-[11px] text-stone-500">
                Untick anything you don&rsquo;t want in the link.
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {shareChoices.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    disabled={!c.enabled}
                    onClick={() => toggleInclude(c.id)}
                    className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${
                      !c.enabled
                        ? "cursor-not-allowed border-stone-100 text-stone-300"
                        : include.has(c.id)
                          ? "border-sky-300 bg-sky-50 text-sky-800"
                          : "border-stone-200 bg-white text-stone-500"
                    }`}
                  >
                    {include.has(c.id) && c.enabled ? "✓ " : ""}
                    {c.label}
                  </button>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void copyShare("link")}
                  className="rounded-lg bg-stone-950 px-3 py-1.5 text-[11px] font-semibold text-white transition hover:bg-stone-800"
                >
                  {copied === "link" ? "Link copied" : "Copy link"}
                </button>
                <button
                  type="button"
                  onClick={() => void copyShare("note")}
                  className="text-[11px] font-semibold text-stone-600 underline-offset-2 hover:underline"
                >
                  {copied === "note" ? "Note copied" : "Copy note"}
                </button>
              </div>
            </div>
          )}
        </div>
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
  nearBand,
}: {
  label: string;
  typical: number;
  unit: string;
  range?: [number, number];
  value: string;
  onChange: (v: string) => void;
  nearBand?: number;
}) {
  const parsed = parseNum(value);
  const tone = parsed !== null ? compareMetricTone({ typical, value: parsed, range, nearBand }) : null;

  const unitSuffix = unit === "%" ? "%" : unit;

  return (
    <div className="rounded-xl border border-stone-200 bg-white px-3 py-3 transition-shadow hover:shadow-sm">
      <div className="flex gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold text-stone-500 leading-snug">{label}</p>
          <p className="mt-0.5 text-[10px] text-stone-400">
            Typical{" "}
            <span className="font-bold tabular-nums text-stone-700">
              {typical}{unitSuffix}
            </span>
          </p>
          <div className="relative mt-2">
            <input
              inputMode="decimal"
              placeholder="Ballpark"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              className="w-full border-0 border-b border-stone-200 bg-transparent py-0.5 pr-6 text-2xl font-bold tabular-nums tracking-tight text-stone-950 outline-none placeholder:text-xl placeholder:font-semibold placeholder:text-stone-300 focus:border-sky-500"
            />
            {unit === "%" && (
              <span className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 text-sm text-stone-400">
                %
              </span>
            )}
          </div>
          <p className={`mt-1.5 text-[11px] font-semibold ${tone ? METRIC_TONE_CLASSES[tone].text : "text-stone-400"}`}>
            {tone ? METRIC_STATUS_LABEL[tone] : "Drag the bar"}
          </p>
        </div>
        <BenchmarkCompareBar
          typical={typical}
          yours={parsed}
          range={range}
          tone={tone}
          unit={unit}
          orientation="vertical"
          onChange={(n) => onChange(String(n))}
          ariaLabel={`${label} yours`}
        />
      </div>
    </div>
  );
}

function parseNum(raw: string): number | null {
  if (!raw.trim()) return null;
  const n = Number(raw.replace(/%/g, "").trim());
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 10) / 10;
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
  initialShare,
}: {
  slug: string;
  hint: ResolvedSnapshot | null;
  initialShare: CheckShareState;
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
                  Typical UK ranges — ballpark is enough. No signup.
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
              {watchTip && (
                <p className="mt-3 text-[11px] leading-snug text-stone-500 fade-in-up">
                  <span className="font-semibold text-stone-600">What to watch · </span>
                  {watchTip}
                </p>
              )}

              <div className="mt-4">
                <YoursComparison
                  benchmarks={benchData.benchmarks}
                  ratios={benchData.ratios}
                  sectorLabel={benchData.sector_label}
                  slug={slug}
                  researchLabel={researchLabelFromSlug(slug)}
                  initialShare={initialShare}
                />
              </div>

              <div className="mt-6 fade-in-up fade-in-up-delay-1">
                <button
                  type="button"
                  onClick={runScan}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-stone-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-stone-800 btn-press"
                >
                  Run Siki&rsquo;s check on sample books
                </button>
                <p className="mt-2 text-center text-[11px] text-stone-400">
                  Still not your books — a demo scan for duplicates, overdue invoices, and payment risks.
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
            {phase === "ready"
              ? "Figures stay in this browser until you copy a link. Benchmarks are typical UK ranges — not a peer dataset."
              : "Benchmarks are typical UK ranges — not a peer dataset."}
            {phase !== "ready" && phase !== "scanning" && " Siki remembers your sector for next time."}
          </p>
        </div>
      </section>
    </main>
  );
}
