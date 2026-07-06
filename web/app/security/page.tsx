import type { Metadata } from "next";
import Link from "next/link";
import { SikiMascot } from "@/components/SikiMascot";

export const metadata: Metadata = {
  title: "Your data, protected — Sikizana",
  description:
    "Plain-English answers: what Sikizana can see, what it can change, who else sees your data, and how to leave completely.",
};

/**
 * /security — the plain-English trust page, written for a business owner,
 * not a security engineer. It answers the five questions a nervous user
 * actually asks at the connect moment. Linked from the pre-connect
 * consent screen, so every claim here must stay true.
 */

const QUESTIONS = [
  {
    q: "What can Sikizana see?",
    a: "When you connect Xero, Siki can read your invoices, contacts, bank transactions, chart of accounts, and reports (P&L, balance sheet). It reads them on demand — when you ask a question or open the page — rather than bulk-copying your organisation into our database. Until you connect, everything you see is sample data from a fictional business.",
  },
  {
    q: "What can Sikizana change?",
    a: "Nothing, without you. Every write is behind an explicit approval: a journal entry only posts to Xero when you click Approve on its card (the AI literally has no ability to post — the button is the only path), and chase emails only go out for invoices where you clicked Auto-chase. Anything posted can be reversed with one tap.",
  },
  {
    q: "Who else sees my data?",
    a: "Your questions and the Xero data needed to answer them are processed by our AI providers (NVIDIA, with Venice AI as backup) to generate responses — they don't use your data to train models. Receipts you upload are read by Google Gemini Vision. Chase emails and digests are delivered by Postmark. When Siki looks up HMRC guidance, only pre-written generic search queries leave our server — never your text, customer names, or amounts. Nobody else. No advertisers, no data brokers, no selling — ever.",
  },
  {
    q: "How is it protected?",
    a: "Your Xero access tokens are encrypted at rest. Everything is scoped to your private session — one visitor can never see another's books. All traffic runs over HTTPS. Payments are handled by Stripe; we never see card numbers.",
  },
  {
    q: "Can I leave, completely?",
    a: "Yes, in one click. Disconnect instantly revokes our access to your Xero. \"Delete my data\" on the Account page goes further: it revokes the connection AND erases everything we stored — conversations, activity history, chase schedules, and metrics. You can also revoke us any time from Xero's own Connected Apps settings.",
  },
];

export default function SecurityPage() {
  return (
    <main className="min-h-screen bg-stone-100 flex flex-col">
      <nav className="bg-white border-b border-stone-200 px-4 py-3">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-2">
          <Link href="/" className="flex items-center gap-3">
            <SikiMascot size={36} mood="idle" />
            <div>
              <h1 className="text-base font-bold text-stone-900 leading-none">SIKIZANA</h1>
              <p className="text-[10px] text-stone-500 leading-none mt-0.5">
                Get paid faster · Works with Xero
              </p>
            </div>
          </Link>
          <div className="flex items-center gap-2">
            <Link
              href="/privacy"
              className="text-xs text-stone-500 hover:text-stone-700 px-2 py-1 rounded hover:bg-stone-100 btn-press"
            >
              Privacy Policy
            </Link>
            <Link
              href="/books"
              className="text-xs text-stone-500 hover:text-stone-700 px-2 py-1 rounded hover:bg-stone-100 btn-press"
            >
              Open Sikizana
            </Link>
          </div>
        </div>
      </nav>

      <div className="flex-1 max-w-2xl mx-auto w-full px-6 py-12">
        {/* Siki fronts the trust conversation — an owl asking you to ask
            the hard questions is more disarming (and more memorable) than
            a wall of policy text. */}
        <div className="flex items-start gap-4 mb-8">
          <div className="shrink-0">
            <SikiMascot size={72} mood="idle" />
          </div>
          <div className="relative bg-white rounded-2xl border border-stone-200 shadow-sm px-5 py-4">
            <div className="absolute -left-1.5 top-6 w-3 h-3 bg-white border-l border-b border-stone-200 rotate-45" />
            <h2 className="text-xl font-bold text-stone-900 mb-1">
              You&apos;re about to trust me with your books.
            </h2>
            <p className="text-sm text-stone-600">
              So ask me the hard questions — here are the five every business owner should ask,
              answered straight. No legalese, no small print.{" "}
              <span className="text-stone-400">— Siki 🦉</span>
            </p>
          </div>
        </div>

        <div className="space-y-4">
          {QUESTIONS.map((item) => (
            <section
              key={item.q}
              className="bg-white border border-stone-200 rounded-2xl p-5"
            >
              <h3 className="text-base font-semibold text-stone-900 mb-1.5">{item.q}</h3>
              <p className="text-sm text-stone-700 leading-relaxed">{item.a}</p>
            </section>
          ))}
        </div>

        <div className="mt-8 bg-sky-50 border border-sky-200 rounded-2xl p-5 flex items-start gap-4">
          <div className="shrink-0">
            <SikiMascot size={44} mood="celebrate" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-sky-900 mb-1.5">
              The short version
            </h3>
            <p className="text-sm text-sky-800 leading-relaxed">
              Read-only until you approve an action. Encrypted, session-private, never sold,
              never used to train AI. One click to disconnect, one click to erase everything.
              Your books stay yours — I just watch them for you.
            </p>
          </div>
        </div>

        <p className="mt-8 text-xs text-stone-500">
          The full detail lives in our{" "}
          <Link href="/privacy" className="text-sky-600 hover:text-sky-700 underline">
            Privacy Policy
          </Link>
          . Questions? Email{" "}
          <a href="mailto:hello@sikizana.com" className="text-sky-600 hover:text-sky-700 underline">
            hello@sikizana.com
          </a>{" "}
          — a human reads it.
        </p>
      </div>

      <footer className="border-t border-stone-200 bg-white">
        <div className="max-w-6xl mx-auto px-6 py-6 text-center">
          <div className="flex items-center justify-center gap-4 mb-2">
            <Link href="/security" className="text-xs text-stone-500 hover:text-stone-700 transition-colors">
              Security
            </Link>
            <Link href="/privacy" className="text-xs text-stone-500 hover:text-stone-700 transition-colors">
              Privacy Policy
            </Link>
            <Link href="/terms" className="text-xs text-stone-500 hover:text-stone-700 transition-colors">
              Terms of Service
            </Link>
          </div>
          <p className="text-[10px] text-stone-400">
            Built for the Xero App &amp; Agent Hackathon · Encode Club · London 2026
          </p>
        </div>
      </footer>
    </main>
  );
}
