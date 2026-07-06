"use client";

import { useState } from "react";
import { ApiError, endpoints, type JournalPostResponse } from "@/lib/api";

/** Stable per-card keys so a retried or double-submitted post/reversal can
 * never create a duplicate journal in Xero (backend passes them through as
 * the Idempotency-Key header). */
function newIdempotencyKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `jk-${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
}

/**
 * JournalEntryCard — visual card for a proposed journal entry.
 *
 * When the agent proposes a journal entry, it's displayed as a card
 * with the debit/credit details and Approve/Reject buttons.
 * Approve posts the entry to the backend (POST /api/xero/journal);
 * in demo mode the backend simulates the write and the card says so
 * honestly instead of pretending it hit Xero.
 */

export interface ParsedJournalEntry {
  description: string;
  debitAccount: string;
  debitAccountName?: string;
  creditAccount: string;
  creditAccountName?: string;
  amount: number;
  /** True when parsing couldn't extract a trustworthy, balanced entry. */
  incomplete?: boolean;
}

interface JournalEntryCardProps extends ParsedJournalEntry {
  threadId?: string;
  onPosted?: (result: JournalPostResponse) => void;
  onReject?: () => void;
}

export function JournalEntryCard({
  description,
  debitAccount,
  debitAccountName,
  creditAccount,
  creditAccountName,
  amount,
  incomplete,
  threadId,
  onPosted,
  onReject,
}: JournalEntryCardProps) {
  const [status, setStatus] = useState<"pending" | "posting" | "posted" | "rejected">("pending");
  const [result, setResult] = useState<JournalPostResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  // One-tap undo on a real (non-demo) posted entry.
  const [reverseState, setReverseState] = useState<
    "idle" | "confirm" | "reversing" | "reversed"
  >("idle");
  const [reverseMessage, setReverseMessage] = useState<string | null>(null);
  const [reverseError, setReverseError] = useState<string | null>(null);
  // Fixed for the card's lifetime — retries reuse the same key.
  const [postKey] = useState(newIdempotencyKey);
  const [reverseKey] = useState(newIdempotencyKey);

  const handleApprove = async () => {
    if (status === "posting") return;
    setStatus("posting");
    setError(null);
    try {
      const res = await endpoints.xero.journal({
        description,
        debit_account_code: debitAccount,
        credit_account_code: creditAccount,
        amount,
        thread_id: threadId || undefined,
        idempotency_key: postKey,
      });
      setResult(res);
      setStatus("posted");
      onPosted?.(res);
    } catch (e) {
      // Entry stays approvable so the user can retry.
      setStatus("pending");
      setError(
        e instanceof ApiError
          ? `Posting failed (${e.status}): ${e.message}`
          : "Posting failed. Check your connection and try again.",
      );
    }
  };

  const handleReject = () => {
    setStatus("rejected");
    onReject?.();
  };

  const handleReverse = async () => {
    if (reverseState === "reversing") return;
    setReverseState("reversing");
    setReverseError(null);
    try {
      // Pass the ORIGINAL entry's fields — the backend swaps debit/credit
      // and prefixes "Reversal:".
      const res = await endpoints.xero.reverseJournal({
        description,
        debit_account_code: debitAccount,
        credit_account_code: creditAccount,
        amount,
        thread_id: threadId || undefined,
        idempotency_key: reverseKey,
      });
      setReverseMessage(res.message);
      setReverseState("reversed");
    } catch (e) {
      setReverseState("confirm");
      setReverseError(
        e instanceof ApiError
          ? e.status === 403
            ? "Reversing entries requires the Pro plan."
            : e.message
          : "Reversal failed. Check your connection and try again.",
      );
    }
  };

  const isDemo = result?.mode === "demo";

  return (
    <div className="border border-stone-200 rounded-xl overflow-hidden bg-white fade-in-up">
      {/* Header */}
      <div className="bg-stone-50 border-b border-stone-200 px-4 py-2.5 flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-wide text-stone-600">
          Proposed Journal Entry
        </span>
        {(status === "pending" || status === "posting") && (
          <span className="text-[10px] text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full font-medium">
            Awaiting approval
          </span>
        )}
        {status === "posted" && (
          <span
            className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
              isDemo ? "text-amber-700 bg-amber-50" : "text-emerald-600 bg-emerald-50"
            }`}
          >
            {isDemo ? "Simulated — demo mode" : "✓ Posted to Xero"}
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

        {/* Balanced indicator + plain-English gloss */}
        <div className="mt-3 pt-2 border-t border-stone-100">
          <div className="flex items-center gap-1.5">
            <svg aria-hidden="true" className="w-3 h-3 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-[10px] text-stone-500">Balanced · Debits = Credits</span>
          </div>
          <p className="text-[10px] text-stone-400 mt-1">
            In plain English: this records £
            {amount.toLocaleString(undefined, { minimumFractionDigits: 2 })} against{" "}
            <span className="font-medium text-stone-500">{debitAccountName || `account ${debitAccount}`}</span>{" "}
            (Dr = where the value goes) and{" "}
            <span className="font-medium text-stone-500">{creditAccountName || `account ${creditAccount}`}</span>{" "}
            (Cr = where it comes from). Nothing leaves your bank — it corrects how the amount
            is categorised in your books.
          </p>
        </div>

        {/* Post error — entry stays approvable */}
        {error && (
          <p className="mt-2 text-xs text-red-600 fade-in-up" role="alert">
            {error}
          </p>
        )}

        {/* Backend confirmation, verbatim */}
        {status === "posted" && result && (
          <p className={`mt-2 text-xs fade-in-up ${isDemo ? "text-amber-700" : "text-emerald-700"}`}>
            {result.message}
          </p>
        )}

        {/* Reverse — one-tap undo for a real posted entry */}
        {status === "posted" && result?.posted && !isDemo && (
          <div className="mt-2 pt-2 border-t border-stone-100 fade-in-up">
            {reverseState === "idle" && (
              <button
                onClick={() => setReverseState("confirm")}
                className="text-[11px] font-medium text-stone-500 hover:text-amber-700 hover:bg-amber-50 px-2 py-1 -mx-2 rounded btn-press transition-colors"
                aria-label={`Reverse this journal entry for £${amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
              >
                ↩ Reverse this entry
              </button>
            )}
            {(reverseState === "confirm" || reverseState === "reversing") && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-stone-700">
                  Post a reversing entry for £
                  {amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}?
                </span>
                <button
                  onClick={() => void handleReverse()}
                  disabled={reverseState === "reversing"}
                  className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-amber-600 text-white hover:bg-amber-700 btn-press transition-colors disabled:opacity-60 disabled:cursor-wait"
                >
                  {reverseState === "reversing" ? "Reversing…" : "Yes, reverse"}
                </button>
                <button
                  onClick={() => {
                    setReverseState("idle");
                    setReverseError(null);
                  }}
                  disabled={reverseState === "reversing"}
                  className="text-[11px] font-medium px-2.5 py-1 rounded-lg bg-white text-stone-600 border border-stone-200 hover:bg-stone-100 btn-press transition-colors disabled:opacity-60"
                >
                  Cancel
                </button>
              </div>
            )}
            {reverseState === "reversed" && reverseMessage && (
              <p className="text-xs text-amber-700" role="status">
                ↩ {reverseMessage}
              </p>
            )}
            {reverseError && (
              <p className="mt-1 text-xs text-red-600 fade-in-up" role="alert">
                {reverseError}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Actions */}
      {(status === "pending" || status === "posting") &&
        (incomplete ? (
          // Parsing couldn't extract a trustworthy entry — never post garbage.
          <div className="px-4 py-3 bg-stone-50 border-t border-stone-200">
            <p className="text-xs text-stone-600">
              I couldn&apos;t read every detail of this entry reliably, so one-click posting is
              disabled. Ask the agent to propose the entry again with the exact accounts and
              amount, and a fresh card will appear here.
            </p>
          </div>
        ) : (
          <div className="px-4 py-3 bg-stone-50 border-t border-stone-200 flex gap-2">
            <button
              onClick={handleApprove}
              disabled={status === "posting"}
              className="flex-1 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg transition-colors btn-press disabled:opacity-60 disabled:cursor-wait"
            >
              {status === "posting" ? "Posting…" : "Approve & Post"}
            </button>
            <button
              onClick={handleReject}
              disabled={status === "posting"}
              className="px-3 py-2 bg-white hover:bg-stone-100 text-stone-600 text-xs font-semibold rounded-lg border border-stone-200 transition-colors btn-press disabled:opacity-60"
            >
              Reject
            </button>
          </div>
        ))}
    </div>
  );
}

/**
 * Parse a journal entry from the agent's text response.
 * Looks for patterns like "Dr: 400 - Sales    £150.00" and "Cr: 090 - Bank    £150.00"
 */
export function parseJournalEntry(text: string): ParsedJournalEntry | null {
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

  // Debit and credit amounts must agree — otherwise the entry can't be
  // trusted for a one-click post and the user must approve via chat.
  const crAmount = parseFloat(crMatch[3].replace(/,/g, ""));
  const incomplete =
    isNaN(crAmount) || Math.abs(crAmount - amount) > 0.005 || !descMatch?.[1]?.trim();

  return {
    description: descMatch?.[1]?.trim() || "Journal entry",
    debitAccount: drMatch[1],
    debitAccountName: drMatch[2].trim(),
    creditAccount: crMatch[1],
    creditAccountName: crMatch[2].trim(),
    amount,
    incomplete,
  };
}
