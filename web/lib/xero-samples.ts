/**
 * Sample queries for the bookkeeper demo.
 * Anchored to Rishi — an expanding retailer with cash flow stress.
 * Each query leads to an "aha moment" where the agent demonstrates
 * tangible value (saves time, finds money, explains complexity).
 */
export interface SampleQuery {
  id: string;
  title: string;
  description: string;
  hint?: string;
}

export const SAMPLE_QUERIES: SampleQuery[] = [
  {
    id: "ap-integrity",
    title: "Check for duplicate payments",
    description: "Audit my supplier bills and payments for possible duplicates. Show me the source evidence and tell me what to verify before asking for a credit or refund.",
    hint: "Finds a reviewable AP risk",
  },
  {
    id: "overview",
    title: "Give me a quick overview",
    description: "Can you give me a quick overview of my business finances? What's my revenue, profit, and anything that needs my attention?",
    hint: "Best place to start",
  },
  {
    id: "overdue",
    title: "Who owes me money?",
    description: "Show me all overdue invoices. Who hasn't paid, how much is outstanding, and how long are they overdue?",
    hint: "Finds money you're owed",
  },
  {
    id: "tax",
    title: "How much tax will I owe?",
    description: "Can you estimate my Corporation Tax and check if I'm missing any deductible expenses or claiming things I shouldn't?",
    hint: "Tax insights + HMRC flags",
  },
  {
    id: "reconcile",
    title: "What needs fixing?",
    description: "Can you check my books and tell me what needs attention? Are there any unreconciled transactions or discrepancies?",
    hint: "Instant health check",
  },
];

export const ZANA_QUERIES: SampleQuery[] = [
  {
    id: "chase",
    title: "Draft a reminder for overdue invoices",
    description: "I have overdue invoices. Draft a firm reminder email for the worst offender — I need to chase this now.",
    hint: "Drafts chasing email",
  },
  {
    id: "savings",
    title: "Where can I cut costs?",
    description: "Analyze my expenses and find savings opportunities. What am I wasting money on? Where can I improve my margins?",
    hint: "Finds wasted spend",
  },
  {
    id: "cashflow",
    title: "Will I be able to pay my tax bill?",
    description: "I owe Corporation Tax soon. Will I have enough cash to pay it? What happens if my overdue invoices don't come in?",
    hint: "Cash flow reality check",
  },
  {
    id: "noncompliant",
    title: "What am I overpaying in tax?",
    description: "Check my expenses for non-deductible items I'm claiming by mistake, and missed deductions I should be claiming. How much is this costing me?",
    hint: "Stops tax overpayment",
  },
];

export function findQuery(id: string | null): SampleQuery | undefined {
  if (!id) return undefined;
  const all = [...SAMPLE_QUERIES, ...ZANA_QUERIES];
  return all.find((q) => q.id === id);
}
