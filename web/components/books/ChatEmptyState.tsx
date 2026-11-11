"use client";

import { SikiMascotAnimated } from "@/components/SikiMascot";
import { ZanaMascot } from "@/components/ZanaMascot";
import { SectorChatKnows } from "@/components/SectorChatKnows";
import type { SectorId } from "@/lib/sector-benchmarks";
import type { SampleQuery } from "@/lib/xero-samples";
import type { getPersonaTheme, Persona } from "@/lib/persona-theme";

export interface ChatEmptyStateProps {
  persona: Persona;
  theme: ReturnType<typeof getPersonaTheme>;
  staggerShown: boolean;
  showWelcome: boolean;
  provenance: string;
  platformName: string;
  xeroMode: string;
  sector: string | null;
  sectorSaved: boolean;
  starterQueries: SampleQuery[];
  onDismissWelcome: () => void;
  onSectorPick: (value: string) => void;
  onStartSample: (description: string) => void;
  onAsk: (question: string) => void;
}

/** Empty-state: mascot, staggered intro, welcome value-prop card, the one
    onboarding question (sector), and starter queries. */
export function ChatEmptyState({
  persona,
  theme,
  staggerShown,
  showWelcome,
  provenance,
  platformName,
  xeroMode,
  sector,
  sectorSaved,
  starterQueries,
  onDismissWelcome,
  onSectorPick,
  onStartSample,
  onAsk,
}: ChatEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-8">
      {/* Mascot in the empty state — animated, cycling moods */}
      <div className="mb-4 fade-in-up">
        {persona === "siki" ? (
          <SikiMascotAnimated size={100} />
        ) : (
          <ZanaMascot size={100} mood="look" />
        )}
      </div>
      {/* Staggered text reveal for the empty state */}
      <div className={`t-stagger ${staggerShown ? "is-shown" : ""}`}>
        <h2 className="t-stagger-line t-stagger-line--1 text-lg font-semibold text-stone-800 mb-1">
          {persona === "siki"
            ? (showWelcome ? "Welcome! I'm Siki" : "Hi! I'm Siki, your AI Bookkeeper")
            : "I'm Zana. Let's get you paid."}
        </h2>
        <p className="t-stagger-line t-stagger-line--2 text-sm text-stone-500 max-w-sm">
          {persona === "siki"
            ? (showWelcome
              ? "I'm your AI bookkeeper. I read your Xero data, find what needs fixing, and explain your finances in plain English — no accounting jargon."
              : "I reconcile your Xero transactions, find overdue invoices, explain your P&L in plain English, and propose journal entries to fix discrepancies.")
            : "I chase overdue invoices, draft reminder emails, flag non-deductible expenses, and find savings you're missing. No sugarcoating."}
        </p>
      </div>

      {/* First-time welcome banner with value prop */}
      {showWelcome && (
        <div className={`mt-4 w-full max-w-sm border rounded-xl p-4 fade-in-up text-left ${theme.hintBg}`}>
          <div className="flex items-start gap-3">
            <div className="shrink-0 mt-0.5">
              <span className="text-lg">✨</span>
            </div>
            <div className="flex-1">
              <p className="text-xs font-semibold text-sky-900">Here&apos;s what I can do for you</p>
              <ul className="text-xs text-sky-700 mt-1.5 space-y-1">
                <li>💰 <span className="font-medium">Show who owes you</span> — every unpaid invoice, aged 30/60/90 days</li>
                <li>✉️ <span className="font-medium">Chase what you&apos;re owed</span> — escalating reminder emails that work</li>
                <li>📊 <span className="font-medium">Show what&apos;s normal</span> — payment norms for your industry</li>
                <li>📈 <span className="font-medium">Explain your books</span> — P&amp;L, tax estimate, fixes — plain English</li>
              </ul>
              <p className="text-xs text-sky-600 mt-2.5">
                {provenance === "sandbox"
                  ? `The sidebar shows the ${platformName} sandbox books — read-only data, so I can explain and review but never write. Try a question below →`
                  : xeroMode === "demo"
                    ? "The sidebar shows a demo business so you can explore. Try a question below, then connect your Xero to see your real numbers →"
                    : "The sidebar shows a live snapshot of your books. Try a question below to see me in action →"}
              </p>

              {/* The one onboarding question: their sector. Personalizes
                  "is this normal?" against their actual industry instead
                  of guessing from the org name. */}
              <div className="mt-3 pt-3 border-t border-sky-100">
                {sector && !sectorSaved ? (
                  <p className="text-xs text-sky-700">
                    📊 Comparing you against{" "}
                    <span className="font-semibold">{sector.replace("_", " ")}</span>{" "}
                    businesses.
                  </p>
                ) : sectorSaved ? (
                  <p className="text-xs font-medium text-emerald-700 fade-in-up">
                    ✓ Noted — I&apos;ll compare your numbers against{" "}
                    {sector?.replace("_", " ")} businesses.
                  </p>
                ) : (
                  <>
                    <p className="text-xs font-semibold text-sky-900 mb-1.5">
                      One quick question: what&apos;s your line of business?
                    </p>
                    <p className="text-xs text-sky-600 mb-2">
                      So &quot;is this normal?&quot; compares you against YOUR industry.
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        ["retail", "Retail"],
                        ["construction", "Construction"],
                        ["professional_services", "Services"],
                        ["hospitality", "Hospitality"],
                        ["manufacturing", "Manufacturing"],
                        ["wholesale", "Wholesale"],
                        ["music", "Music"],
                      ].map(([value, label]) => (
                        <button
                          key={value}
                          onClick={() => onSectorPick(value)}
                          className="text-xs font-medium px-2 py-1 rounded-full bg-white border border-sky-200 text-sky-700 hover:bg-sky-100 btn-press transition-colors"
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
          <button
            onClick={onDismissWelcome}
            className="text-xs text-sky-600 hover:text-sky-800 mt-2 font-medium"
          >
            Got it, dismiss
          </button>
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-2 w-full max-w-sm">
        <p className="t-stagger-line t-stagger-line--3 text-xs uppercase tracking-wide text-stone-500 font-semibold text-left">
          {showWelcome ? "Try one of these to get started" : "Try a sample query"}
        </p>
        {starterQueries.map((sample, i) => (
          <button
            key={sample.id}
            onClick={() => onStartSample(sample.description)}
            className={`text-left text-xs bg-stone-50 hover:bg-stone-100 border rounded-lg px-3 py-2.5 transition-colors btn-press fade-in-up group ${
              persona === "siki"
                ? "text-stone-600 border-stone-200"
                : "text-stone-600 border-stone-300"
            }`}
            style={{ animationDelay: `${300 + i * 60}ms` }}
          >
            <div className="flex items-center justify-between">
              <div className="font-medium text-stone-800">{sample.title}</div>
              {sample.hint && (
                <span className={`text-[9px] transition-colors ${
                  persona === "siki"
                    ? `text-stone-400 ${theme.sampleHover}`
                    : "text-stone-400 group-hover:text-rose-500"
                }`}>
                  {sample.hint}
                </span>
              )}
            </div>
            <div className="text-stone-500 mt-0.5 line-clamp-2">
              {sample.description}
            </div>
          </button>
        ))}
      </div>

      {/* Siki knows — on-demand sector methodology (chat phase) */}
      {sector && (
        <SectorChatKnows
          sector={sector as SectorId}
          onAsk={onAsk}
        />
      )}
    </div>
  );
}
