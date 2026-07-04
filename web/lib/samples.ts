/**
 * Sample disputes used to demo Sikizana without the user committing their
 * own real dispute. The user can pick one to see the full arbitration flow.
 */

export interface SampleDispute {
  id: string;
  title: string;
  language: "en" | "sw" | "sheng";
  description: string;
}

export const SAMPLE_DISPUTES: SampleDispute[] = [
  {
    id: "unpaid-contributions",
    title: "Unpaid contributions (3 months)",
    language: "en",
    description:
      "One member of our group, Ms. Wanjiku, has only paid 2 out of 6 months. She claims she paid via M-Pesa but there's no record. We want Sikizana to review the transaction history.",
  },
  {
    id: "missing-treasurer",
    title: "Treasurer unreachable with funds",
    language: "en",
    description:
      "Our treasurer, Mr. Otieno, has been absent for two weeks and has KES 45,000 of group funds. His M-Pesa is offline. The group is very concerned.",
  },
  {
    id: "loan-default",
    title: "Loan default dispute",
    language: "en",
    description:
      "Mary borrowed KES 20,000 from the chama in March with agreement to repay by June 30th with 10% interest. She has paid KES 8,000 only and says the bylaw interest is illegal. We need a fair ruling.",
  },
  {
    id: "profit-sharing",
    title: "Annual profit distribution",
    language: "en",
    description:
      "This year our group made KES 150,000 profit. Some members want equal distribution, others want it based on contribution. Our bylaws are unclear on this.",
  },
];

export function findSample(id: string | null): SampleDispute | undefined {
  if (!id) return undefined;
  return SAMPLE_DISPUTES.find((d) => d.id === id);
}
