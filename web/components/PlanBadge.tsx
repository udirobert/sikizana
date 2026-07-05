import type { Plan } from "@/lib/api";

/** Human-readable plan names, shared by the account page and nav links. */
export const PLAN_LABELS: Record<Plan, string> = {
  free: "Free",
  pro: "Pro",
  business: "Business",
};

const PLAN_BADGE_STYLES: Record<Plan, string> = {
  free: "bg-stone-100 text-stone-600",
  pro: "bg-sky-50 text-sky-700",
  business: "bg-emerald-50 text-emerald-700",
};

/** Small pill showing the user's current plan. */
export function PlanBadge({ plan }: { plan: Plan }) {
  return (
    <span
      className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${PLAN_BADGE_STYLES[plan]}`}
    >
      {PLAN_LABELS[plan]}
    </span>
  );
}
