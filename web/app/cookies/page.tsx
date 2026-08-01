import type { Metadata } from "next";
import Link from "next/link";
import { SikiMascot } from "@/components/SikiMascot";

export const metadata: Metadata = {
  title: "Cookie Policy — Sikizana",
  description: "What cookies Sikizana uses and why.",
};

/**
 * Cookie Policy — Xero App Store requires a dedicated cookie policy page.
 * Sikizana uses exactly one cookie (the session cookie), so this page is
 * short and honest by design.
 */
export default function CookiePolicyPage() {
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
              Privacy
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
        <div className="flex items-start gap-4 mb-6">
          <div className="shrink-0">
            <SikiMascot size={64} mood="idle" />
          </div>
          <div className="relative bg-white rounded-2xl border border-stone-200 shadow-sm px-5 py-4">
            <div className="absolute -left-1.5 top-6 w-3 h-3 bg-white border-l border-b border-stone-200 rotate-45" />
            <h2 className="text-2xl font-bold text-stone-900 mb-1">Cookie Policy</h2>
            <p className="text-sm text-stone-600">
              One cookie. That&apos;s it. Here&apos;s exactly what it is and why it&apos;s there.{" "}
              <span className="text-stone-400">— Siki 🦉</span>
            </p>
          </div>
        </div>
        <p className="text-xs text-stone-500 mb-8">Last updated: July 2026</p>

        <div className="space-y-8 text-sm text-stone-700 leading-relaxed">
          <section>
            <h3 className="text-base font-semibold text-stone-900 mb-2">
              The one cookie we set
            </h3>
            <div className="bg-white rounded-xl border border-stone-200 p-4 mb-3">
              <table className="w-full text-xs">
                <tbody>
                  <tr className="border-b border-stone-100">
                    <td className="font-semibold text-stone-900 py-2 pr-4 align-top w-32">Name</td>
                    <td className="py-2 text-stone-600">
                      <code className="bg-stone-100 px-1.5 py-0.5 rounded">sikizana_session</code>
                    </td>
                  </tr>
                  <tr className="border-b border-stone-100">
                    <td className="font-semibold text-stone-900 py-2 pr-4 align-top">Purpose</td>
                    <td className="py-2 text-stone-600">
                      Keeps you connected to the backend so your chat history, findings, and
                      Xero connection stay linked to your browser across page loads.
                    </td>
                  </tr>
                  <tr className="border-b border-stone-100">
                    <td className="font-semibold text-stone-900 py-2 pr-4 align-top">Type</td>
                    <td className="py-2 text-stone-600">First-party, strictly necessary</td>
                  </tr>
                  <tr className="border-b border-stone-100">
                    <td className="font-semibold text-stone-900 py-2 pr-4 align-top">Lifetime</td>
                    <td className="py-2 text-stone-600">
                      30 days sliding — each visit refreshes the expiry. Inactive for 30 days
                      and it expires on its own.
                    </td>
                  </tr>
                  <tr className="border-b border-stone-100">
                    <td className="font-semibold text-stone-900 py-2 pr-4 align-top">Attributes</td>
                    <td className="py-2 text-stone-600">
                      <code className="bg-stone-100 px-1 py-0.5 rounded">HttpOnly</code>{" "}
                      (JavaScript can&apos;t read it),{" "}
                      <code className="bg-stone-100 px-1 py-0.5 rounded">SameSite=Lax</code>{" "}
                      (blocks cross-site attacks),{" "}
                      <code className="bg-stone-100 px-1 py-0.5 rounded">Secure</code> in
                      production (HTTPS only).
                    </td>
                  </tr>
                  <tr>
                    <td className="font-semibold text-stone-900 py-2 pr-4 align-top">Contains</td>
                    <td className="py-2 text-stone-600">
                      A random session ID. No personal data, no email, no accounting data — just
                      an opaque token that lets the server recognise you across requests.
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h3 className="text-base font-semibold text-stone-900 mb-2">
              What we don&apos;t use
            </h3>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>No advertising or tracking cookies (Google Ads, Meta Pixel, etc.)</li>
              <li>No third-party analytics cookies</li>
              <li>No social media embed cookies</li>
              <li>No cookie consent banner — because there&apos;s nothing to consent to. The one cookie is strictly necessary for the app to function.</li>
            </ul>
          </section>

          <section>
            <h3 className="text-base font-semibold text-stone-900 mb-2">
              Browser storage
            </h3>
            <p>
              Sikizana also uses{" "}
              <code className="bg-stone-100 px-1 py-0.5 rounded">localStorage</code> on your
              device to remember your persona preference (Siki or Zana), saved findings, and
              chat drafts between visits. This is browser-local storage, not a cookie — it never
              leaves your device. Clearing your browser data removes it.
            </p>
          </section>

          <section>
            <h3 className="text-base font-semibold text-stone-900 mb-2">
              Managing the cookie
            </h3>
            <p>
              Because the session cookie is strictly necessary, disabling it means Sikizana
              can&apos;t keep you connected — every page load starts a fresh session. You can
              delete it anytime from your browser settings, or use{" "}
              <Link href="/account" className="text-sky-600 hover:text-sky-700 underline">
                Delete my data
              </Link>{" "}
              on the Account page, which revokes the Xero connection and erases all server-side
              data (the cookie itself is dropped when you clear browser data).
            </p>
          </section>

          <section>
            <h3 className="text-base font-semibold text-stone-900 mb-2">Contact</h3>
            <p>
              Questions about cookies? Email{" "}
              <a href="mailto:hello@persidian.com" className="text-sky-600 hover:text-sky-700 underline">
                hello@persidian.com
              </a>
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
            <Link href="/cookies" className="text-xs text-stone-500 hover:text-stone-700 transition-colors">
              Cookie Policy
            </Link>
          </div>
          <p className="text-[10px] text-stone-400">
            Sikizana · AI finance assistant for Xero · Human-in-the-loop by design
          </p>
        </div>
      </footer>
    </main>
  );
}
