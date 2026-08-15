/**
 * Sector typicals — reads ``sector-catalogue.json`` (shared with the API).
 * Surfaces must label these as "typical UK ranges · indicative".
 */

import catalogue from "./sector-catalogue.json";

export type SectorId =
  | "retail"
  | "construction"
  | "professional_services"
  | "hospitality"
  | "manufacturing"
  | "wholesale"
  | "music";

export interface SectorBenchmark {
  id: SectorId;
  label: string;
  watchFor: string;
  avgGrossMargin: number;
  avgNetMargin: number;
  avgReceivablesDays: number;
  avgOverdueRate: number;
  demoScenario?: string;
}

type CatalogueSector = (typeof catalogue.sectors)[number];

const ALIAS_TO_ID: Record<string, SectorId> = (() => {
  const out: Record<string, SectorId> = {};
  for (const s of catalogue.sectors) {
    const id = s.id as SectorId;
    out[id] = id;
    for (const alias of s.aliases) {
      out[alias.toLowerCase()] = id;
    }
  }
  return out;
})();

const ALIAS_LABELS: Record<string, string> = {};
for (const s of catalogue.sectors) {
  for (const [alias, label] of Object.entries(s.aliasLabels ?? {})) {
    ALIAS_LABELS[alias] = label;
  }
}

function toBenchmark(s: CatalogueSector): SectorBenchmark {
  return {
    id: s.id as SectorId,
    label: s.label,
    watchFor: s.watchFor,
    avgGrossMargin: s.avgGrossMargin,
    avgNetMargin: s.avgNetMargin,
    avgReceivablesDays: s.avgReceivablesDays,
    avgOverdueRate: s.avgOverdueRate,
    demoScenario: s.demoScenario === "cafe" && s.id !== "hospitality" ? undefined : s.demoScenario,
  };
}

export const SECTOR_BENCHMARKS: SectorBenchmark[] = catalogue.sectors.map(toBenchmark);

export const SECTOR_FAMILY_OPTIONS: { id: SectorId; label: string }[] = SECTOR_BENCHMARKS.map((s) => ({
  id: s.id,
  label: s.label,
}));

export const SECTOR_IDS = SECTOR_BENCHMARKS.map((s) => s.id);

export interface ResolvedSnapshot {
  id: SectorId;
  slug: string;
  label: string;
  bench: SectorBenchmark;
}

export function getSectorBenchmark(id: string | null | undefined): SectorBenchmark | undefined {
  if (!id) return undefined;
  const key = id.toLowerCase().replace(/ /g, "_");
  const canonical = ALIAS_TO_ID[key] ?? ((SECTOR_IDS as readonly string[]).includes(key) ? (key as SectorId) : null);
  if (!canonical) return undefined;
  return SECTOR_BENCHMARKS.find((s) => s.id === canonical);
}

export function resolveSnapshotSector(slug: string | null | undefined): ResolvedSnapshot | null {
  if (!slug) return null;
  const key = decodeURIComponent(slug).toLowerCase().trim().replace(/ /g, "_");
  let id = ALIAS_TO_ID[key];
  if (!id) {
    for (const [keyword, sector] of catalogue.keywords) {
      if (key.includes(keyword)) {
        id = sector as SectorId;
        break;
      }
    }
  }
  if (!id) return null;
  const bench = SECTOR_BENCHMARKS.find((s) => s.id === id);
  if (!bench) return null;
  return {
    id,
    slug: key,
    label: ALIAS_LABELS[key] ?? titleCaseSlug(key, bench.label),
    bench,
  };
}

function titleCaseSlug(slug: string, fallback: string): string {
  const words = slug.replace(/_/g, " ").trim();
  if (!words) return fallback;
  return words.replace(/\b\w/g, (c) => c.toUpperCase());
}

export function researchLabelFromResolved(resolved: ResolvedSnapshot | null, rawSlug: string): string {
  if (resolved) return resolved.label;
  try {
    return decodeURIComponent(rawSlug).replace(/[-_]/g, " ").trim();
  } catch {
    return rawSlug.replace(/[-_]/g, " ").trim();
  }
}

export function formatPct(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

export function parseMarginPct(raw: string | null | undefined): number | null {
  if (raw == null || raw === "") return null;
  const n = Number(String(raw).replace(/%/g, "").trim());
  if (!Number.isFinite(n) || n < 0 || n > 100) return null;
  return Math.round(n * 10) / 10;
}

/** Plain-English, non-accusatory read when the visitor supplies figures. */
export function marginNoteRead(
  bench: SectorBenchmark,
  gross: number | null,
  net: number | null,
): string {
  if (gross == null && net == null) return bench.watchFor;

  const tg = bench.avgGrossMargin * 100;
  const tn = bench.avgNetMargin * 100;
  const near = (a: number, b: number, band = 4) => Math.abs(a - b) <= band;

  if (gross != null && net != null) {
    if (gross >= tg + 5 && net <= tn - 2) {
      return "Gross looks strong; net is the thing to check.";
    }
    if (gross <= tg - 5 && net <= tn - 2) {
      return "Both sit soft vs typical — mix and costs first.";
    }
    if (near(gross, tg) && near(net, tn)) {
      return "In the typical band — next look at cash and exceptions.";
    }
    if (gross >= tg - 2 && net >= tn + 3) {
      return "Net looks healthy vs typical for this sector.";
    }
    return "Mixed vs typical — worth reading against your own books.";
  }

  if (gross != null) {
    if (near(gross, tg)) return "Gross is near typical for this sector.";
    if (gross > tg) return "Gross sits above typical — check what 'COGS' includes.";
    return "Gross sits below typical — mix or COGS is the first look.";
  }

  if (net != null && near(net, tn)) return "Net is near typical for this sector.";
  if (net != null && net > tn) return "Net sits above typical — nice place to start a deeper check.";
  return "Net sits below typical — overheads usually explain it.";
}

export function snapshotPath(
  slug: string,
  opts: { g?: number | null; n?: number | null } = {},
): string {
  const params = new URLSearchParams();
  if (opts.g != null) params.set("g", String(opts.g));
  if (opts.n != null) params.set("n", String(opts.n));
  const qs = params.toString();
  return `/b/${encodeURIComponent(slug)}${qs ? `?${qs}` : ""}`;
}

export function buildShareBlurb(input: {
  label: string;
  bench: SectorBenchmark;
  gross: number | null;
  net: number | null;
  url: string;
}): string {
  const { label, bench, gross, net, url } = input;
  const typical = `Typical UK ${label.toLowerCase()}: ~${formatPct(bench.avgGrossMargin)} gross / ~${formatPct(bench.avgNetMargin)} net · indicative.`;
  const yours =
    gross != null || net != null
      ? `Yours: ${gross != null ? `${gross}%` : "—"} / ${net != null ? `${net}%` : "—"}. Siki's read: ${marginNoteRead(bench, gross, net)}`
      : `Siki's read: ${marginNoteRead(bench, null, null)}`;
  return `${typical}\n${yours}\n${url}`;
}

/** Books handoff URL: sector pref + optional demo + benchmark sample query. */
export function sectorCheckHref(
  sector: SectorId,
  opts: { connect?: boolean; persona?: "siki" | "zana" } = {},
): string {
  const bench = SECTOR_BENCHMARKS.find((s) => s.id === sector);
  const params = new URLSearchParams({
    flow: "check",
    sector,
    sample: "benchmark",
    persona: opts.persona ?? "siki",
  });
  if (bench?.demoScenario && bench.demoScenario !== "cafe") params.set("demo", bench.demoScenario);
  if (opts.connect) params.set("connect", "1");
  return `/books?${params.toString()}`;
}
