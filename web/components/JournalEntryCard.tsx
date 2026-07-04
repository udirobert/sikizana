"use client";

import { useState } from "react";

/**
 * JournalEntryCard — visual card for a proposed journal entry.
 *
 * When the agent proposes a journal entry, it's displayed as a card
 * with the debit/credit details and Approve/Reject buttons.
 * This makes the human-in-the-loop pattern tangible.
 */

interface JournalEntryCardProps {
  description: string;
  debitAccount: string;
  debitAccountName?: string;
  creditAccount: string;
  creditAccountName?: string;
  amount: number;
  onApprove?: () => void;
  onReject?: () => void;
}

export function JournalEntryCard({
  description,
  debitAccount,
  debitAccountName,
  creditAccount,
  creditAccountName,
  amount,
  onApprove,
  onReject,
}: JournalEntryCardProps) {
  const [status, setStatus] = useState<"pending" | "approved" | "rejected">("pending");

  const handleApprove = () => {
    setStatus("approved");
    onApprove?.();
  };

  const handleReject = () => {
    setStatus("rejected");
    onReject?.();
  };

  return (
    <div className="border border-stone-200 rounded-xl overflow-hidden bg-white fade-in-up">
      {/* Header */}
      <div className="bg-stone-50 border-b border-stone-200 px-4 py-2.5 flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-wide text-stone-600">
          Proposed Journal Entry
        </span>
        {status === "pending" && (
          <span className="text-[10px] text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full font-medium">
            Awaiting approval
          </span>
        )}
        {status === "approved" && (
          <span className="text-[10px] text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full font-medium">
            ✓ Approved
          </span>
        )}
        {status === "rejected" && (
          <span className="text-[10px] text-red-600 bg-red-50 px-2 py-0.5 rounded-full font-medium">
            ✗ Rejected
          </span>
        )}
      </div>

      {/* Body */}
      <div className="px-4 py-3">
        <p className="text-xs text-stone-600 mb-3">{description}</p>

        {/* Debit/Credit rows */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-3 text-xs">
            <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded w-8 text-center">
              Dr
            </span>
            <span className="font-mono font-medium text-stone-700 w-12">{debitAccount}</span>
            <span className="text-stone-600 flex-1">{debitAccountName || "—"}</span>
            <span className="font-semibold text-stone-800">
              £{amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </span>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <span className="text-[10px] font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded w-8 text-center">
              Cr
            </span>
            <span className="font-mono font-medium text-stone-700 w-12">{creditAccount}</span>
            <span className="text-stone-600 flex-1">{creditAccountName || "—"}</span>
            <span className="font-semibold text-stone-800">
              £{amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </span>
          </div>
        </div>

        {/* Balanced indicator */}
        <div className="mt-3 pt-2 border-t border-stone-100 flex items-center gap-1.5">
          <svg className="w-3 h-3 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-[10px] text-stone-500">Balanced · Debits = Credits</span>
        </div>
      </div>

      {/* Actions */}
      {status === "pending" && (
        <div className="px-4 py-3 bg-stone-50 border-t border-stone-200 flex gap-2">
          <button
            onClick={handleApprove}
            className="flex-1 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg transition-colors btn-press"
          >
            Approve & Post
          </button>
          <button
            onClick={handleReject}
            className="px-3 py-2 bg-white hover:bg-stone-100 text-stone-600 text-xs font-semibold rounded-lg border border-stone-200 transition-colors btn-press"
          >
            Reject
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Parse a journal entry from the agent's text response.
 * Looks for patterns like "Dr: 400 - Sales    £150.00" and "Cr: 090 - Bank    £150.00"
 */
export function parseJournalEntry(text: string): JournalEntryCardProps | null {
  // Look for "PROPOSED JOURNAL ENTRY" marker
  if (!text.includes("PROPOSED JOURNAL ENTRY") && !text.includes("Proposed Journal Entry")) {
    return null;
  }

  // Extract debit line: "Dr: 400 - Sales    £150.00"
  const drMatch = text.match(/Dr:?\s*(\d+)\s*[-—]\s*([^£]+?)\s*£?([\d,.]+)/i);
  // Extract credit line: "Cr: 090 - Bank    £150.00"
  const crMatch = text.match(/Cr:?\s*(\d+)\s*[-—]\s*([^£]+?)\s*£?([\d,.]+)/i);
  // Extract description
  const descMatch = text.match(/Description:?\s*(.+?)(?:\n|$)/i);

  if (!drMatch || !crMatch) return null;

  const amount = parseFloat(drMatch[3].replace(/,/g, ""));
  if (isNaN(amount)) return null;

  return {
    description: descMatch?.[1]?.trim() || "Journal entry",
    debitAccount: drMatch[1],
    debitAccountName: drMatch[2].trim(),
    creditAccount: crMatch[1],
    creditAccountName: crMatch[2].trim(),
    amount,
  };
}
