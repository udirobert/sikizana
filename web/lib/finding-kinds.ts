/**
 * Finding-kind metadata — the single frontend table for what each
 * `finding.kind` looks like and what it can do.
 *
 * `Record<FindingKind, …>` makes the table exhaustive: adding a kind to the
 * union in api.ts without a meta entry here is a compile error. That is the
 * fix for the old trap where capability was sniffed from string prefixes
 * (`kind.startsWith("ap_")`) and a new kind silently rendered with no icon,
 * no label, and no review affordance.
 *
 * Mirrors src/services/finding_kinds.py — tests/test_finding_kinds.py
 * fails if the two vocabularies drift.
 *
 * Adding a finding kind:
 *   1. constant + Literal in src/services/finding_kinds.py
 *   2. literal in the FindingKind union in lib/api.ts
 *   3. one entry in FINDING_KIND_META below
 */

import {
  AlertTriangle,
  ArrowLeftRight,
  Clock,
  Coffee,
  Copy,
  FileText,
  Landmark,
  Scale,
  ShieldAlert,
  TrendingDown,
  TrendingUp,
  Unlink,
  type LucideIcon,
} from "lucide-react";
import type { FindingKind } from "@/lib/api";

/** Which backend domain owns the kind. Drives review-endpoint routing and
 *  must mirror the finding-id prefixes the API validates (`ap-`, `cafe-`). */
export type FindingDomain = "core" | "ap" | "cafe";

export interface FindingKindMeta {
  icon: LucideIcon;
  /** Short label shown next to the finding title. */
  label: string;
  /** Plain-English gloss — the target user isn't an accountant. */
  gloss?: string;
  /** Books panel shows the human-review affordances (Mark safe /
   *  Investigate / Confirm / Dismiss). Requires a review endpoint for the
   *  kind's `domain`. Café kinds have one (apart from routing, the store and
   *  endpoint already exist) but stay hidden for now — flip to enable. */
  reviewable: boolean;
  /** Gets the "Auto-chase" button when the finding carries an
   *  invoice_number. */
  chaseable: boolean;
  domain: FindingDomain;
}

export const FINDING_KIND_META: Record<FindingKind, FindingKindMeta> = {
  overdue_invoice: {
    icon: Clock,
    label: "Overdue invoice",
    domain: "core",
    reviewable: false,
    chaseable: true,
  },
  overdue_bill: {
    icon: FileText,
    label: "Overdue bill",
    domain: "core",
    reviewable: false,
    chaseable: false,
  },
  unreconciled: {
    icon: Unlink,
    label: "Unreconciled",
    gloss: "A bank transaction Xero can't match to an invoice or bill yet",
    domain: "core",
    reviewable: false,
    chaseable: false,
  },
  tax_flag: {
    icon: Landmark,
    label: "Tax flag",
    gloss: "An expense that may affect what tax you owe",
    domain: "core",
    reviewable: false,
    chaseable: false,
  },
  ap_duplicate_bill: {
    icon: Copy,
    label: "Possible duplicate bill",
    gloss: "Review the matching source bills before paying or requesting a credit",
    domain: "ap",
    reviewable: true,
    chaseable: false,
  },
  ap_duplicate_payment: {
    icon: Copy,
    label: "Possible duplicate payment",
    gloss: "Review the matching payment records before requesting a credit or refund",
    domain: "ap",
    reviewable: true,
    chaseable: false,
  },
  ap_supplier_detail_change: {
    icon: ShieldAlert,
    label: "Supplier detail change",
    gloss: "Verify through a supplier contact channel you already trust",
    domain: "ap",
    reviewable: true,
    chaseable: false,
  },
  ap_payment_anomaly: {
    icon: AlertTriangle,
    label: "Payment anomaly",
    gloss: "A conservative prompt to check a high-value first payment",
    domain: "ap",
    reviewable: true,
    chaseable: false,
  },
  cafe_rising_item: {
    icon: TrendingUp,
    label: "Rising item",
    gloss: "A menu item trending up — stock up before the weekend rush",
    domain: "cafe",
    reviewable: false,
    chaseable: false,
  },
  cafe_declining_item: {
    icon: TrendingDown,
    label: "Declining item",
    gloss: "A menu item trending down — cut the order to avoid waste",
    domain: "cafe",
    reviewable: false,
    chaseable: false,
  },
  cafe_attach_gap: {
    icon: Coffee,
    label: "Attach-rate gap",
    gloss: "Few customers add a treat to their drink — an easy upsell at the till",
    domain: "cafe",
    reviewable: false,
    chaseable: false,
  },
  net_offset_opportunity: {
    icon: Scale,
    label: "Net offset",
    gloss: "You owe them and they owe you — part of both balances can cancel out",
    domain: "core",
    reviewable: false,
    chaseable: false,
  },
  credit_side_exception: {
    icon: ArrowLeftRight,
    label: "Credit-side exception",
    gloss: "A receivable that is part-paid, overpaid, or written off — not a clean invoice",
    domain: "core",
    reviewable: false,
    chaseable: false,
  },
};

export function isReviewableKind(kind: FindingKind): boolean {
  return FINDING_KIND_META[kind].reviewable;
}

export function isChaseableKind(kind: FindingKind): boolean {
  return FINDING_KIND_META[kind].chaseable;
}
