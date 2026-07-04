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

export function findQuery(id: string | null): SampleQuery | undefined {
  if (!id) return undefined;
  return SAMPLE_QUERIES.find((q) => q.id === id);
}
