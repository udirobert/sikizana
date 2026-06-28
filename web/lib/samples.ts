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
    language: "sw",
    description:
      "Mwanachama mmoja wa chama yetu, Bi Wanjiku, amelipa tu miezi 2 kati ya 6. Anadai alipwa kupitia M-Pesa lakini hakuna kumbukumbu. Tunataka Sikizana aangalie transaction history.",
  },
  {
    id: "missing-treasurer",
    title: "Treasurer unreachable with funds",
    language: "sw",
    description:
      "Treasurer wetu, Bwana Otieno, hayupo tangu wiki mbili na ana pesa za chama KES 45,000. M-Pesa yake imezimwa. Chama kina wasiwasi mkubwa.",
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
    language: "sw",
    description:
      "Mwaka huu chama kilipata faida ya KES 150,000. Baadhi ya wanachama wanataka mgawanyiko sawa, wengine wanataka kwa mchango. Bylaws zetu hazieleweki kuhusu hili.",
  },
];

export function findSample(id: string | null): SampleDispute | undefined {
  if (!id) return undefined;
  return SAMPLE_DISPUTES.find((d) => d.id === id);
}
