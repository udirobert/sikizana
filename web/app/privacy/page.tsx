import type { Metadata } from "next";
import Link from "next/link";
import { SikiMascot } from "@/components/SikiMascot";

export const metadata: Metadata = {
  title: "Privacy Policy — Sikizana",
  description:
    "How Sikizana handles your Xero data, receipts, and conversations.",
};

/**
 * Privacy Policy — required for the Xero App Store listing.
 * Written honestly for what this product actually does: reads Xero data on
 * demand via OAuth, analyses uploaded receipts with vision AI, and processes
 * conversations through third-party LLM providers.
 */
export default function PrivacyPage() {
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
              href="/terms"
              className="text-xs text-stone-500 hover:text-stone-700 px-2 py-1 rounded hover:bg-stone-100 btn-press"
            >
              Terms
            </Link>
            <Link
              href="/books"
              className="text-xs text-stone-500 hover:text-stone-700 px-2 py-1 rounded hover:bg-stone-100 btn-press"
            >
              Open Bookkeeper
            </Link>
          </div>
        </div>
      </nav>

      <div className="flex-1 max-w-2xl mx-auto w-full px-6 py-12">
        <h2 className="text-3xl font-bold text-stone-900 mb-2">Privacy Policy</h2>
        <p className="text-xs text-stone-500 mb-8">Last updated: July 2026</p>

        <div className="space-y-8 text-sm text-stone-700 leading-relaxed">
          <section>
            <h3 className="text-base font-semibold text-stone-900 mb-2">What we access</h3>
            <p className="mb-2">
              Sikizana is an AI bookkeeping assistant for Xero. When you use it, we access:
            </p>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>
                <span className="font-medium">Your Xero accounting data</span> — invoices, bank
                transactions, contacts, accounts, and reports (P&amp;L, balance sheet). This is
                read on demand via Xero&apos;s OAuth API when you ask a question or run a health
                check. We do not bulk-copy your Xero organisation into our own database.
              </li>
              <li>
                <span className="font-medium">Receipts you upload</span> — receipt images or PDFs
                you choose to upload are analysed by vision AI to extract the supplier, amount,
                and date so they can be matched to a bank transaction.
              </li>
              <li>
                <span className="font-medium">Feedback you give</span> — thumbs up/down ratings
                and optional comments on the assistant&apos;s answers, which we store to improve
                the product.
              </li>
            </ul>
          </section>

          <section>
            <h3 className="text-base font-semibold text-stone-900 mb-2">
              Who processes your data
            </h3>
            <p className="mb-2">
              We use a small number of service providers, each for one specific job:
            </p>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>
                <span className="font-medium">NVIDIA (with Venice AI as backup)</span> — the AI
                models that generate the assistant&apos;s answers process your questions and the
                Xero data retrieved to answer them. Your data is not used to train models.
              </li>
              <li>
                <span className="font-medium">Google Gemini</span> — reads receipt images you
                choose to upload, to extract the supplier, amount, and date.
              </li>
              <li>
                <span className="font-medium">Postmark</span> — delivers the emails you approve:
                invoice reminders to your customers and your weekly digest.
              </li>
              <li>
                <span className="font-medium">Stripe</span> — handles payments. We never see
                card numbers.
              </li>
              <li>
                <span className="font-medium">Exa &amp; Firecrawl</span> — used to look up public
                HMRC guidance. Only pre-written generic search queries are sent — never your
                questions, customer names, or amounts.
              </li>
            </ul>
          </section>

          <section>
            <h3 className="text-base font-semibold text-stone-900 mb-2">Writing to Xero</h3>
            <p>
              The assistant can propose journal entries, but nothing is written to your Xero
              organisation without your explicit approval — human-in-the-loop by design. In demo
              mode, journal posts are simulated and never touch a real Xero organisation.
            </p>
          </section>

          <section>
            <h3 className="text-base font-semibold text-stone-900 mb-2">Data retention &amp; your control</h3>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>
                <span className="font-medium">Xero access tokens</span> are stored encrypted so
                the assistant can read your data during your sessions. You can revoke access at
                any time with the Disconnect button in the app, or from Xero&apos;s connected
                apps settings — either immediately invalidates our access.
              </li>
              <li>
                <span className="font-medium">Conversation history, activity trail, and chase
                schedules</span> are stored on our servers, scoped to your private session so no
                other visitor can ever see them.
              </li>
              <li>
                <span className="font-medium">Feedback</span> (ratings and comments) is stored on
                our servers.
              </li>
              <li>
                <span className="font-medium">Delete everything, anytime:</span> the &quot;Delete
                my data&quot; button on your Account page revokes the Xero connection AND
                permanently erases your conversations, activity history, chase schedules, and
                metrics from our servers.
              </li>
            </ul>
          </section>

          <section>
            <h3 className="text-base font-semibold text-stone-900 mb-2">Emails sent on your behalf</h3>
            <p>
              If you approve a chase sequence for an overdue invoice, reminder emails are sent to
              that invoice&apos;s billing contact under your business name, with replies routed to
              your own email address. Sequences stop automatically the moment the invoice is paid,
              and you can cancel them at any time. We never email your customers without your
              explicit approval of that specific invoice&apos;s sequence.
            </p>
          </section>

          <section>
            <h3 className="text-base font-semibold text-stone-900 mb-2">What we don&apos;t do</h3>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>We do not sell your data. Ever.</li>
              <li>We do not share your accounting data with advertisers.</li>
              <li>We do not post to Xero without your approval.</li>
            </ul>
          </section>

          <section>
            <h3 className="text-base font-semibold text-stone-900 mb-2">Cookies</h3>
            <p>
              We use a single session cookie to keep you connected to the backend. No advertising
              or cross-site tracking cookies.
            </p>
          </section>

          <section>
            <h3 className="text-base font-semibold text-stone-900 mb-2">Contact</h3>
            <p>
              Questions about this policy or your data? Email{" "}
              <a href="mailto:hello@sikizana.com" className="text-sky-600 hover:text-sky-700 underline">
                hello@sikizana.com
              </a>
              . For the plain-English version of all of this, see{" "}
              <Link href="/security" className="text-sky-600 hover:text-sky-700 underline">
                how your data is protected
              </Link>
              .
            </p>
          </section>
        </div>
      </div>

      <footer className="border-t border-stone-200 bg-white">
        <div className="max-w-6xl mx-auto px-6 py-6 text-center">
          <div className="flex items-center justify-center gap-4 mb-2">
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
