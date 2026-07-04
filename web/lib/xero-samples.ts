/**
 * Sample queries for the bookkeeper demo. Lets judges quickly see the
 * agent's capabilities without typing a full question.
 */

export interface SampleQuery {
  id: string;
  title: string;
  description: string;
}

export const SAMPLE_QUERIES: SampleQuery[] = [
  {
    id: "audit",
    title: "Audit my books",
    description: "Can you check my books and tell me if everything is reconciled? What needs attention?",
  },
  {
    id: "overdue",
    title: "Who owes me money?",
    description: "Show me all overdue invoices. Who hasn't paid and how much is outstanding?",
  },
  {
    id: "profit",
    title: "How am I doing?",
    description: "Give me my profit and loss for the last 90 days and explain it in plain English. Am I profitable?",
  },
  {
    id: "unreconciled",
    title: "What are these transactions?",
    description: "I have some unreconciled bank transactions. Can you look at them and tell me what they might be?",
  },
];

export function findQuery(id: string | null): SampleQuery | undefined {
  if (!id) return undefined;
  return SAMPLE_QUERIES.find((q) => q.id === id);
}
