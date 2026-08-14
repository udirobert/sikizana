/**
 * Sector intelligence tips — Siki's contextual teaching layer.
 *
 * Tips are short, Siki-voice educational nudges about where to find
 * free benchmarking data, what metrics to watch, and how to interpret
 * sector-specific signals.
 *
 * See DESIGN.md: "Sector intelligence tips (mascot knowledge layer)"
 * for dosage rules and surface guidance.
 */

import type { SectorId } from "./sector-benchmarks";

// ─── Types ──────────────────────────────────────────────────────────────────

export type TipPhase = "post-findings" | "chat" | "sidebar";

export interface SectorTip {
  id: string;
  topic: string;
  /** One-sentence Siki-voice hook shown as the card collapsed title. */
  summary: string;
  /** Short markdown-ish body (1–3 paragraphs) shown when expanded. */
  body: string;
  /** Attribution source label (e.g. "Companies House", "Booking.com"). */
  sourceLabel?: string;
  /** Optional link to the free source. */
  sourceUrl?: string;
  /** Which surface(s) this tip is suited for. */
  phase: TipPhase[];
}

// ─── Hospitality tips ───────────────────────────────────────────────────────
// First sector to receive rich tips — sourced from the assembled hotel
// benchmarking methodology (Companies House, rate shops, tourism data, etc.)

const HOSPITALITY_TIPS: SectorTip[] = [
  {
    id: "hosp-companies-house",
    topic: "Peer financials on Companies House",
    summary:
      "UK hospitality businesses file accounts you can compare against \u2014 turnover, margins, employee costs, free to access.",
    body:
      "Search Companies House by SIC code 55100 (hotels) or 56101 " +
      "(restaurants and take-aways) to find businesses of similar scale. " +
      "Pull their latest 2\u20133 years of filed accounts and compare revenue, " +
      "operating profit, employee count, and net assets. Smaller companies " +
      "may file abbreviated accounts (no turnover disclosed) \u2014 don\u2019t treat " +
      "missing turnover as zero, just exclude those from that field\u2019s comparison.",
    sourceLabel: "Companies House",
    sourceUrl: "https://find-and-update.company-information.service.gov.uk/",
    phase: ["post-findings", "sidebar"],
  },
  {
    id: "hosp-rate-shop",
    topic: "Rate-shop your comp set",
    summary:
      "Sample public pricing on Booking.com and hotel websites to see how your price positioning compares.",
    body:
      "Pick a weekday, a weekend, and one peak-season date. Record the " +
      "displayed nightly rate for an equivalent room type (two adults, one " +
      "night, same cancellation conditions) for your property and 5\u20138 nearby " +
      "competitors. This gives you a live price-positioning proxy \u2014 no " +
      "subscription to STR or CoStar needed. Cross-check review scores and " +
      "counts on Tripadvisor or Google Hotels for the demand-side picture.",
    sourceLabel: "Booking.com / Google Hotels",
    sourceUrl: "https://www.google.com/travel/hotels",
    phase: ["post-findings", "sidebar"],
  },
  {
    id: "hosp-tourism-data",
    topic: "Demand context from tourism data",
    summary:
      "Local visitor numbers and occupancy rates tell you whether your performance mirrors the market or diverges.",
    body:
      "Regional tourism boards and national statistics agencies publish " +
      "monthly or quarterly visitor volumes, hotel occupancy, room supply, " +
      "and average daily rate. Use these to separate market conditions from " +
      "business execution \u2014 if your occupancy is down but the region is up, " +
      "that\u2019s a different conversation than if the whole market is soft.",
    phase: ["post-findings", "sidebar"],
  },
];

// ─── Retail tips ────────────────────────────────────────────────────────────

const RETAIL_TIPS: SectorTip[] = [
  {
    id: "retail-rent-benchmark",
    topic: "Rent benchmarking against open-market data",
    summary:
      "Compare your rent % of revenue against area-specific rent per sq ft from free property listings.",
    body:
      "The UK Valuation Office Agency publishes free market rent data " +
      "by property type and area. Cross-reference with property listings " +
      "on commercial agents\u2019 sites for your postcode. A rent-to-revenue " +
      "ratio above 12\u201315% for physical retail suggests your location cost " +
      "is an outlier worth investigating.",
    sourceLabel: "Valuation Office Agency",
    sourceUrl: "https://www.gov.uk/government/organisations/valuation-office-agency",
    phase: ["post-findings", "sidebar"],
  },
  {
    id: "retail-shrinkage",
    topic: "Shrinkage rate vs sector norms",
    summary:
      "British Retail Consortium surveys benchmark shrinkage \u2014 if yours is above 1.5%, it\u2019s worth a stock-process review.",
    body:
      "The BRC Retail Crime Survey publishes average shrinkage rates by " +
      "retail sub-sector. Many independent retailers don\u2019t track shrinkage " +
      "systematically until it shows in gross margin. Compare your write-offs " +
      "and stock discrepancies against the BRC benchmark to see if you have " +
      "a stock-loss problem or an accounting classification issue.",
    sourceLabel: "British Retail Consortium",
    sourceUrl: "https://brc.org.uk/",
    phase: ["post-findings", "sidebar"],
  },
];

// ─── Construction tips ──────────────────────────────────────────────────────

const CONSTRUCTION_TIPS: SectorTip[] = [
  {
    id: "con-material-indices",
    topic: "Material cost trends from BEIS indices",
    summary:
      "Free monthly construction material price indices show whether your cost increases are industry-wide or supplier-specific.",
    body:
      "The Department for Business, Energy & Industrial Strategy publishes " +
      "monthly construction material price indices covering aggregates, " +
      "steel, timber, and more. If your materials % of revenue is climbing, " +
      "compare against these indices. If you\u2019re tracking above the index, " +
      "it\u2019s worth re-tendering suppliers; if in line, it\u2019s industry-wide and " +
      "your margins need to adjust accordingly.",
    sourceLabel: "BEIS / GOV.UK",
    sourceUrl: "https://www.gov.uk/government/collections/monthly-statistics-of-building-materials-and-components",
    phase: ["post-findings", "sidebar"],
  },
];

// ─── Professional services tips ─────────────────────────────────────────────

const PROFESSIONAL_SERVICES_TIPS: SectorTip[] = [
  {
    id: "ps-utilisation",
    topic: "Utilisation rate benchmarks",
    summary:
      "A healthy professional services firm runs 65\u201375% chargeable utilisation. Below 60% and bench time usually shows in margins.",
    body:
      "Industry bodies and sector surveys publish free utilisation-rate " +
      "ranges. Calculate yours as chargeable hours divided by total available " +
      "hours (exclude holidays and training). If you\u2019re below 60%, your net " +
      "margin will feel the drag before revenue does \u2014 the fix is usually " +
      "resourcing or pricing, not more work.",
    phase: ["post-findings", "sidebar"],
  },
];

// ─── Music tips ─────────────────────────────────────────────────────────────

const MUSIC_TIPS: SectorTip[] = [
  {
    id: "music-promoter-risk",
    topic: "Promoter concentration and payment timing",
    summary:
      "One slow-paying promoter can skew your overdue for months. Spread payment risk across more buyers.",
    body:
      "The music sector\u2019s project-based revenue means a single late payer " +
      "can distort your receivables picture. If one promoter or venue accounts " +
      "for more than 30% of your outstanding invoices, your cash flow hinges " +
      "on their payment discipline. Consider shorter payment terms or staged " +
      "deposits for repeat engagement, and watch the 60+ day ageing bucket " +
      "as an early signal.",
    phase: ["post-findings", "sidebar"],
  },
];

// ─── Index ──────────────────────────────────────────────────────────────────

const TIPS_BY_SECTOR: Record<SectorId, SectorTip[]> = {
  hospitality: HOSPITALITY_TIPS,
  retail: RETAIL_TIPS,
  construction: CONSTRUCTION_TIPS,
  professional_services: PROFESSIONAL_SERVICES_TIPS,
  music: MUSIC_TIPS,
  manufacturing: [],
  wholesale: [],
};

// ─── Public API ─────────────────────────────────────────────────────────────

/** Return tips for a given sector, optionally filtered by surface phase. */
export function getSectorTips(
  sectorId: SectorId,
  phase?: TipPhase,
): SectorTip[] {
  const tips = TIPS_BY_SECTOR[sectorId] ?? [];
  if (!phase) return tips;
  return tips.filter((t) => t.phase.includes(phase));
}