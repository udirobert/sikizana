import type {
  Finding,
  FindingReviewState,
  FindingsResponse,
} from "@/lib/api";
import type { Persona } from "@/lib/persona-theme";
import type { SampleQuery } from "@/lib/xero-samples";

export interface OrgData {
  name: string;
  baseCurrency: string;
  countryCode: string;
  isDemoCompany: boolean;
  registrationNumber?: string;
  taxNumber?: string;
  financialYearEndDay?: number;
  financialYearEndMonth?: number;
}

export interface ProfitAndLossData {
  revenue?: number;
  expenses?: number;
  netProfit: number;
  reportDate?: string;
  fromDate?: string;
  toDate?: string;
  rows?: { account: string; code: string; value: number }[];
}

export interface MetricSnapshot {
  captured_at: string;
  total_revenue: number;
  net_margin: number;
  total_overdue: number;
}

/** Shared prop bundle for the FindingsPanel — built once in the page and
    spread into both the mobile card and the desktop sidebar so the two
    surfaces can never drift apart. */
export interface FindingsPanelProps {
  data: FindingsResponse | null;
  loading: boolean;
  askedIds: ReadonlySet<string>;
  savedIds: ReadonlySet<string>;
  disabled: boolean;
  chasedIds: ReadonlySet<string>;
  reviewingIds: ReadonlySet<string>;
  suggestions: SampleQuery[];
  persona: Persona;
  onAct: (finding: Finding) => void;
  onSave: (finding: Finding) => void;
  onAutoChase: (finding: Finding) => void;
  onReview: (
    finding: Finding,
    state: Exclude<FindingReviewState, "open">,
  ) => void;
  onSuggest: (prompt: string) => void;
}
