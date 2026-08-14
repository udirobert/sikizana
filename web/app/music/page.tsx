"use client";

import Link from "next/link";
import { SiteNav } from "@/components/SiteNav";
import { MarketingCtas } from "@/components/MarketingCtas";
import { MarketingFooter } from "@/components/MarketingFooter";
import {
  AgeingEvidence,
  CheckProofCard,
  DuplicateEvidence,
  SummaryEvidence,
} from "@/components/CheckProofCard";
import { JobStrip, PersonaEntryStrip } from "@/components/PersonaEntryStrip";

/**
 * Music landing — same shell as home: claim, proof (one finding open), three paths.
 */
export default function MusicLandingPage() {
  return (
    <main className="min-h-screen bg-stone-50 overflow-x-hidden">
      <SiteNav variant="marketing" />

      <section className="max-w-6xl mx-auto px-6 pt-14 pb-12">
        <div className="grid grid-cols-1 lg:grid-cols-[1.02fr_0.98fr] gap-10 items-center">
          <div className="text-left">
            <div className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-rose-700 fade-in-up">
              Built for music · Read-only Xero checks
            </div>
            <h1 className="mt-5 text-4xl sm:text-6xl font-bold text-stone-950 leading-[1.03] tracking-tight fade-in-up fade-in-up-delay-1">
              MTD is coming.
              <br />
              Your books still aren&rsquo;t watched.
            </h1>
            <p className="mt-5 text-lg text-stone-600 max-w-xl leading-relaxed fade-in-up fade-in-up-delay-2">
              From April 2026 you&rsquo;ll need digital records. Getting onto Xero is the easy
              part — who notices the backline hire you paid twice, or the festival that&rsquo;s
              gone quiet on a £2,400 invoice? Siki does.
            </p>
            <MarketingCtas
              sampleHref="/books?flow=check&demo=music"
              connectHref="/books?flow=check&demo=music&connect=1"
            />
            <p className="mt-3 text-xs text-stone-500">
              Or{" "}
              <Link href="/check/music" className="font-semibold text-sky-700 hover:text-sky-800">
                try a music quick check →
              </Link>
            </p>
          </div>

          <div className="fade-in-up fade-in-up-delay-3">
            <CheckProofCard
              eyebrow="Ember & Oak Ltd · sample books"
              title="3 things to review"
              sikiMood="look"
              findings={[
                {
                  id: "overdue",
                  label: "Late festival invoice",
                  value: "£2,400",
                  tone: "bg-rose-50 text-rose-700 border-rose-100",
                  evidence: (
                    <AgeingEvidence
                      rows={[
                        ["Field Day Festival", "30d overdue", "£2,400"],
                        ["Roundhouse", "due now", "£1,850"],
                        ["Roundhouse", "in 20d", "£1,200"],
                      ]}
                    />
                  ),
                },
                {
                  id: "duplicate",
                  label: "Possible duplicate payment",
                  value: "£680",
                  tone: "bg-amber-50 text-amber-700 border-amber-100",
                  evidence: (
                    <DuplicateEvidence
                      rows={[
                        ["24 Jun", "SoundStage Backline", "-£680"],
                        ["25 Jun", "SoundStage Backline", "-£680"],
                      ]}
                    />
                  ),
                },
                {
                  id: "books",
                  label: "Books explained",
                  value: "Ready",
                  tone: "bg-sky-50 text-sky-700 border-sky-100",
                  evidence: (
                    <SummaryEvidence
                      rows={[
                        ["Revenue", "£14.2k", "last 90 days"],
                        ["Net profit", "£1.1k", "thin but positive"],
                        ["Owed to you", "£2,400", "Field Day"],
                      ]}
                    />
                  ),
                },
              ]}
            />
          </div>
        </div>
      </section>

      <JobStrip
        jobs={[
          { title: "Recover overdue", href: "/books?flow=check&persona=zana&demo=music" },
          { title: "Catch duplicates", href: "/books?flow=check&persona=siki&demo=music" },
          { title: "Quick sector check", href: "/check/music" },
        ]}
      />
      <PersonaEntryStrip
        sikiHref="/books?flow=check&persona=siki&demo=music"
        zanaHref="/books?flow=check&persona=zana&demo=music"
      />
      <MarketingFooter />
    </main>
  );
}
