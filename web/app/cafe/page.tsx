"use client";

import { useEffect, useRef, useState } from "react";

/**
 * /cafe — Monday Briefing (hackathon spike: Matcha Mochi, City Road).
 *
 * Deterministic facts from /api/cafe/briefing; prose + cited industry trend
 * enriched by a Manus agent task (numbers are always computed by code).
 * If the network or agent fails, we fall back to the ?offline=1 frozen
 * fixture so the demo never dies on stage.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8080";

type Nudge = { title: string; rationale: string; impact_gbp: number | null };
type Briefing = {
  cafe: { name: string; pos: string };
  sell: {
    window: { start: string; end: string; weeks: number };
    totals: {
      transactions: number; transactions_per_day: number;
      avg_basket_gbp: number; revenue_gbp: number;
    };
    risers: { item: string; pct_change: number; units_per_week: number }[];
    fallers: { item: string; pct_change: number; units_per_week: number }[];
    attach: { rate: number; weekly_opportunity_gbp: number; matcha_transactions: number };
    daypart_share: Record<string, number>;
    top_items_by_revenue: { item: string; revenue_gbp: number }[];
  };
  spend: { by_supplier_gbp: { supplier: string; total_gbp: number }[]; period: string };
  nudges: Nudge[];
  copy: {
    headline: string; sell_summary: string; nudges: Nudge[];
    industry_trend: { claim: string; source_name: string; source_url: string };
    supplier_email_draft: string;
  };
  benchmarks: { cogs: string; attach: number };
  manus: { status: string; reason?: string };
};

const gbp = (n: number) =>
  "£" + Math.round(n).toLocaleString("en-GB");

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
      if (b.manus.status === "working" && tries.current < 40) {
        setTimeout(load, 8000); // poll until the agent lands
      }
    } catch (e) {
      // venue wifi insurance: serve the frozen enriched fixture
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
    return <main className="mx-auto max-w-3xl p-8 text-stone-700">
      Failed to load briefing: {error}
    </main>;
  }
  if (!data) {
    return <main className="mx-auto max-w-3xl p-8 text-stone-500">
      Reading the tills…
    </main>;
  }

  const { sell, spend, copy, nudges, manus } = data;
  const agentLive = manus.status === "done";

  return (
    <main className="mx-auto max-w-5xl px-6 py-10 font-sans text-stone-900">
      {/* header */}
      <header className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-widest text-emerald-700">
          Monday Briefing · {data.cafe.name}
        </p>
        <h1 className="mt-2 text-3xl font-semibold leading-tight md:text-4xl">
          {copy.headline}
        </h1>
        <p className="mt-2 text-sm text-stone-500">
          {sell.window.start} → {sell.window.end} · {sell.totals.transactions.toLocaleString()} tills
          · {gbp(sell.totals.revenue_gbp)} revenue · avg basket £{sell.totals.avg_basket_gbp}
        </p>
        <p className="mt-1 text-xs text-stone-400">
          {agentLive
            ? "✦ Numbers computed by code · words and live market research by a Manus agent"
            : manus.status === "working"
              ? "✦ Agent is writing up and researching trends live…"
              : "✦ Numbers computed by code"}
        </p>
      </header>

      {/* nudges */}
      <section className="mb-10">
        <h2 className="mb-3 text-lg font-semibold">Do these three things</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {(copy.nudges?.length ? copy.nudges : nudges).slice(0, 3).map((n, i) => (
            <div key={i} className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-5">
              <p className="font-semibold text-emerald-900">{n.title}</p>
              <p className="mt-2 text-sm leading-relaxed text-emerald-900/70">{n.rationale}</p>
              {n.impact_gbp != null && n.impact_gbp > 0 && (
                <p className="mt-3 text-2xl font-semibold text-emerald-700">
                  {gbp(n.impact_gbp)}<span className="text-sm font-normal text-stone-500">/week</span>
                </p>
              )}
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-6 md:grid-cols-2">
        {/* sell */}
        <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
          <h2 className="mb-1 text-lg font-semibold">What’s selling</h2>
          <p className="mb-4 text-sm leading-relaxed text-stone-600">{copy.sell_summary}</p>
          <ul className="space-y-2 text-sm">
            {sell.risers.map((r) => (
              <li key={r.item} className="flex justify-between">
                <span>▲ {r.item}</span>
                <span className="font-semibold text-emerald-700">+{r.pct_change}% · {r.units_per_week}/wk</span>
              </li>
            ))}
            {sell.fallers.map((f) => (
              <li key={f.item} className="flex justify-between">
                <span>▼ {f.item}</span>
                <span className="font-semibold text-rose-600">{f.pct_change}% · {f.units_per_week}/wk</span>
              </li>
            ))}
            <li className="flex justify-between border-t border-stone-100 pt-2">
              <span>Matcha + cake attach rate</span>
              <span className="font-semibold">
                {(sell.attach.rate * 100).toFixed(0)}%
                <span className="ml-1 text-xs text-stone-400">
                  (worth {gbp(sell.attach.weekly_opportunity_gbp)}/wk at benchmark)
                </span>
              </span>
            </li>
          </ul>
          <h3 className="mt-5 mb-2 text-xs font-semibold uppercase tracking-widest text-stone-400">
            Top revenue
          </h3>
          <ul className="space-y-1 text-sm text-stone-600">
            {sell.top_items_by_revenue.slice(0, 4).map((t) => (
              <li key={t.item} className="flex justify-between">
                <span>{t.item}</span><span className="font-medium">{gbp(t.revenue_gbp)}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* spend */}
        <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
          <h2 className="mb-1 text-lg font-semibold">What you’re spending</h2>
          <p className="mb-4 text-sm text-stone-500">Supplier bills {spend.period}</p>
          <ul className="space-y-2 text-sm">
            {spend.by_supplier_gbp.map((s) => (
              <li key={s.supplier} className="flex justify-between">
                <span>{s.supplier}</span><span className="font-medium">{gbp(s.total_gbp)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-4 rounded-xl bg-stone-50 p-3 text-xs text-stone-500">
            {data.benchmarks.cogs}
          </p>
        </section>
      </div>

      {/* trend + email */}
      <div className="mt-6 grid gap-6 md:grid-cols-2">
        {copy.industry_trend.claim && (
          <section className="rounded-2xl border border-sky-200 bg-sky-50/60 p-6">
            <h2 className="mb-2 text-lg font-semibold text-sky-900">What the market’s doing</h2>
            <p className="text-sm leading-relaxed text-sky-900/80">{copy.industry_trend.claim}</p>
            <a href={copy.industry_trend.source_url} target="_blank" rel="noreferrer"
               className="mt-2 inline-block text-xs font-medium text-sky-700 underline">
              {copy.industry_trend.source_name} ↗
            </a>
          </section>
        )}
        {copy.supplier_email_draft && (
          <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
            <h2 className="mb-2 text-lg font-semibold">Drafted for your approval</h2>
            <pre className="whitespace-pre-wrap rounded-xl bg-stone-50 p-4 text-xs leading-relaxed text-stone-700">
              {copy.supplier_email_draft}
            </pre>
            <button className="mt-3 rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-600">
              Review &amp; send
            </button>
          </section>
        )}
      </div>

      <footer className="mt-10 border-t border-stone-200 pt-4 text-xs leading-relaxed text-stone-400">
        Sales patterns derived from a widely used real-world coffee-shop transaction dataset
        (Maven Analytics, 149k transactions), reshaped into a Square Item Sales export with a
        matcha-café menu. Every figure above is computed by deterministic code; the agent layer
        handles wording, research and drafting. Built at the Manus café hackathon.
      </footer>
    </main>
  );
}
