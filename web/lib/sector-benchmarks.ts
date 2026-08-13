/**
 * Curated UK SME indicative ranges — kept in sync with
 * `_SECTOR_BENCHMARKS` in `src/tools/accounting_tools.py`.
 *
 * Surfaces must label these as "typical UK ranges · indicative"
 * (see docs/BRAND.md). They are not live ONS statistics.
 */

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
  /** One line: the lever that most often moves you off the median. */
  watchFor: string;
  avgGrossMargin: number;
  avgNetMargin: number;
  avgReceivablesDays: number;
  avgOverdueRate: number;
  /** Optional demo scenario when handing off to /books. */
  demoScenario?: string;
}

/** Friendly URL slugs that map onto a canonical sector id. */
const SECTOR_ALIASES: Record<string, SectorId> = {
  catering: "hospitality",
  cafe: "hospitality",
  café: "hospitality",
  restaurant: "hospitality",
  restaurants: "hospitality",
  hospitality: "hospitality",
  music: "music",
  services: "professional_services",
  professional_services: "professional_services",
  agency: "professional_services",
  retail: "retail",
  construction: "construction",
  manufacturing: "manufacturing",
  wholesale: "wholesale",
};

/** Display label when the URL used an alias (e.g. /b/catering). */
const ALIAS_LABELS: Record<string, string> = {
  catering: "Catering",
  cafe: "Café",
  café: "Café",
  restaurant: "Restaurant",
  restaurants: "Restaurants",
  services: "Services",
  agency: "Agency",
};

export const SECTOR_BENCHMARKS: SectorBenchmark[] = [
  {
    id: "hospitality",
    label: "Hospitality",
    watchFor: "Wages, rent, and energy move net more than menu prices.",
    avgGrossMargin: 0.35,
    avgNetMargin: 0.08,
    avgReceivablesDays: 18,
    avgOverdueRate: 0.04,
  },
  {
    id: "music",
    label: "Music",
    watchFor: "One late promoter can skew overdue for months.",
    avgGrossMargin: 0.4,
    avgNetMargin: 0.07,
    avgReceivablesDays: 60,
    avgOverdueRate: 0.14,
    demoScenario: "music",
  },
  {
    id: "professional_services",
    label: "Services",
    watchFor: "Bench time and thin retainers crush net before costs show.",
    avgGrossMargin: 0.45,
    avgNetMargin: 0.12,
    avgReceivablesDays: 48,
    avgOverdueRate: 0.06,
  },
  {
    id: "retail",
    label: "Retail",
    watchFor: "Shrinkage and promotions eat gross before rent hits.",
    avgGrossMargin: 0.22,
    avgNetMargin: 0.04,
    avgReceivablesDays: 52,
    avgOverdueRate: 0.08,
  },
  {
    id: "construction",
    label: "Construction",
    watchFor: "Retention and stage payments delay cash after recognition.",
    avgGrossMargin: 0.18,
    avgNetMargin: 0.03,
    avgReceivablesDays: 65,
    avgOverdueRate: 0.15,
  },
  {
    id: "manufacturing",
    label: "Manufacturing",
    watchFor: "Capacity and input costs swing gross more than list price.",
    avgGrossMargin: 0.28,
    avgNetMargin: 0.06,
    avgReceivablesDays: 58,
    avgOverdueRate: 0.1,
  },
  {
    id: "wholesale",
    label: "Wholesale",
    watchFor: "Rebates and freight rewrite reported gross overnight.",
    avgGrossMargin: 0.15,
    avgNetMargin: 0.03,
    avgReceivablesDays: 42,
    avgOverdueRate: 0.07,
  },
];

export const SECTOR_IDS = SECTOR_BENCHMARKS.map((s) => s.id);

export interface ResolvedSnapshot {
  /** Canonical sector used for numbers + prefs. */
  id: SectorId;
  /** URL slug (may be an alias like "catering"). */
  slug: string;
  /** Human label for the card ("Catering" vs "Hospitality"). */
  label: string;
  bench: SectorBenchmark;
}

export function getSectorBenchmark(id: string | null | undefined): SectorBenchmark | undefined {
  if (!id) return undefined;
  const key = id.toLowerCase().replace(/ /g, "_");
  const canonical = SECTOR_ALIASES[key] ?? ((SECTOR_IDS as readonly string[]).includes(key) ? (key as SectorId) : null);
  if (!canonical) return undefined;
  return SECTOR_BENCHMARKS.find((s) => s.id === canonical);
}

export function resolveSnapshotSector(slug: string | null | undefined): ResolvedSnapshot | null {
  if (!slug) return null;
  const key = decodeURIComponent(slug).toLowerCase().trim().replace(/ /g, "_");
  const id = SECTOR_ALIASES[key];
  if (!id) return null;
  const bench = SECTOR_BENCHMARKS.find((s) => s.id === id);
  if (!bench) return null;
  return {
    id,
    slug: key,
    label: ALIAS_LABELS[key] ?? bench.label,
    bench,
  };
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

  // net only
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
  if (bench?.demoScenario) params.set("demo", bench.demoScenario);
  if (opts.connect) params.set("connect", "1");
  return `/books?${params.toString()}`;
}
