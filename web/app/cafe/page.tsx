"use client";

import { useEffect, useRef, useState } from "react";
import { SikiMascot } from "@/components/SikiMascot";
import { AnimatedNumber } from "@/components/AnimatedNumber";
import { Sparkline } from "@/components/dither-kit/sparkline";

/**
 * /cafe — Siki's Monday Briefing (hackathon spike: Matcha Mochi, City Road).
 *
 * Progressive-disclosure layout: a café owner isn't an analyst. Three
 * numbered beats — what's moving, the money hiding, what to do Monday —
 * each one dominant element per screen. Everything expert-level lives
 * under collapsed <details>. Final rail turns curiosity into agency:
 * the till is theirs already; the books can be too.
 *
 * Production serves a frozen snapshot (no standing agent dependency); the
 * Manus run that wrote the copy is linked, public, and replayable.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8080";

type Move = {
  item: string; pct_change: number; units_per_week: number; weekly: number[];
};
type Briefing = {
  cafe: { name: string; pos: string };
  sell: {
    window: { start: string; end: string; weeks: number };
    totals: {
      transactions: number; transactions_per_day: number;
      avg_basket_gbp: number; revenue_gbp: number;
    };
    risers: Move[];
    fallers: Move[];
    attach: { rate: number; weekly_opportunity_gbp: number; matcha_transactions: number };
    daypart_share: Record<string, number>;
    top_items_by_revenue: { item: string; revenue_gbp: number }[];
  };
  spend: { by_supplier_gbp: { supplier: string; total_gbp: number }[]; period: string };
  nudges: { title: string; rationale: string; impact_gbp: number | null }[];
  copy: {
    headline: string; sell_summary: string;
    nudges: { title: string; rationale: string; impact_gbp: number | null }[];
    industry_trend: { claim: string; source_name: string; source_url: string };
    supplier_email_draft: string;
  };
  benchmarks: { cogs: string; attach: number };
  manus: { status: string; reason?: string; task_id?: string; task_url?: string; share_url?: string };
};

const gbp = (n: number) => Math.round(n).toLocaleString("en-GB");

function BeatLabel({ n, text }: { n: string; text: string }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-widest text-sky-700">
      Siki noticed · {n} — {text}
    </p>
  );
}

export default function CafeBriefingPage() {
  const [data, setData] = useState<Briefing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const tries = useRef(0);

  const load = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/cafe/briefing`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const b: Briefing = await res.json();
      setData(b);
      tries.current += 1;
      if (b.manus.status === "working" && tries.current < 40) setTimeout(load, 8000);
    } catch (e) {
      try {
        const res = await fetch(`${API_BASE}/api/cafe/briefing?offline=1`);
        if (res.ok) setData(await res.json());
        else setError(String(e));
      } catch {
        setError(String(e));
      }
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) {
    return <main className="mx-auto max-w-3xl p-10 text-sm text-stone-500">Couldn’t load the briefing ({error}).</main>;
  }
  if (!data) {
    return <main className="mx-auto max-w-3xl p-10 text-sm text-stone-400">Siki is reading this week’s tills…</main>;
  }

  const { sell, spend, copy, nudges, manus } = data;
  const riser = sell.risers[0];
  const faller = sell.fallers[0];
  const agentLink = manus.share_url || manus.task_url;
  const doNudges = (copy.nudges?.length ? copy.nudges : nudges).slice(0, 3);

  return (
    <main className="min-h-screen bg-stone-50 text-stone-900">
      <div className="mx-auto max-w-3xl px-6 pb-16 pt-10">

        {/* -------------------- hook -------------------- */}
        <header className="flex items-start gap-5">
          <SikiMascot size={84} mood={manus.status === "done" ? "celebrate" : "look"} className="mt-1 shrink-0" />
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-sky-700">
              Siki’s Monday Briefing · {data.cafe.name}
            </p>
            <h1 className="mt-1.5 text-2xl font-semibold leading-snug md:text-3xl">
              {copy.headline}
            </h1>
            <p className="mt-2 text-sm text-stone-500">
              I read {sell.window.weeks} weeks of tills ({sell.window.start} → {sell.window.end}).
              Three numbers tell the story.
            </p>
          </div>
        </header>

        {/* -------------------- beat 1: what's moving -------------------- */}
        {riser && (
          <section className="mt-10 scroll-mt-8 rounded-3xl border border-stone-200 bg-white p-6 shadow-sm md:p-7">
            <BeatLabel n="01" text="one thing is taking off" />
            <div className="mt-3 flex items-baseline gap-2">
              <AnimatedNumber
                value={riser.weekly[riser.weekly.length - 1]}
                className="text-5xl font-semibold tabular-nums text-emerald-950"
              />
              <span className="text-sm text-stone-500">{riser.item} last week</span>
              <span className="ml-auto rounded-full bg-emerald-100 px-3 py-1 text-sm font-semibold text-emerald-800">
                +{riser.pct_change}% this month
              </span>
            </div>
            <Sparkline data={riser.weekly} color="green" animate className="mt-4 h-24 w-full" />
            <p className="mt-3 text-sm leading-relaxed text-stone-600">{copy.sell_summary}</p>
            {faller && (
              <div className="mt-4 flex items-center gap-3 rounded-2xl bg-rose-50/70 px-4 py-3 text-sm">
                <span className="truncate text-rose-950">▼ {faller.item}</span>
                <span className="ml-auto shrink-0 font-semibold tabular-nums text-rose-600">
                  {faller.pct_change}% · {faller.units_per_week}/wk
                </span>
              </div>
            )}
          </section>
        )}

        {/* -------------------- beat 2: money hiding -------------------- */}
        <section className="mt-6 rounded-3xl border border-stone-200 bg-white p-6 shadow-sm md:p-7">
          <BeatLabel n="02" text="money is hiding in the gap" />
          <div className="mt-3 flex items-baseline gap-2">
            <AnimatedNumber
              value={sell.attach.weekly_opportunity_gbp}
              prefix="£"
              suffix="/week"
              className="text-5xl font-semibold tabular-nums text-sky-800"
            />
          </div>
          <p className="mt-2 text-sm leading-relaxed text-stone-600">
            Only <b>{(sell.attach.rate * 100).toFixed(0)}%</b> of matcha drinks leave with a cake or
            pastry. Typical cafés attach closer to {Math.round(data.benchmarks.attach * 100)}%
            (indicative). Closing that gap is worth the number above.
          </p>
          {/* two-bar comparison */}
          <div className="mt-4 space-y-2">
            <div>
              <div className="flex justify-between text-[11px] text-stone-500">
                <span>This café</span><span>{(sell.attach.rate * 100).toFixed(0)}%</span>
              </div>
              <div className="mt-1 h-2.5 w-full rounded-full bg-stone-100">
                <div className="h-2.5 rounded-full bg-orange-400" style={{ width: `${sell.attach.rate * 100}%` }} />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-[11px] text-stone-500">
                <span>Typical café</span><span>{Math.round(data.benchmarks.attach * 100)}%</span>
              </div>
              <div className="mt-1 h-2.5 w-full rounded-full bg-stone-100">
                <div className="h-2.5 rounded-full bg-stone-400" style={{ width: `${data.benchmarks.attach * 100}%` }} />
              </div>
            </div>
          </div>
        </section>

        {/* -------------------- beat 3: do this -------------------- */}
        <section className="mt-6 rounded-3xl border border-sky-200 bg-sky-50/50 p-6 shadow-sm md:p-7">
          <BeatLabel n="03" text="three moves for Monday" />
          <div className="mt-4 space-y-3">
            {doNudges.map((n, i) => (
              <div key={i} className="rounded-2xl border border-sky-100 bg-white p-4">
                <div className="flex items-baseline gap-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sky-600 text-[11px] font-bold text-white">
                    {i + 1}
                  </span>
                  <p className="font-semibold text-sky-950">{n.title}</p>
                  {n.impact_gbp != null && n.impact_gbp > 0 && (
                    <span className="ml-auto shrink-0 text-sm font-semibold tabular-nums text-sky-700">
                      £{gbp(n.impact_gbp)}/wk
                    </span>
                  )}
                </div>
                <p className="mt-1.5 pl-7 text-sm leading-relaxed text-stone-600">{n.rationale}</p>
              </div>
            ))}
          </div>
          {copy.supplier_email_draft && (
            <details className="mt-4 rounded-2xl border border-dashed border-stone-300 bg-white/70 px-4 py-3">
              <summary className="cursor-pointer text-sm font-medium text-stone-700">
                I even drafted the supplier email — review before anything sends
              </summary>
              <pre className="mt-3 max-h-52 overflow-y-auto whitespace-pre-wrap rounded-xl bg-stone-50 p-4 text-xs leading-relaxed text-stone-700">
                {copy.supplier_email_draft}
              </pre>
              <p className="mt-2 text-xs text-stone-400">Siki drafts, you decide — always.</p>
            </details>
          )}
        </section>

        {/* -------------------- the curious (collapsed) -------------------- */}
        <section className="mt-6 space-y-3">
          <details className="rounded-2xl border border-stone-200 bg-white px-5 py-4 shadow-sm">
            <summary className="cursor-pointer text-sm font-semibold text-stone-800">
              Everything that’s moving — full list
            </summary>
            <div className="mt-4 space-y-3">
              {[...sell.risers.slice(0, 3).map((m) => ({ ...m, up: true })),
                ...sell.fallers.slice(0, 2).map((m) => ({ ...m, up: false }))].map((m) => (
                <div key={m.item} className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="truncate text-sm font-medium text-stone-800">{m.item}</p>
                      <p className={`text-sm font-semibold tabular-nums ${m.up ? "text-emerald-700" : "text-rose-600"}`}>
                        {m.up ? "+" : ""}{m.pct_change}%
                      </p>
                    </div>
                    <p className="text-xs text-stone-400">{m.units_per_week} units/week, recent</p>
                  </div>
                  <Sparkline data={m.weekly} color={m.up ? "green" : "red"} className="h-8 w-24 shrink-0" />
                </div>
              ))}
              <h4 className="pt-2 text-xs font-semibold uppercase tracking-widest text-stone-400">Top revenue</h4>
              <ul className="space-y-1 text-sm text-stone-600">
                {sell.top_items_by_revenue.slice(0, 4).map((t) => (
                  <li key={t.item} className="flex justify-between">
                    <span>{t.item}</span><span className="font-medium tabular-nums">£{gbp(t.revenue_gbp)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </details>

          <details className="rounded-2xl border border-stone-200 bg-white px-5 py-4 shadow-sm">
            <summary className="cursor-pointer text-sm font-semibold text-stone-800">
              What you’re spending
            </summary>
            <p className="mt-3 text-xs text-stone-400">Supplier bills · {spend.period}</p>
            <ul className="mt-2 divide-y divide-stone-100">
              {spend.by_supplier_gbp.map((s) => (
                <li key={s.supplier} className="flex items-baseline justify-between py-2.5">
                  <span className="text-sm text-stone-800">{s.supplier}</span>
                  <span className="text-sm font-semibold tabular-nums text-stone-900">£{gbp(s.total_gbp)}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 rounded-xl bg-stone-50 p-3 text-xs leading-relaxed text-stone-500">
              {data.benchmarks.cogs.replace("industry rule of thumb", "typical UK ranges · indicative")}
            </p>
          </details>

          <details className="rounded-2xl border border-stone-200 bg-white px-5 py-4 shadow-sm">
            <summary className="cursor-pointer text-sm font-semibold text-stone-800">
              How this was made (the honest bit)
            </summary>
            <div className="mt-3 space-y-2 text-xs leading-relaxed text-stone-500">
              <p>
                Every number on this page was computed by deterministic code from a Square Item Sales
                export — never by an AI. A Manus agent did three things only: wrote the words,
                researched one cited market trend, and drafted the email. It never owns a figure.
              </p>
              {copy.industry_trend.claim && (
                <p className="rounded-xl bg-orange-50/70 p-3 text-orange-950/80">
                  Market: {copy.industry_trend.claim}{" "}
                  <a href={copy.industry_trend.source_url} target="_blank" rel="noreferrer" className="font-medium text-orange-700 underline">
                    {copy.industry_trend.source_name} ↗
                  </a>
                </p>
              )}
              {agentLink && (
                <a href={agentLink} target="_blank" rel="noreferrer" className="inline-block font-medium text-sky-700 underline">
                  Watch the agent’s full run on Manus (public, replayable) ↗
                </a>
              )}
              <p>
                Sales patterns derive from a widely used real-world coffee-shop transaction dataset
                (Maven Analytics, 149k tills), reshaped into a Square export with a matcha-café menu.
                Benchmarks are typical UK café ranges, indicative only. Built at the Manus café hackathon.
              </p>
            </div>
          </details>
        </section>

        {/* -------------------- your turn: agency rail -------------------- */}
        <section className="mt-8 rounded-3xl border border-emerald-200 bg-emerald-50/60 p-6 md:p-7">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-emerald-800">
            Could this be your shop?
          </p>
          <h2 className="mt-2 text-xl font-semibold text-emerald-950">
            Your till is already yours. Your books can be too.
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-emerald-950/70">
            This café is a demo. Yours is one export away: Square Dashboard → Reports →
            Item Sales → Export CSV. And if your books live with an accountant, you can
            see them too — without becoming the accountant.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <a
              href="/books?flow=check&connect=1"
              className="rounded-xl bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-600"
            >
              Run this on my shop →
            </a>
            <p className="text-xs text-emerald-900/60">Free to try · your data stays yours</p>
          </div>
        </section>

        <footer className="mt-8 text-center text-[11px] leading-relaxed text-stone-400">
          A snapshot of what Siki does with the books side, every day —{" "}
          <a href="/" className="font-medium text-sky-700 underline">sikizana</a> ·
          {" "}built at the Manus café hackathon, Matcha Mochi, City Road
        </footer>
      </div>
    </main>
  );
}
