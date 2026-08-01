"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { SikiMascot } from "@/components/SikiMascot";
import { AnimatedNumber } from "@/components/AnimatedNumber";
import { Sparkline } from "@/components/dither-kit/sparkline";
import { endpoints } from "@/lib/api";

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
    rhythm: {
      days: string[]; hours: number[]; grid: number[][];
      peak: { day: string; hour: number };
    };
    modifiers: { oat_milk_share: number; extra_shot_share: number };
    mix: { categories: string[]; weekly_revenue: Record<string, number[]> };
  };
  spend: { by_supplier_gbp: { supplier: string; total_gbp: number }[]; period: string };
  nudges: { title: string; rationale: string; impact_gbp: number | null }[];
  copy: {
    headline: string; sell_summary: string;
    nudges: { title: string; rationale: string; impact_gbp: number | null }[];
    industry_trend: { claim: string; source_name: string; source_url: string };
    competitor_prices?: { item: string; price_gbp: number; place: string; source_url: string }[];
    supplier_email_draft: string;
  };
  benchmarks: { cogs: string; attach: number };
  manus: { status: string; reason?: string; task_id?: string; task_url?: string; share_url?: string };
  verification?: { claim: string; verified: boolean; note: string }[];
};

const MIX_COLORS: Record<string, string> = {
  Coffee: "bg-stone-700", Matcha: "bg-emerald-500", Bakery: "bg-orange-400",
  Tea: "bg-sky-400", Chocolate: "bg-amber-700", Retail: "bg-stone-300",
  "Add-ons": "bg-stone-200", };

const gbp = (n: number) => Math.round(n).toLocaleString("en-GB");

/** Live Siki chat: owner's questions answered against COMPUTED facts (injected
 *  context) by the production bookkeeper agent — no Manus dependency, and the
 *  agent can run its own tools (live research) for anything beyond the facts. */
function CafeChat({ briefing }: { briefing: Briefing }) {
  const [msgs, setMsgs] = useState<{ role: "user" | "siki"; text: string }[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [thread] = useState(() =>
    typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
  );

  const ctx = useMemo(
    () =>
      JSON.stringify({
        totals: briefing.sell.totals,
        window: briefing.sell.window,
        risers: briefing.sell.risers.map(({ item, pct_change, units_per_week }) => ({ item, pct_change, units_per_week })),
        fallers: briefing.sell.fallers.map(({ item, pct_change, units_per_week }) => ({ item, pct_change, units_per_week })),
        attach: briefing.sell.attach,
        daypart_share: briefing.sell.daypart_share,
        modifiers: briefing.sell.modifiers,
        top_items: briefing.sell.top_items_by_revenue.slice(0, 5),
        spend: briefing.spend.by_supplier_gbp,
        nudges: briefing.nudges,
        benchmark_cogs: briefing.benchmarks.cogs,
      }),
    [briefing],
  );

  const send = async (text: string) => {
    if (!text.trim() || busy) return;
    const message =
      `You are Siki, the finance assistant for a London matcha café. Answer the owner's question ` +
      `in 2-4 plain sentences, using ONLY these computed facts from its tills for any figures ` +
      `(never invent numbers; if the facts don't cover it, say so or use your tools for live research). ` +
      `Facts: ${ctx}\n\nOwner asks: ${text.trim()}`;
    setMsgs((m) => [...m, { role: "user", text: text.trim() }, { role: "siki", text: "" }]);
    setInput("");
    setBusy(true);
    try {
      for await (const ev of endpoints.xero.chatStream(message, thread, "siki")) {
        if (ev.type === "text") {
          const chunk = ev.text;
          setMsgs((m) => {
            const c = [...m];
            c[c.length - 1] = { role: "siki", text: c[c.length - 1].text + chunk };
            return c;
          });
        }
      }
    } catch {
      setMsgs((m) => {
        const c = [...m];
        c[c.length - 1] = { role: "siki", text: c[c.length - 1].text || "Hmm, I lost my train of thought — try again?" };
        return c;
      });
    }
    setBusy(false);
  };

  const chips = [
    "What should I order more of this week?",
    "Is my matcha latte priced right for this area?",
    "Where is my margin actually leaking?",
  ];

  return (
    <section className="mt-6 rounded-3xl border border-sky-200 bg-white p-6 shadow-sm md:p-7">
      <BeatLabel n="?" text="ask me anything about these numbers" />
      <div className="mt-3 space-y-3">
        {msgs.map((m, i) => (
          <div
            key={i}
            className={`max-w-[90%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
              m.role === "user"
                ? "ml-auto bg-stone-800 text-white rounded-tr-sm"
                : "bg-sky-600 text-white rounded-tl-sm"
            }`}
          >
            {m.text || (busy && i === msgs.length - 1 ? "…" : m.text)}
          </div>
        ))}
        {msgs.length === 0 && (
          <div className="flex flex-wrap gap-2">
            {chips.map((c) => (
              <button
                key={c}
                onClick={() => send(c)}
                className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-medium text-sky-800 hover:bg-sky-100"
              >
                {c}
              </button>
            ))}
          </div>
        )}
        <div className="flex gap-2 pt-1">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send(input)}
            disabled={busy}
            placeholder="Why is my milk spend up? What should I charge?"
            className="flex-1 rounded-xl border border-stone-200 bg-stone-50 px-4 py-2.5 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500"
          />
          <button
            onClick={() => send(input)}
            disabled={busy || !input.trim()}
            className="rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
          >
            Ask
          </button>
        </div>
        <p className="text-[11px] text-stone-400">
          Answered by Siki on this device’s data — figures come only from the computed facts above.
        </p>
      </div>
    </section>
  );
}

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

  // ----- interactive instrument state (client-side only) -----
  const [attachPct, setAttachPct] = useState(8);           // slider, %
  const [ownWeekly, setOwnWeekly] = useState<number | null>(null);   // owner override
  const [ownTreat, setOwnTreat] = useState<number | null>(null);     // £ treat price
  const [ownRate, setOwnRate] = useState<number | null>(null);       // their attach %

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

  // ----- attach-gap instrument (the report becomes an instrument) -----
  const weeklyMatcha = ownWeekly ?? sell.attach.matcha_transactions / sell.window.weeks;
  const treatPrice = ownTreat ?? 5.0;
  const baseRate = (ownRate ?? sell.attach.rate * 100);
  const upliftWeek = Math.max(0, attachPct - baseRate) / 100 * weeklyMatcha * treatPrice;
  const upliftYear = upliftWeek * 52;

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
            {data.verification && data.verification.length > 0 && (
              <p className="mt-2 flex items-center gap-1.5 text-xs text-emerald-700"
                 title={data.verification.map((v) => `${v.claim} — ${v.note}`).join("\n")}>
                <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 fill-emerald-600"><path d="M6.2 11.2 2.9 7.9l1.1-1.1 2.2 2.2 5-5L12.3 5z"/></svg>
                {data.verification.filter((v) => v.verified).length}/{data.verification.length} figures
                independently re-computed from the raw tills by the agent{" "}
                {agentLink && <a href={agentLink} target="_blank" rel="noreferrer" className="underline">(watch)</a>}
              </p>
            )}
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

        {/* -------------------- rhythm heatmap + supply signals -------------------- */}
        <section className="mt-6 rounded-3xl border border-stone-200 bg-white p-6 shadow-sm md:p-7">
          <BeatLabel n="·" text="the week has a shape" />
          <div className="mt-4 space-y-1">
            {sell.rhythm.grid.map((row, di) => {
              const max = Math.max(...sell.rhythm.grid.flat(), 1);
              return (
                <div key={di} className="flex items-center gap-1">
                  <span className="w-8 shrink-0 text-[10px] font-medium text-stone-400">
                    {sell.rhythm.days[di]}
                  </span>
                  {row.map((v, h) => (
                    <div
                      key={h}
                      title={`${sell.rhythm.days[di]} ${sell.rhythm.hours[h]}:00 — ${v} units`}
                      className="h-4 flex-1 rounded-[3px]"
                      style={{ backgroundColor: `rgba(16, 185, 129, ${0.04 + 0.96 * (v / max)})` }}
                    />
                  ))}
                </div>
              );
            })}
            <div className="flex gap-1 pl-9 text-[9px] text-stone-300">
              {sell.rhythm.hours.map((h) => (
                <span key={h} className="flex-1">{h % 3 === 0 ? h : ""}</span>
              ))}
            </div>
          </div>
          <p className="mt-2 text-xs text-stone-500">
            Peak: {sell.rhythm.peak.day} {sell.rhythm.peak.hour}:00 · units by day × hour
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800">
              oat milk on {(sell.modifiers.oat_milk_share * 100).toFixed(0)}% of lattes → order accordingly
            </span>
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-800">
              {(sell.modifiers.extra_shot_share * 100).toFixed(0)}% of matcha add an extra shot
            </span>
          </div>
        </section>

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

        {/* -------------------- make it yours: the instrument -------------------- */}
        <section className="mt-6 rounded-3xl border border-orange-200 bg-orange-50/50 p-6 shadow-sm md:p-7">
          <BeatLabel n="→" text="your turn — drive the number" />
          <div className="mt-4">
            <div className="flex items-baseline justify-between">
              <label htmlFor="attach" className="text-sm font-medium text-stone-800">
                If {attachPct}% of matcha drinks left with a cake…
              </label>
              <span className="text-sm font-semibold tabular-nums text-orange-800">{attachPct}%</span>
            </div>
            <input
              id="attach"
              type="range"
              min={2}
              max={40}
              value={attachPct}
              onChange={(e) => setAttachPct(Number(e.target.value))}
              className="mt-2 w-full accent-orange-500"
            />
            <div className="mt-2 flex items-baseline gap-2">
              <AnimatedNumber
                value={Math.round(upliftWeek)}
                prefix="+£"
                className="text-4xl font-semibold tabular-nums text-orange-800"
              />
              <span className="text-sm text-stone-500">a week</span>
              <span className="ml-auto text-sm font-medium tabular-nums text-stone-500">
                ≈ £{gbp(upliftYear)} a year
              </span>
            </div>
            <p className="mt-1 text-xs text-stone-400">
              vs the {baseRate.toFixed(0)}% this shop attaches today · ~{Math.round(weeklyMatcha)} matcha
              drinks/week · £{treatPrice.toFixed(2)} a treat
            </p>
          </div>

          <details className="mt-4 rounded-2xl border border-dashed border-orange-300 bg-white/70 px-4 py-3">
            <summary className="cursor-pointer text-sm font-medium text-stone-700">
              Got your own rough numbers? Drop them in
            </summary>
            <div className="mt-3 grid grid-cols-3 gap-3">
              <label className="block">
                <span className="text-[11px] text-stone-500">matcha drinks / week</span>
                <input
                  type="number"
                  min={0}
                  defaultValue={Math.round(weeklyMatcha)}
                  onChange={(e) => setOwnWeekly(e.target.value ? Number(e.target.value) : null)}
                  className="mt-1 w-full rounded-lg border border-stone-200 px-2 py-1.5 text-sm tabular-nums"
                />
              </label>
              <label className="block">
                <span className="text-[11px] text-stone-500">price of a cake, £</span>
                <input
                  type="number"
                  min={0}
                  step={0.1}
                  defaultValue={treatPrice}
                  onChange={(e) => setOwnTreat(e.target.value ? Number(e.target.value) : null)}
                  className="mt-1 w-full rounded-lg border border-stone-200 px-2 py-1.5 text-sm tabular-nums"
                />
              </label>
              <label className="block">
                <span className="text-[11px] text-stone-500">you think you attach, %</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  defaultValue={Math.round(baseRate)}
                  onChange={(e) => setOwnRate(e.target.value ? Number(e.target.value) : null)}
                  className="mt-1 w-full rounded-lg border border-stone-200 px-2 py-1.5 text-sm tabular-nums"
                />
              </label>
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-stone-400">
              Nothing you type leaves this page — the maths runs on your device.
            </p>
          </details>
        </section>

        {/* -------------------- benchmark: what others charge -------------------- */}
        {copy.competitor_prices && copy.competitor_prices.length > 0 && (
          <section className="mt-6 rounded-3xl border border-stone-200 bg-white p-6 shadow-sm md:p-7">
            <BeatLabel n="£" text="what others charge nearby" />
            <ul className="mt-3 divide-y divide-stone-100">
              {copy.competitor_prices.map((p, i) => (
                <li key={i} className="flex items-baseline gap-2 py-2.5 text-sm">
                  <span className="text-stone-800">{p.item}</span>
                  <span className="ml-auto shrink-0 font-semibold tabular-nums text-stone-900">
                    £{p.price_gbp.toFixed(2)}
                  </span>
                  <a href={p.source_url} target="_blank" rel="noreferrer"
                     className="shrink-0 text-xs text-sky-700 underline">
                    {p.place} ↗
                  </a>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[11px] text-stone-400">
              Found live by the agent on real menus · indicative, check before pricing decisions
            </p>
          </section>
        )}

        {/* -------------------- ask Siki: the agentic layer -------------------- */}
        <CafeChat briefing={data} />

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
              <h4 className="pt-2 text-xs font-semibold uppercase tracking-widest text-stone-400">
                Where revenue comes from, week by week
              </h4>
              <div className="flex items-end gap-[3px] pt-1" aria-hidden>
                {sell.mix.weekly_revenue[sell.mix.categories[0]]?.map((_, wi) => {
                  const total = sell.mix.categories
                    .map((c) => sell.mix.weekly_revenue[c]?.[wi] ?? 0)
                    .reduce((a, b) => a + b, 0) || 1;
                  return (
                    <div key={wi} className="flex h-16 flex-1 flex-col justify-end" title={`Week ${wi + 1} · £${gbp(total)}`}>
                      {sell.mix.categories.map((c) => {
                        const v = sell.mix.weekly_revenue[c]?.[wi] ?? 0;
                        return (
                          <div
                            key={c}
                            className={MIX_COLORS[c] ?? "bg-stone-200"}
                            style={{ height: `${(v / total) * 100}%` }}
                          />
                        );
                      })}
                    </div>
                  );
                })}
              </div>
              <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-stone-400">
                {sell.mix.categories.map((c) => (
                  <span key={c}>
                    <span className={`inline-block h-2 w-2 rounded-sm ${MIX_COLORS[c] ?? "bg-stone-200"}`} /> {c}
                  </span>
                ))}
              </div>
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
