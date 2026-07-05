/**
 * Educational tips shown while Siki is working.
 *
 * Layer 1: Static curated tips, keyed by tool name so the tip is
 * contextually relevant to what Siki is doing right now.
 * Layer 2: Personalized insights derived from findings data.
 */

export interface EduTip {
  text: string;
  source?: string;
}

/** Tips relevant to each tool call. Rotated while the tool executes. */
export const TOOL_TIPS: Record<string, EduTip[]> = {
  find_discrepancies: [
    { text: "Unreconciled transactions are the #1 cause of incorrect VAT returns. Xero recommends reconciling within 3 days of each transaction." },
    { text: "A trial balance that doesn't balance means a journal entry is wrong or missing. Siki checks this automatically." },
    { text: "The average UK small business has 4-6 unreconciled transactions at any given time. Regular reconciliation keeps it under 2." },
  ],
  get_xero_profit_and_loss: [
    { text: "Your P&L (Profit & Loss) shows income minus expenses over a period. Lenders use it to assess loan applications." },
    { text: "Net profit ≠ cash in bank. Profit is an accounting measure; cash flow tracks actual money moving in and out." },
    { text: "UK companies must file a P&L with Companies House annually. Keeping it accurate year-round saves £200+ in accountant fees." },
  ],
  get_xero_balance_sheet: [
    { text: "Your balance sheet is a snapshot of what you own and owe at a point in time. It's the 'health check' lenders and investors look at." },
    { text: "Equity = Assets - Liabilities. If this number is negative, the business is technically insolvent." },
  ],
  get_xero_invoices: [
    { text: "After 60 days overdue, the probability of collecting an invoice drops to 50%. Chasing early is critical." },
    { text: "UK businesses can charge statutory interest (8% + Bank Rate) on late payments under the Late Payment of Commercial Debts Act 1998." },
    { text: "The average overdue B2B invoice in the UK is paid 18 days late. The sooner you chase, the sooner you get paid." },
  ],
  get_xero_transactions: [
    { text: "Bank reconciliation matches your Xero records to your actual bank statements. It's how you catch missing or duplicate transactions." },
    { text: "Common reconciliation issues: standing orders not coded, card payments with vague references, and duplicate imports." },
  ],
  get_tax_insights: [
    { text: "UK Corporation Tax is due 9 months and 1 day after your accounting period ends. Miss it and HMRC charges interest." },
    { text: "You can claim £150/year per person for working from home as a sole trader. Companies can claim more under specific conditions." },
    { text: "VAT returns are due quarterly if you're on standard scheme. Missing the deadline costs £200 + potential surcharge." },
    { text: "Non-deductible expenses (client entertainment, fines, political donations) can't reduce your tax bill. Claiming them by mistake risks HMRC penalties." },
  ],
  get_savings_opportunities: [
    { text: "The average small business spends 15-20% more than necessary on software subscriptions. Auditing them quarterly saves £100s." },
    { text: "Switching from monthly to annual billing on common tools (Xero, QuickBooks, Adobe) typically saves 15-20%." },
  ],
  get_xero_chart_of_accounts: [
    { text: "Your chart of accounts is the backbone of your bookkeeping. Each account code maps to a box on your tax return." },
    { text: "Misclassifying expenses (e.g. putting travel under 'office costs') can trigger HMRC inquiries. Siki checks this before posting." },
  ],
  propose_journal_entry: [
    { text: "A journal entry is the accounting way to fix errors. It debits one account and credits another by the same amount." },
    { text: "Every journal entry should have a clear description. 'Fix reconciliation error' is not enough — explain what was wrong and why." },
  ],
  draft_invoice_reminder: [
    { text: "First reminder: friendly, 7 days late. Second: firm, 30 days. Third: final notice with late payment interest, 60+ days." },
    { text: "Under the Late Payment of Commercial Debts Act, you can charge 8% + Bank Rate interest on overdue B2B invoices — mention it in your final reminder." },
  ],
  default: [
    { text: "Siki reads your Xero data in real-time — no exports, no spreadsheets, no manual entry." },
    { text: "Every journal entry Siki proposes is reviewed by you before it's posted. You're always in control." },
    { text: "The findings panel on the left shows a live snapshot of your books. Check it after each conversation." },
  ],
};

/** Get tips relevant to the current tool call. */
export function getTipsForTool(toolName: string): EduTip[] {
  return TOOL_TIPS[toolName] ?? TOOL_TIPS.default;
}

/**
 * Layer 2: Personalized insights derived from findings data.
 * Returns a string that contextualizes the user's situation.
 */
export function getPersonalizedInsight(findings: {
  money_found: number;
  counts: { overdue: number; unreconciled: number; tax_flags: number };
  clean: boolean;
} | null): string | null {
  if (!findings || findings.clean) return null;

  const parts: string[] = [];

  if (findings.counts.unreconciled > 0) {
    if (findings.counts.unreconciled > 5) {
      parts.push(
        `You have ${findings.counts.unreconciled} unreconciled transactions — that's above the UK small business average of 4. Regular reconciliation keeps this under 2.`,
      );
    } else if (findings.counts.unreconciled > 2) {
      parts.push(
        `You have ${findings.counts.unreconciled} unreconciled transactions. The average UK small business has 4-6 at any time — you're in a similar range.`,
      );
    }
  }

  if (findings.money_found > 0) {
    if (findings.money_found > 1000) {
      parts.push(
        `£${Math.round(findings.money_found).toLocaleString()} in overdue invoices is significant. After 60 days, collection probability drops to 50%. Chasing now is priority #1.`,
      );
    } else {
      parts.push(
        `£${Math.round(findings.money_found).toLocaleString()} in overdue invoices. The sooner you chase, the higher the chance of collection.`,
      );
    }
  }

  if (findings.counts.tax_flags > 0) {
    parts.push(
      `${findings.counts.tax_flags} potential tax issue${findings.counts.tax_flags > 1 ? "s" : ""} flagged. Non-deductible expenses claimed by mistake can trigger HMRC penalties of up to 100% of the tax underpaid.`,
    );
  }

  return parts.length > 0 ? parts[0] : null;
}
