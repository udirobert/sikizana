/**
 * Sample queries for the bookkeeper demo.
 * Written in the voice of a small business owner — not an accountant.
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
    description: "Show me all overdue invoices. Who hasn't paid and how much is outstanding in total?",
    hint: "Finds money you're owed",
  },
  {
    id: "profit",
    title: "Am I actually profitable?",
    description: "Give me my profit and loss for this month and explain it in plain English. Am I profitable compared to last month?",
    hint: "Plain-English P&L",
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
