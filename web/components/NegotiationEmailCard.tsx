"use client";

import { useState } from "react";
import { getNegotiationCardCopy, type Persona } from "@/lib/persona-theme";
import { SikiMascot, ZanaMascot } from "@/components/SikiMascot";

/**
 * NegotiationEmailCard — renders a drafted chasing email with the
 * negotiation tactic, situation analysis, and psychology behind it.
 *
 * Parses the structured output from `draft_invoice_reminder`:
 *
 *   NEGOTIATION EMAIL
 *   Tactic: calibrated_question
 *   Tactic Label: Calibrated Question
 *   Situation: Second chase — 22 days late, patience wearing thin
 *   Psychology: Ask 'How' or 'What' questions...
 *   To: accounts@cateringco.uk
 *   Subject: Overdue invoice INV-0001...
 *
 *   [email body]
 *
 * Behavioral principles:
 * - Peak-end: the card is a satisfying, actionable close to the agent's response
 * - Copy + mailto: zero infrastructure, works with any email client
 * - Tactic annotation: turns each email into a mini-lesson in negotiation
 */

export interface ParsedNegotiationEmail {
  tactic: string;
  tacticLabel: string;
  situation: string;
  psychology: string;
  to: string;
  subject: string;
  body: string;
}

export function parseNegotiationEmail(text: string): ParsedNegotiationEmail | null {
  if (!text.includes("NEGOTIATION EMAIL")) return null;

  const lines = text.split("\n");
  let tactic = "";
  let tacticLabel = "";
  let situation = "";
  let psychology = "";
  let to = "";
  let subject = "";
  let bodyStartIdx = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith("Tactic: ")) tactic = line.slice(8).trim();
    else if (line.startsWith("Tactic Label: ")) tacticLabel = line.slice(14).trim();
    else if (line.startsWith("Situation: ")) situation = line.slice(11).trim();
    else if (line.startsWith("Psychology: ")) psychology = line.slice(12).trim();
    else if (line.startsWith("To: ")) to = line.slice(4).trim();
    else if (line.startsWith("Subject: ")) subject = line.slice(9).trim();
    else if (line.trim() === "" && subject && bodyStartIdx === -1) {
      bodyStartIdx = i + 1;
    }
  }

  if (!subject) return null;

  const body = bodyStartIdx >= 0
    ? lines.slice(bodyStartIdx).join("\n").trim()
    : "";

  return { tactic, tacticLabel, situation, psychology, to, subject, body };
}

const TACTIC_ICONS: Record<string, string> = {
  mirror: "🪞",
  calibrated_question: "🎯",
  label: "🏷️",
  no_oriented: "🚫",
  accusation_audit: "⚠️",
};

const TACTIC_COLORS: Record<string, string> = {
  mirror: "bg-sky-50 text-sky-700 border-sky-200",
  calibrated_question: "bg-violet-50 text-violet-700 border-violet-200",
  label: "bg-amber-50 text-amber-700 border-amber-200",
  no_oriented: "bg-rose-50 text-rose-700 border-rose-200",
  accusation_audit: "bg-orange-50 text-orange-700 border-orange-200",
};

interface NegotiationEmailCardProps {
  email: ParsedNegotiationEmail;
  persona?: Persona;
}

export function NegotiationEmailCard({ email, persona = "zana" }: NegotiationEmailCardProps) {
  const [copied, setCopied] = useState(false);
  const [showPsychology, setShowPsychology] = useState(false);
  const copy = getNegotiationCardCopy(persona);
  const isZana = persona === "zana";

  const hasEmail = email.to && !email.to.includes("no email on file");
  const fullEmail = `Subject: ${email.subject}\n\n${email.body}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(fullEmail);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  };

  const mailtoHref = hasEmail
    ? `mailto:${encodeURIComponent(email.to)}?subject=${encodeURIComponent(email.subject)}&body=${encodeURIComponent(email.body)}`
    : null;

  const tacticIcon = TACTIC_ICONS[email.tactic] ?? "🎯";
  const tacticColor = TACTIC_COLORS[email.tactic] ?? "bg-stone-50 text-stone-700 border-stone-200";

  return (
    <div
      className={`mt-2 rounded-xl border overflow-hidden fade-in-up ${
        isZana ? "border-rose-200" : "border-stone-200"
      } bg-white`}
    >
      <div className={`px-3 py-2.5 border-b ${copy.headerBorder}`}>
        <div className="flex items-center gap-2 flex-wrap">
          {isZana ? (
            <ZanaMascot size={20} mood="look" className="shrink-0" />
          ) : (
            <SikiMascot size={20} mood="idle" className="shrink-0" />
          )}
          <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${copy.headerBadgeClass}`}>
            {copy.headerTitle}
          </span>
          <span className={`text-[10px] font-bold px-2 py-1 rounded-full border ${tacticColor}`}>
            {tacticIcon} {email.tacticLabel || "Negotiation Tactic"}
          </span>
          <span className="text-[10px] text-stone-500">{email.situation}</span>
        </div>
      </div>

      <div className="px-3 py-2.5">
        <div className="flex items-center gap-2 text-[10px] text-stone-500 mb-1.5">
          <span className="font-medium">To:</span>
          <span className={hasEmail ? "text-stone-700" : "text-amber-600"}>
            {email.to || "[no email on file]"}
          </span>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-stone-500 mb-2">
          <span className="font-medium">Subject:</span>
          <span className="text-stone-700 font-medium">{email.subject}</span>
        </div>
        <pre className="text-xs text-stone-700 whitespace-pre-wrap font-sans leading-relaxed bg-stone-50 rounded-lg p-2.5 border border-stone-100">
{email.body}
        </pre>
      </div>

      <div className="px-3 pb-2">
        <button
          onClick={() => setShowPsychology(!showPsychology)}
          className={`text-[10px] font-medium transition-colors ${copy.psychologyLinkClass}`}
        >
          {showPsychology ? "▾" : "▸"} {copy.psychologyToggle}
        </button>
        {showPsychology && (
          <p className={`text-[10px] text-stone-600 mt-1.5 leading-relaxed rounded-lg p-2 border ${copy.psychologyPanelClass}`}>
            {email.psychology}
          </p>
        )}
      </div>

      <div className={`px-3 py-2.5 border-t flex items-center gap-2 ${copy.footerClass}`}>
        <button
          onClick={handleCopy}
          className="text-[11px] font-semibold px-3 py-1.5 rounded-lg bg-stone-200 text-stone-700 hover:bg-stone-300 transition-colors btn-press"
        >
          {copied ? "✓ Copied" : copy.copyButton}
        </button>
        {mailtoHref && (
          <a
            href={mailtoHref}
            className={`text-[11px] font-semibold px-3 py-1.5 rounded-lg transition-colors btn-press ${copy.mailtoClass}`}
          >
            {copy.mailtoButton}
          </a>
        )}
        {!mailtoHref && (
          <span className="text-[10px] text-amber-600">{copy.noEmailHint}</span>
        )}
      </div>
    </div>
  );
}
