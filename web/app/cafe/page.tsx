"use client";

import { useEffect, useRef, useState } from "react";
import { SikiMascot } from "@/components/SikiMascot";
import { AnimatedNumber } from "@/components/AnimatedNumber";
import { Sparkline } from "@/components/dither-kit/sparkline";

/**
 * /cafe — Siki's Monday Briefing (hackathon spike: Matcha Mochi, City Road).
 *
 * Design follows web/DESIGN.md three zones:
 *   A Signature — mascot + Siki voice + matcha-green dither riser hero
 *   B Proof     — every number computed by deterministic code, scans in 2s,
 *                 honest "indicative" sourcing labels stay visible
 *   C Delight   — earned once: mascot celebrates when the agent lands
 *
 * The agent (Manus) writes prose + researches one cited trend. It never
 * owns a number — nudge impacts are re-pinned server-side.
 * If the network dies, we fall back to the ?offline=1 frozen fixture.
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

export default function CafeBriefingPage() {
  const [data, setData] = useState<Briefing | null>(null);
  const [activity, setActivity] = useState<{ type: string; text: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const lastActivityCount = useRef(0);
  const tries = useRef(0);

  const load = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/cafe/briefing`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const b: Briefing = await res.json();
      setData(b);
      tries.current += 1;
      // Keep the agent feed fresh while it works; one final pull when done.
      if (b.manus.task_id &&
          (b.manus.status === "working" ||
           (b.manus.status === "done" && lastActivityCount.current === 0))) {
        fetch(`${API_BASE}/api/cafe/activity`)
          .then((r) => (r.ok ? r.json() : { events: [] }))
          .then((a) => {
            setActivity(a.events ?? []);
            if (b.manus.status === "done") lastActivityCount.current = 1;
          })
          .catch(() => {});
      }
      if (b.manus.status === "working" && tries.current < 40) {
        setTimeout(load, 8000);
      }
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
    return (
      <main className="mx-auto max-w-3xl p-10 text-sm text-stone-500">
        Couldn’t read the tills ({error}). Is the API running?
      </main>
    );
  }
  if (!data) {
    return (
      <main className="mx-auto max-w-3xl p-10 text-sm text-stone-400">
        Siki is reading this week’s tills…
      </main>
    );
  }

  const { sell, spend, copy, nudges, manus } = data;
  const agentLive = manus.status === "done";
  const riser = sell.risers[0];
  const faller = sell.fallers[0];
  const mascotMood =
    manus.status === "done" ? "celebrate" : manus.status === "working" ? "look" : "idle";

  return (
    <main className="min-h-screen bg-stone-50 text-stone-900">
      <div className="mx-auto max-w-5xl px-6 pb-14 pt-8">
        {/* ============ ZONE A — signature ============ */}
        <header className="relative overflow-hidden rounded-3xl border border-stone-200 bg-white p-6 shadow-sm md:p-8">
          <div className="flex items-start gap-5">
            <SikiMascot size={92} mood={mascotMood} className="mt-1 shrink-0" />
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-sky-700">
                Siki’s Monday Briefing · {data.cafe.name}
              </p>
              <h1 className="mt-1.5 text-2xl font-semibold leading-snug text-stone-900 md:text-[28px]">
                {copy.headline}
              </h1>
              <p className="mt-2 text-sm text-stone-500">
                {sell.window.start} → {sell.window.end} · {data.cafe.pos}
              </p>
              <div className="mt-2 flex items-center gap-2 text-xs text-stone-400">
                {manus.status === "working" && (
                  <>
                    <span className="relative flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sky-400 opacity-75" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-sky-500" />
                    </span>
                    Siki noticed some things — researching the market live…
                  </>
                )}
                {agentLive && "✦ Words + market research by a Manus agent · every number computed by code"}
                {manus.status !== "working" && !agentLive && "Every number computed by code"}
              </div>
            </div>
          </div>

          {/* hero: matcha riser */}
          {riser && (
            <div className="mt-6 grid gap-6 md:grid-cols-[1.4fr_1fr]">
              <div className="rounded-2xl bg-gradient-to-b from-emerald-50/80 to-white p-5">
                <div className="flex items-baseline justify-between">
                  <p className="text-sm font-semibold text-emerald-900">▲ {riser.item}</p>
                  <p className="text-xs text-emerald-700">{riser.weekly.length}-week view</p>
                </div>
                <div className="mt-1 flex items-baseline gap-2">
                  <AnimatedNumber
                    value={riser.weekly[riser.weekly.length - 1]}
                    className="text-4xl font-semibold tabular-nums text-emerald-950"
                  />
                  <span className="text-sm text-stone-500">units last week</span>
                  <span className="ml-auto rounded-full bg-emerald-100 px-2.5 py-0.5 text-sm font-semibold text-emerald-800">
                    +{riser.pct_change}%
                  </span>
                </div>
                <Sparkline
                  data={riser.weekly}
                  color="green"
                  animate
                  className="mt-3 h-20 w-full"
                />
                <p className="mt-2 text-xs leading-relaxed text-stone-500">
                  Vs ~4-week average a month ago. Order matcha + oat milk before the weekend rush.
                </p>
              </div>

              {/* proof strip — scan-first */}
              <div className="grid grid-cols-1 gap-3">
                {[
                  { label: "Weeks of tills read", raw: sell.window.weeks },
                  { label: "Revenue", raw: sell.totals.revenue_gbp, prefix: "£" },
                  { label: "Transactions", raw: sell.totals.transactions },
                  { label: "Avg basket", raw: sell.totals.avg_basket_gbp, prefix: "£" },
                ].map((s) => (
                  <div key={s.label} className="flex items-baseline justify-between rounded-xl border border-stone-100 bg-white px-4 py-2.5">
                    <span className="text-xs text-stone-500">{s.label}</span>
                    <AnimatedNumber
                      value={s.raw}
                      prefix={s.prefix ?? ""}
                      className="text-lg font-semibold tabular-nums text-stone-900"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </header>

        {/* The agent itself — it's a Manus hackathon; show the machinery. */}
        {(manus.task_url || activity.length > 0) && (
          <section className="mt-4 rounded-2xl border border-dashed border-stone-300 bg-white/70 px-5 py-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-widest text-stone-500">
                The agent behind this briefing
              </p>
              <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                agentLive ? "bg-emerald-100 text-emerald-800" : "bg-sky-100 text-sky-800"
              }`}>
                {agentLive ? "✦ Manus finished" : "Manus working…"}
              </span>
            </div>
            <ul className="mt-2 space-y-1">
              {activity.slice(-4).map((e, i) => (
                <li key={i} className="flex gap-2 text-xs text-stone-500">
                  <span className="mt-0.5 shrink-0 text-stone-300">
                    {e.type === "assistant_message" ? "◆" : e.type === "structured_output_result" ? "✦" : "·"}
                  </span>
                  <span className="leading-relaxed">
                    {e.type === "structured_output_result"
                      ? "Extracted the briefing into a typed result (structured output)"
                      : e.text || e.type}
                  </span>
                </li>
              ))}
            </ul>
            {(manus.share_url || manus.task_url) && (
              <a href={manus.share_url || manus.task_url} target="_blank" rel="noreferrer"
                 className="mt-2 inline-block text-xs font-medium text-sky-700 underline">
                Watch the full agent run on Manus ↗
              </a>
            )}
          </section>
        )}

        {/* ============ ZONE B — proof ============ */}
        {/* nudges */}
        <section className="mt-8">
          <h2 className="mb-1 text-lg font-semibold">If you only do three things this week</h2>
          <p className="mb-4 text-xs text-stone-400">
            Actions from your tills — nothing here is guessed.
          </p>
          <div className="grid gap-4 md:grid-cols-3">
            {(copy.nudges?.length ? copy.nudges : nudges).slice(0, 3).map((n, i) => (
              <div key={i} className="flex flex-col rounded-2xl border border-sky-200 bg-sky-50/60 p-5">
                <p className="font-semibold text-sky-900">{n.title}</p>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-sky-900/70">{n.rationale}</p>
                {n.impact_gbp != null && n.impact_gbp > 0 && (
                  <p className="mt-3">
                    <AnimatedNumber
                      value={n.impact_gbp}
                      prefix="£"
                      className="text-2xl font-semibold tabular-nums text-sky-700"
                    />
                    <span className="text-sm text-stone-500">/week</span>
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>

        <div className="mt-6 grid gap-6 md:grid-cols-2">
          {/* sell */}
          <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
            <h2 className="mb-1 text-lg font-semibold">What’s selling</h2>
            <p className="mb-5 text-sm leading-relaxed text-stone-600">{copy.sell_summary}</p>

            <div className="space-y-3">
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
                  <Sparkline
                    data={m.weekly}
                    color={m.up ? "green" : "red"}
                    className="h-8 w-24 shrink-0"
                  />
                </div>
              ))}
            </div>

            <div className="mt-5 rounded-xl bg-stone-50 p-4">
              <div className="flex items-baseline justify-between">
                <p className="text-sm font-medium text-stone-700">Matcha + cake attach rate</p>
                <p className="text-lg font-semibold tabular-nums text-stone-900">
                  {(sell.attach.rate * 100).toFixed(0)}%
                </p>
              </div>
              <p className="mt-1 text-xs text-stone-400">
                Typical café attach ~{Math.round(data.benchmarks.attach * 100)}% (indicative) ·
                closing the gap is worth ~£{gbp(sell.attach.weekly_opportunity_gbp)}/week
              </p>
            </div>
          </section>

          {/* spend */}
          <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
            <h2 className="mb-1 text-lg font-semibold">What you’re spending</h2>
            <p className="mb-4 text-xs text-stone-400">Supplier bills · {spend.period}</p>
            <ul className="divide-y divide-stone-100">
              {spend.by_supplier_gbp.map((s) => (
                <li key={s.supplier} className="flex items-baseline justify-between py-2.5">
                  <span className="text-sm text-stone-800">{s.supplier}</span>
                  <span className="text-sm font-semibold tabular-nums text-stone-900">
                    £{gbp(s.total_gbp)}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-4 rounded-xl bg-stone-50 p-3 text-xs leading-relaxed text-stone-500">
              {data.benchmarks.cogs.replace("industry rule of thumb", "typical UK ranges · indicative")}
            </p>

            <h3 className="mb-2 mt-6 text-xs font-semibold uppercase tracking-widest text-stone-400">
              When the money comes in
            </h3>
            <div className="flex h-3 w-full overflow-hidden rounded-full">
              {Object.entries(sell.daypart_share).map(([k, v], i) => (
                <div
                  key={k}
                  title={`${k}: ${(v * 100).toFixed(0)}%`}
                  style={{ width: `${v * 100}%` }}
                  className={["bg-sky-500", "bg-emerald-500", "bg-orange-400", "bg-stone-300"][i]}
                />
              ))}
            </div>
            <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-stone-400">
              {Object.entries(sell.daypart_share).map(([k, v], i) => (
                <span key={k}>
                  <span className={["text-sky-500", "text-emerald-500", "text-orange-400", "text-stone-400"][i]}>●</span>{" "}
                  {k} {(v * 100).toFixed(0)}%
                </span>
              ))}
            </div>
          </section>
        </div>

        {/* trend + draft */}
        <div className="mt-6 grid gap-6 md:grid-cols-2">
          {copy.industry_trend.claim && (
            <section className="rounded-2xl border border-orange-200 bg-orange-50/60 p-6">
              <h2 className="mb-2 text-lg font-semibold text-orange-950">What the market’s doing</h2>
              <p className="text-sm leading-relaxed text-orange-950/80">{copy.industry_trend.claim}</p>
              <a
                href={copy.industry_trend.source_url}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-block text-xs font-medium text-orange-700 underline"
              >
                {copy.industry_trend.source_name} ↗
              </a>
            </section>
          )}
          {copy.supplier_email_draft && (
            <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
              <h2 className="mb-2 text-lg font-semibold">Drafted for your approval</h2>
              <pre className="max-h-56 overflow-y-auto whitespace-pre-wrap rounded-xl bg-stone-50 p-4 text-xs leading-relaxed text-stone-700">
                {copy.supplier_email_draft}
              </pre>
              <div className="mt-3 flex items-center gap-3">
                <button className="rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700">
                  Review &amp; send
                </button>
                <p className="text-xs text-stone-400">Siki drafts, you decide — always.</p>
              </div>
            </section>
          )}
        </div>

        {/* honest footer — stays visible (Zone B rule) */}
        <footer className="mt-10 border-t border-stone-200 pt-4 text-xs leading-relaxed text-stone-400">
          Sales patterns derived from a widely used real-world coffee-shop transaction dataset
          (Maven Analytics, 149k tills), reshaped into a Square Item Sales export with a
          matcha-café menu. Every figure on this page is computed by deterministic code; the
          Manus agent layer (task.create + structured output, link above to the live run)
          handles wording, live research and the email draft. Benchmarks are typical UK café
          ranges, indicative only. Built at the Manus café hackathon.
        </footer>
      </div>
    </main>
  );
}
