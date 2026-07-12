"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { endpoints, type ActivityEvent, type AggregateActivity } from "@/lib/api";
import { SikiMascot, ZanaMascot } from "@/components/SikiMascot";
import { RotatedReveal } from "@/components/RotatedReveal";
import { useXeroMode } from "@/hooks/useXeroMode";
import { usePersona } from "@/hooks/usePersona";
import { getPersonaCopy, getPersonaTheme } from "@/lib/persona-theme";
import { ModeBadge } from "@/components/ModeBadge";

const EVENT_STYLES: Record<
  ActivityEvent["action"],
  { label: string; badge: string; icon: string }
> = {
  journal_posted: { label: "Journal Posted", badge: "bg-sky-100 text-sky-700", icon: "📝" },
  journal_reversed: { label: "Journal Reversed", badge: "bg-amber-100 text-amber-700", icon: "↩" },
  query_asked: { label: "Query", badge: "bg-stone-100 text-stone-600", icon: "💬" },
  tool_called: { label: "Tool Call", badge: "bg-violet-100 text-violet-700", icon: "🔧" },
  chase_sent: { label: "Chase Email Sent", badge: "bg-amber-100 text-amber-700", icon: "✉️" },
  chase_recovered: { label: "Invoice Paid", badge: "bg-emerald-100 text-emerald-700", icon: "💰" },
  chase_exhausted: { label: "Chase Ladder Finished", badge: "bg-rose-100 text-rose-700", icon: "⚠️" },
};

export default function ActivityPage() {
  const persona = usePersona();
  const copy = getPersonaCopy(persona);
  const theme = getPersonaTheme(persona);
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [aggregate, setAggregate] = useState<AggregateActivity | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { isDemo } = useXeroMode();

  useEffect(() => {
    void endpoints
      .activity()
      .then((data) => {
        setEvents(data.events);
        setAggregate(data.aggregate);
      })
      .catch(() => setError("Couldn't load activity. Please try again."))
      .finally(() => setLoading(false));
  }, []);

  return (
    <main className="min-h-screen bg-stone-100 flex flex-col">
      <RotatedReveal />
      <nav className="bg-white border-b border-stone-200 px-4 py-3">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-2">
          <Link href="/books" className="flex items-center gap-2 group">
            {persona === "zana" ? (
              <ZanaMascot size={28} mood="idle" />
            ) : (
              <SikiMascot size={28} mood="idle" />
            )}
            <span className={`font-bold text-stone-900 transition-colors ${persona === "zana" ? "group-hover:text-rose-600" : "group-hover:text-sky-600"}`}>
              Sikizana
            </span>
          </Link>
          <Link href="/books" className={`text-xs font-medium ${theme.link}`}>
            ← Back to Books
          </Link>
        </div>
      </nav>

      <div className="flex-1 max-w-3xl mx-auto w-full px-4 py-8">
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-2xl font-bold text-stone-900">Activity</h1>
          {isDemo && <ModeBadge isDemo={isDemo} />}
        </div>
        <p className="text-sm text-stone-500 mb-6">
          {isDemo ? copy.activityIntroDemo : copy.activityIntroLive}
        </p>

        {aggregate && (aggregate.queries > 0 || aggregate.journals_posted > 0) && (
          <div className="bg-gradient-to-br from-sky-50 to-violet-50 border border-sky-100 rounded-xl p-4 mb-6 fade-in-up">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-sky-500 mb-1.5">
              This week on Sikizana
            </p>
            <div className="flex flex-wrap gap-x-5 gap-y-1.5">
              {aggregate.queries > 0 && (
                <span className="text-sm text-stone-700">
                  <span className="font-bold text-sky-700">{aggregate.queries}</span> queries asked
                </span>
              )}
              {aggregate.tool_calls > 0 && (
                <span className="text-sm text-stone-700">
                  <span className="font-bold text-violet-700">{aggregate.tool_calls}</span> tools run
                </span>
              )}
              {aggregate.journals_posted > 0 && (
                <span className="text-sm text-stone-700">
                  <span className="font-bold text-sky-700">{aggregate.journals_posted}</span> journals posted
                </span>
              )}
              {aggregate.active_sessions > 1 && (
                <span className="text-sm text-stone-700">
                  <span className="font-bold text-stone-900">{aggregate.active_sessions}</span> active users
                </span>
              )}
            </div>
            <p className="text-[10px] text-stone-400 mt-2">
              Sign in to keep your activity private to your account.
            </p>
          </div>
        )}

        {loading && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white rounded-xl border border-stone-200 p-4 animate-pulse">
                <div className="h-4 bg-stone-200 rounded w-3/4 mb-2" />
                <div className="h-3 bg-stone-100 rounded w-1/2" />
              </div>
            ))}
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {!loading && !error && events.length === 0 && (
          <div className="bg-white rounded-xl border border-stone-200 p-8 text-center">
            {persona === "zana" ? (
              <ZanaMascot size={48} mood="look" />
            ) : (
              <SikiMascot size={48} mood="look" />
            )}
            <p className="text-sm text-stone-500 mt-3">{copy.activityEmpty}</p>
            <Link href="/books" className={`inline-block mt-4 text-xs font-semibold ${theme.link}`}>
              Go to Books →
            </Link>
          </div>
        )}

        {!loading && !error && events.length > 0 && (
          <div className="space-y-2">
            {events.map((event) => {
              const style = EVENT_STYLES[event.action] ?? EVENT_STYLES.query_asked;
              return (
                <div
                  key={event.id}
                  className="bg-white rounded-xl border border-stone-200 p-3.5 fade-in-up"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full ${style.badge}`}>
                          {style.icon} {style.label}
                        </span>
                        <span className="text-[10px] text-stone-400">
                          {new Date(event.created_at).toLocaleString("en-GB", {
                            day: "numeric",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                      <p className="text-sm text-stone-700 mt-1.5 break-words">
                        {event.description}
                      </p>
                      {event.journal_id && (
                        <p className="text-[10px] text-stone-400 mt-1">
                          ID: {event.journal_id}
                        </p>
                      )}
                      {event.action === "journal_posted" && (
                        <Link
                          href={`/books?q=${encodeURIComponent(
                            `Reverse the journal entry "${event.description}"${
                              event.journal_id ? ` (ID ${event.journal_id})` : ""
                            } for £${(event.amount ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}. Propose the reversing journal and wait for my approval.`,
                          )}`}
                          className="inline-block mt-1.5 text-[11px] font-medium text-stone-500 hover:text-amber-700 hover:bg-amber-50 px-2 py-1 -mx-2 rounded btn-press transition-colors"
                        >
                          {copy.activityReverse}
                        </Link>
                      )}
                    </div>
                    {event.amount != null && (
                      <div className="text-right shrink-0">
                        <div
                          className={`text-sm font-bold ${
                            event.action === "journal_posted"
                              ? "text-stone-900"
                              : "text-amber-700"
                          }`}
                        >
                          £{event.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
