"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { SikiMascot } from "@/components/SikiMascot";
import { AnimatedNumber } from "@/components/AnimatedNumber";
import { Sparkline } from "@/components/dither-kit/sparkline";
import { endpoints } from "@/lib/api";

/**
 * /cafe — Siki's Monday Briefing (hackathon spike: Matcha Mochi, City Road).
 *
 * Hierarchy: promise → three moves for Monday → one primary CTA → review the
 * order → evidence. A café owner wants "what should I order, promote, or stop
 * selling — and how much is it worth?" first; charts, sources and methodology
 * sit lower, and demo provenance lives in a collapsed section at the end.
 *
 * Production serves a frozen snapshot (no standing agent dependency); the
 * Manus run that wrote the copy is linked in "How this demo was made".
 */

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8080";

type Move = {
  item: string; pct_change: number; units_per_week: number;
  abs_delta?: number;  // mean(last 4 wks) − mean(prior 4 wks), in units
  weekly: number[];
};
type Briefing = {
  cafe: { name: string; pos: string; uploaded?: boolean };
  sell: {
    window: { start: string; end: string; weeks: number };
    totals: {
      transactions: number; transactions_per_day: number;
      avg_basket_gbp: number; revenue_gbp: number;
    };
    risers: Move[];
    fallers: Move[];
    attach: { rate: number; weekly_opportunity_gbp: number; matcha_transactions: number; with_treat?: number };
    daypart_share: Record<string, number>;
    top_items_by_revenue: { item: string; revenue_gbp: number }[];
    rhythm: {
      days: string[]; hours: number[]; grid: number[][];
      peak: { day: string; hour: number };
    };
    modifiers: { oat_milk_share: number; extra_shot_share: number };
    mix: { categories: string[]; weekly_revenue: Record<string, number[]> };
  };
  spend: {
    by_supplier_gbp: { supplier: string; total_gbp: number; email?: string }[];
    period: string;
  };
  nudges: { title: string; rationale: string; impact_gbp: number | null }[];
  copy: {
    headline: string; sell_summary: string;
    nudges: { title: string; rationale: string; impact_gbp: number | null }[];
    industry_trend: { claim: string; source_name: string; source_url: string };
    competitor_prices?: { item: string; price_gbp: number; place: string; source_url: string }[];
    supplier_email_draft: string;
  };
  benchmarks: {
    cogs: string; attach: number;
    cogs_source?: { name: string; url: string };
    sources?: Record<string, { value: string; source: string }>;
  };
  manus: { status: string; reason?: string; task_id?: string; task_url?: string; share_url?: string };
  verification?: { claim: string; verified: boolean; note: string }[];
};

type LocalityPack = {
  postcode: string;
  area: string;
  cafe: { name: string; blurb: string } | null;
  visitor_cafe_name?: string;
  competitors: { name: string; note: string; url?: string }[];
  source: "locals" | "live_search";
  source_note: string;
  at: string;
};

const LOCALITY_KEY = "sikizana.cafeLocality";

const gbp = (n: number) => Math.round(n).toLocaleString("en-GB");

/** Naive suggested order: recent weekly sales (mean of last 4 weeks) adjusted
 *  by the observed monthly trend, rounded to nearest 5, floored at 0.
 *  Deliberately simple — no stock, recipes, or pack sizes are known. */
const suggestUnits = (m: Move) =>
  Math.max(0, Math.round((m.units_per_week + (m.abs_delta ?? 0)) / 5) * 5);

/** Shared CSV upload: staged parse receipt, then swap the briefing in. */
function useCsvUpload(onUploaded: (b: Briefing) => void) {
  const [parsing, setParsing] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const staged = (lines: string[]) => {
    setParsing([]);
    lines.forEach((l, i) => setTimeout(() => setParsing((p) => [...(p ?? []), l]), 320 * (i + 1)));
  };

  const upload = async (file: File) => {
    setBusy(true); setError(null);
    staged([`reading ${file.name}…`, `mapping columns…`, `counting tills…`, `computing weekly deltas…`]);
    try {
      const fd = new FormData();
      fd.append("file", file, file.name);
      const res = await fetch(`${API_BASE}/api/cafe/analyse`, { method: "POST", body: fd });
      const b = await res.json().catch(() => ({}));
      if (!res.ok || b.error) throw new Error(b.error || `HTTP ${res.status}`);
      const bb = b as Briefing;
      staged([
        `found ${bb.sell.totals.transactions.toLocaleString()} transactions`,
        `window ${bb.sell.window.start} → ${bb.sell.window.end}`,
        `columns mapped ✓ ${bb.sell.totals.transactions.toLocaleString()} tills`,
        `computing weekly deltas ✓`,
      ]);
      setTimeout(() => { setParsing(null); onUploaded(bb); }, 1400);
    } catch (e) {
      setParsing(null);
      setError(e instanceof Error ? e.message : "couldn’t parse that export");
    }
    setBusy(false);
  };

  return { parsing, busy, error, upload };
}

function ParsingReceipt({ parsing }: { parsing: string[] | null }) {
  if (!parsing) return null;
  return (
    <div className="mt-3 rounded-2xl bg-stone-50 p-4">
      {parsing.map((l, i) => (
        <p key={i} className="text-xs text-stone-600">✓ {l}</p>
      ))}
    </div>
  );
}

/** Personalisation: café name + postcode -> locality pack (seeded real packs
 *  first, live Exa search elsewhere). Persisted locally; feeds Siki's context. */
function LocalityCard({ pack, onPack }: { pack: LocalityPack | null; onPack: (p: LocalityPack | null) => void }) {
  const [cafe, setCafe] = useState("");
  const [postcode, setPostcode] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(!pack);

  const submit = async () => {
    if (!postcode.trim() || busy) return;
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE}/api/cafe/locality`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postcode: postcode.trim(), cafe_name: cafe.trim() || null }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const p = (await res.json()) as LocalityPack;
      if (p.visitor_cafe_name === undefined && cafe.trim()) p.visitor_cafe_name = cafe.trim();
      onPack(p);
      try { localStorage.setItem(LOCALITY_KEY, JSON.stringify(p)); } catch {}
      setOpen(false);
    } catch { /* keep demo state on any failure */ }
    setBusy(false);
  };

  return (
    <section className="mt-4 rounded-2xl border border-dashed border-stone-300 bg-white/70 px-5 py-4">
      {pack && !open ? (
        <div className="flex items-center justify-between text-xs">
          <p className="font-medium text-emerald-800">
            Localised for {pack.visitor_cafe_name || pack.cafe?.name || pack.area}{" "}
            <span className="text-stone-400">· {pack.postcode}</span>
          </p>
          <button onClick={() => setOpen(true)} className="text-stone-400 underline">change</button>
        </div>
      ) : (
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-stone-500">
            Your café? We’ll localise this page
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <input
              value={cafe}
              onChange={(e) => setCafe(e.target.value)}
              placeholder="Café name (optional)"
              className="min-w-40 flex-1 rounded-lg border border-stone-200 bg-stone-50 px-3 py-1.5 text-sm outline-none focus:border-sky-500"
            />
            <input
              value={postcode}
              onChange={(e) => setPostcode(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder="Postcode, e.g. EC1V 1NR"
              className="w-40 rounded-lg border border-stone-200 bg-stone-50 px-3 py-1.5 text-sm outline-none focus:border-sky-500"
            />
            <button
              onClick={submit}
              disabled={busy || !postcode.trim()}
              className="rounded-lg bg-stone-800 px-3.5 py-1.5 text-sm font-semibold text-white hover:bg-stone-700 disabled:opacity-50"
            >
              {busy ? "…" : "Localise"}
            </button>
          </div>
          <p className="mt-1.5 text-[11px] leading-relaxed text-stone-400">
            Only used to fetch your neighbourhood; stored in this browser, nothing else changes hands.
          </p>
        </div>
      )}
    </section>
  );
}

/** Data provenance: demo twin, Xero demo books, or the visitor's own export.
 *  Lives late on the page — it explains how the demo was sourced, not why
 *  the product matters. */
function SourceChooser({
  data, onUploaded,
}: {
  data: Briefing;
  onUploaded: (b: Briefing) => void;
}) {
  const { parsing, busy, error, upload } = useCsvUpload(onUploaded);
  const [note, setNote] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const card = "flex-1 min-w-44 rounded-2xl border border-stone-200 bg-white p-4 text-left transition-colors hover:border-sky-300";
  return (
    <div>
      <div className="mt-3 flex flex-wrap gap-3">
        <button
          className={card}
          onClick={() =>
            setNote(
              "149,116 real-world till rows (Maven Analytics’ coffee-shop dataset, 3 NYC cafés, Jan–Jun 2023), reshaped into this twin window. Read by our parser, ticked off by the agent.",
            )
          }
        >
          <p className="text-sm font-semibold text-stone-900">① The demo twin</p>
          <p className="mt-1 text-xs leading-relaxed text-stone-500">149k tills from a NYC coffee trio, replayed as a City Road café.</p>
        </button>
        <button
          className={card}
          onClick={() =>
            setNote(
              `${data.spend.by_supplier_gbp.length} supplier bills, rent and energy from the Xero demo org — the books side of the same café (period ${data.spend.period}).`,
            )
          }
        >
          <p className="text-sm font-semibold text-stone-900">② The Xero demo books</p>
          <p className="mt-1 text-xs leading-relaxed text-stone-500">bills, rent and energy — the accountant’s side of the story.</p>
        </button>
        <label className={`${card} cursor-pointer ${busy ? "opacity-50 pointer-events-none" : ""}`}>
          <p className="text-sm font-semibold text-stone-900">③ Your own export</p>
          <p className="mt-1 text-xs leading-relaxed text-stone-500">
            Square Dashboard → Item Sales → CSV. Parsed here, kept nowhere.
          </p>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) upload(f);
              e.target.value = "";
            }}
          />
          <p className="mt-2 inline-block rounded-lg bg-stone-900 px-3 py-1.5 text-xs font-semibold text-white">
            {busy ? "parsing…" : "drop a CSV →"}
          </p>
        </label>
      </div>
      {error && <p className="mt-2 text-xs text-rose-600">{error}</p>}
      <ParsingReceipt parsing={parsing} />
      {note && (
        <p className="mt-2 rounded-xl bg-stone-100 px-4 py-2.5 text-xs leading-relaxed text-stone-500">
          {note}
        </p>
      )}
    </div>
  );
}

const MIX_COLORS: Record<string, string> = {
  Coffee: "bg-stone-700", Matcha: "bg-emerald-500", Bakery: "bg-orange-400",
  Tea: "bg-sky-400", Chocolate: "bg-amber-700", Retail: "bg-stone-300",
  "Add-ons": "bg-stone-200", };

/** Live Siki chat: owner's questions answered against COMPUTED facts (injected
 *  context) by the production bookkeeper agent — no Manus dependency, and the
 *  agent can run its own tools (live research) for anything beyond the facts. */
function CafeChat({ briefing, pack }: { briefing: Briefing; pack: LocalityPack | null }) {
  const [msgs, setMsgs] = useState<{ role: "user" | "siki"; text: string }[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [thread] = useState(() =>
    typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
  );

  const ctx = useMemo(
    () =>
      JSON.stringify({
        locality: pack ? { area: pack.area, cafe: pack.visitor_cafe_name || pack.cafe?.name, nearby_competitors: pack.competitors.map((c) => c.name), benchmark_note: pack.source_note } : undefined,
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
    [briefing, pack],
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
    pack
      ? `How do I compare against ${pack.competitors[0]?.name ?? "nearby cafés"}?`
      : "Is my matcha latte priced right for this area?",
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
  const [pack, setPack] = useState<LocalityPack | null>(null);
  const tries = useRef(0);

  // ---------- deck (present) mode ----------
  const [deck, setDeck] = useState(false);
  const [step, setStep] = useState(0);
  const [labels, setLabels] = useState<string[]>([]);
  const contentRef = useRef<HTMLDivElement>(null);
  const stepEls = () =>
    Array.from(contentRef.current?.children ?? []) as HTMLElement[];
  const stepLabel = (el: HTMLElement, i: number) =>
    (el.querySelector(".uppercase, h1, h2")?.textContent ||
      el.firstElementChild?.textContent || `Step ${i + 1}`).slice(0, 34);

  useEffect(() => {
    if (!deck) return;
    stepEls().forEach((el, i) => {
      el.style.display = i === step ? "" : "none";
      el.style.height = "100dvh";
      el.style.overflowY = "auto";
    });
    setLabels(stepEls().map(stepLabel));
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
      stepEls().forEach((el) => {
        el.style.display = "";
        el.style.height = "";
        el.style.overflowY = "";
      });
    };
     
  }, [deck, step, data, pack]);

  useEffect(() => {
    if (!deck) return;
    const nav = (d: number) =>
      setStep((s) => Math.max(0, Math.min(stepEls().length - 1, s + d)));
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input,textarea,select,[contenteditable]")) return;
      if (["ArrowDown", "PageDown", " "].includes(e.key)) { e.preventDefault(); nav(1); }
      if (["ArrowUp", "PageUp"].includes(e.key)) { e.preventDefault(); nav(-1); }
      if (e.key === "Escape") setDeck(false);
    };
    let cool = 0;
    const onWheel = (e: WheelEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input,textarea,select,video,[data-scrollable],details[open]")) return;
      const now = Date.now();
      if (now - cool < 900 || Math.abs(e.deltaY) < 24) return;
      cool = now;
      nav(e.deltaY > 0 ? 1 : -1);
    };
    let ty = 0;
    const ts = (e: TouchEvent) => { ty = e.touches[0].clientY; };
    const te = (e: TouchEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input,textarea,select,video,[data-scrollable],details[open]")) return;
      const d = ty - e.changedTouches[0].clientY;
      if (Math.abs(d) > 48) nav(d > 0 ? 1 : -1);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("wheel", onWheel, { passive: true });
    window.addEventListener("touchstart", ts, { passive: true });
    window.addEventListener("touchend", te, { passive: true });
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("touchstart", ts);
      window.removeEventListener("touchend", te);
    };
     
  }, [deck, data, pack]);

  // ----- interactive instrument state (client-side only) -----
  // Conservative editable starting target: 12% floor, or just above the café's
  // own attach rate so the scenario is always a genuine uplift.
  const [attachPct, setAttachPct] = useState(12);
  const attachTouched = useRef(false);
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
    try {
      const saved = localStorage.getItem(LOCALITY_KEY);
      if (saved) setPack(JSON.parse(saved));
    } catch { /* first visit */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Seat the slider just above the café's own attach rate (12% floor),
  // unless the user already picked a target themselves.
  useEffect(() => {
    if (!data || attachTouched.current) return;
    const rate = (data.sell.attach.rate ?? 0) * 100;
    setAttachPct(Math.max(12, Math.min(40, Math.ceil(rate) + 2)));
  }, [data]);

  // hero upload affordance (secondary path into the same parse pipeline)
  const heroUpload = useCsvUpload((b) => setData(b));

  if (error) {
    return <main className="mx-auto max-w-3xl p-10 text-sm text-stone-500">Couldn’t load the briefing ({error}).</main>;
  }
  if (!data) {
    return <main className="mx-auto max-w-3xl p-10 text-sm text-stone-400">Siki is reading this week’s tills…</main>;
  }

  const { sell, spend, copy, nudges } = data;
  const riser = sell.risers[0];
  const faller = sell.fallers[0];
  const agentLink = data.manus.share_url || data.manus.task_url;
  const uploaded = Boolean(data.cafe.uploaded);

  // ----- the three moves, built from structured facts -----
  const nudgePool = [...(copy.nudges ?? []), ...nudges];
  const pickNudge = (...keys: string[]) =>
    nudgePool.find((n) => keys.every((k) => `${n.title} ${n.rationale}`.toLowerCase().includes(k)));

  const attachOpp = sell.attach.weekly_opportunity_gbp;
  const hasMatcha = sell.attach.matcha_transactions > 0;
  const weeklyMatchaBase = hasMatcha ? sell.attach.matcha_transactions / sell.window.weeks : 0;
  const currentPct = sell.attach.rate * 100;
  const benchmarkPct = Math.round(data.benchmarks.attach * 100);
  const gapPts = data.benchmarks.attach * 100 - currentPct;
  const BACKEND_TREAT_GBP = 5.0; // weekly_opportunity_gbp is computed server-side at ~£5/treat

  type MoveCard = { title: string; stat: string; why?: string; impact: number | null };
  const moves: MoveCard[] = [
    ...(riser
      ? [{
          title: `Stock up for ${riser.item}`,
          stat: `Demand rose ${riser.pct_change}% — it now averages ~${riser.units_per_week}/week over the last month`,
          why: pickNudge("stock")?.rationale,
          impact: null,
        }]
      : []),
    ...(hasMatcha
      ? [{
          title: "Pair a pastry with matcha",
          stat: attachOpp > 0
            ? `Only ${currentPct.toFixed(1)}% of matcha orders include one${sell.attach.with_treat != null ? ` (${sell.attach.with_treat.toLocaleString()} of ${sell.attach.matcha_transactions.toLocaleString()})` : ""}`
            : `${currentPct.toFixed(1)}% of matcha orders already include one — at or above the indicative ${benchmarkPct}% benchmark`,
          why: pickNudge("treat")?.rationale ?? pickNudge("bundle")?.rationale,
          impact: attachOpp > 0 ? attachOpp : null,
        }]
      : []),
    ...(faller
      ? [{
          title: `Reduce ${faller.item}`,
          stat: `Weekly sales fell ${Math.abs(faller.pct_change)}% — now ~${faller.units_per_week}/week, a waste risk on perishables`,
          why: pickNudge("loaf")?.rationale ?? pickNudge("banana")?.rationale,
          impact: null,
        }]
      : []),
  ].slice(0, 3);

  // ----- real actions, not dead ends -----
  const supplierEmail = spend.by_supplier_gbp.find((s) => s.email)?.email ?? "";
  const mailtoHref = () => {
    const subject = encodeURIComponent(`This week's order — draft for review`);
    const body = encodeURIComponent(
      (copy.supplier_email_draft ||
        `Hi,\n\nBased on this week's sales, we'd like to adjust our order:\n- ${moves.map((n) => n.title).join("\n- ")}\n\nThanks,`).slice(0, 1800),
    );
    return `mailto:${supplierEmail}?subject=${subject}&body=${body}`;
  };
  const orderMoves = [...sell.risers.slice(0, 3), ...sell.fallers.slice(0, 2)];

  const downloadOrderCsv = () => {
    const rows: string[][] = [["Item", "Recent weekly sales", "Suggested units this week", "Change vs last month", "Note"]];
    sell.risers.slice(0, 3).forEach((r) =>
      rows.push([r.item, String(r.units_per_week), String(suggestUnits(r)), `+${r.pct_change}%`, "rising — check stock covers this"]),
    );
    sell.fallers.slice(0, 2).forEach((f) =>
      rows.push([f.item, String(f.units_per_week), String(suggestUnits(f)), `${f.pct_change}%`, "falling — consider trimming the order"]),
    );
    rows.push(["Oat milk", "—", "—", `${(sell.modifiers.oat_milk_share * 100).toFixed(0)}% of lattes`, "supply accordingly"]);
    const csv = rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `order-${sell.window.end}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  // ----- attach-gap instrument (the report becomes an instrument) -----
  const weeklyMatcha = ownWeekly ?? weeklyMatchaBase;
  const treatPrice = ownTreat ?? 5.0;
  const baseRate = (ownRate ?? currentPct);
  const upliftWeek = Math.max(0, attachPct - baseRate) / 100 * weeklyMatcha * treatPrice;
  const upliftYear = upliftWeek * 52;

  return (
    <main className="min-h-screen bg-stone-50 text-stone-900">
      <div
        ref={contentRef}
        className={deck ? "fixed inset-0 z-50 overflow-hidden bg-stone-50" : "mx-auto max-w-3xl px-6 pb-16 pt-10"}
      >

        {/* -------------------- 1 · promise -------------------- */}
        <header className="flex items-start gap-5">
          <SikiMascot size={84} mood={data.manus.status === "done" ? "celebrate" : "look"} className="mt-1 shrink-0" />
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-sky-700">
              Siki’s Monday Briefing · {pack?.cafe?.name || pack?.visitor_cafe_name || data.cafe.name}
            </p>
            <h1 className="mt-1.5 text-2xl font-semibold leading-snug md:text-3xl">
              Know what to order, promote, and cut this week
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-stone-500">
              {copy.headline} I read {sell.window.weeks} weeks of tills
              ({sell.window.start} → {sell.window.end}) and turned them into three moves.
            </p>
          </div>
        </header>

        {/* -------------------- 2 · your three moves -------------------- */}
        <section className="mt-8 scroll-mt-8 rounded-3xl border border-sky-200 bg-sky-50/50 p-6 shadow-sm md:p-7" id="three-moves">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 className="text-lg font-semibold text-sky-950">Your {moves.length === 3 ? "three" : moves.length > 1 ? moves.length : ""} move{moves.length === 1 ? "" : "s"} for Monday</h2>
            {attachOpp > 0 && (
              <p className="text-sm font-medium text-sky-800">
                Potential impact:{" "}
                up to <span className="font-semibold tabular-nums">£{gbp(attachOpp)}/week</span>{" "}
                in additional revenue*
              </p>
            )}
          </div>
          <div className="mt-4 space-y-3">
            {moves.map((m, i) => (
              <div key={i} className="rounded-2xl border border-sky-100 bg-white p-4">
                <div className="flex items-baseline gap-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sky-600 text-[11px] font-bold text-white">
                    {i + 1}
                  </span>
                  <p className="font-semibold text-sky-950">{m.title}</p>
                  {m.impact != null && m.impact > 0 && (
                    <span className="ml-auto shrink-0 text-sm font-semibold tabular-nums text-sky-700">
                      £{gbp(m.impact)}/wk
                    </span>
                  )}
                </div>
                <p className="mt-1 pl-7 text-sm leading-relaxed text-stone-600">{m.stat}</p>
                {m.why && (
                  <details className="ml-7 mt-1">
                    <summary className="cursor-pointer text-xs font-medium text-sky-700 underline decoration-sky-300">
                      Why?
                    </summary>
                    <p className="mt-1.5 text-xs leading-relaxed text-stone-500">{m.why}</p>
                  </details>
                )}
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <a
              href="#weekly-order"
              className="rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700"
            >
              Review this week’s order ↓
            </a>
            <a
              href="#evidence"
              className="rounded-xl border border-sky-300 bg-white px-4 py-2 text-sm font-semibold text-sky-800 hover:bg-sky-50"
            >
              See how Siki calculated this
            </a>
          </div>
          <p className="mt-3 text-xs text-stone-500">
            {attachOpp > 0 &&
              "*Estimated revenue, before costs — the target attach rate is an indicative benchmark, not a guarantee. "}
            Recommendations only: you approve every download, message, or change.
          </p>
          <div className="mt-2 text-xs text-stone-400">
            {uploaded ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 font-semibold text-emerald-800">
                ✦ Your export — the till analysis now runs on your data. Spend and benchmarks stay from the demo books.
              </span>
            ) : (
              <>
                This is the demo briefing —{" "}
                <label className={`cursor-pointer font-medium text-sky-700 underline ${heroUpload.busy ? "opacity-50 pointer-events-none" : ""}`}>
                  or upload my Square Item Sales CSV
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) heroUpload.upload(f);
                      e.target.value = "";
                    }}
                  />
                </label>
              </>
            )}
          </div>
          {heroUpload.error && <p className="mt-2 text-xs text-rose-600">{heroUpload.error}</p>}
          <ParsingReceipt parsing={heroUpload.parsing} />
        </section>

        {/* -------------------- 3 · review this week's order -------------------- */}
        <section className="mt-6 scroll-mt-8 rounded-3xl border border-orange-200 bg-orange-50/40 p-6 shadow-sm md:p-7" id="weekly-order">
          <BeatLabel n="→" text="this week’s ordering guide — review, then act" />
          <p className="mt-3 text-sm leading-relaxed text-stone-600">
            Suggested units are deliberately naive: recent weekly sales adjusted by the observed
            monthly trend, rounded to the nearest 5. Siki can’t see your stock, recipes, or pack
            sizes — treat them as a starting point and set the final order yourself. Siki also
            drafts the supplier message. Nothing is sent or changed — in Xero or anywhere
            else — until you review and approve it.
          </p>
          {orderMoves.length > 0 && (
            <table className="mt-4 w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-stone-400">
                  <th className="pb-2 font-medium">Item</th>
                  <th className="pb-2 text-right font-medium">Recent/wk</th>
                  <th className="pb-2 text-right font-medium">Suggested</th>
                  <th className="hidden pb-2 text-right font-medium sm:table-cell">Month</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {orderMoves.map((m) => {
                  const rising = m.pct_change > 0;
                  const suggested = suggestUnits(m);
                  return (
                    <tr key={m.item}>
                      <td className="py-2 pr-2 text-stone-800">{m.item}</td>
                      <td className="py-2 text-right tabular-nums text-stone-500">{m.units_per_week}</td>
                      <td className={`py-2 text-right font-semibold tabular-nums ${rising ? "text-emerald-700" : "text-rose-600"}`}>
                        {suggested}
                        {suggested !== m.units_per_week && (
                          <span className="ml-1 text-[10px] font-normal">
                            ({suggested > m.units_per_week ? "+" : "−"}{Math.abs(suggested - m.units_per_week)})
                          </span>
                        )}
                      </td>
                      <td className={`hidden py-2 text-right tabular-nums sm:table-cell ${rising ? "text-emerald-700" : "text-rose-600"}`}>
                        {rising ? "+" : ""}{m.pct_change}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <a
              href={mailtoHref()}
              className="rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700"
            >
              ✉ Email {supplierEmail ? "your supplier" : "the drafted order"}
            </a>
            <button
              onClick={downloadOrderCsv}
              className="rounded-xl border border-sky-300 bg-white px-4 py-2 text-sm font-semibold text-sky-800 hover:bg-sky-50"
            >
              ⬇ Download this week’s order (.csv)
            </button>
          </div>
          <p className="mt-2 text-[11px] text-stone-400">
            The CSV lists each rising and falling item with recent weekly sales, the naive suggested
            units (sales + observed trend), monthly change, and why.
          </p>
          {copy.supplier_email_draft && (
            <details className="mt-3 rounded-2xl border border-dashed border-stone-300 bg-white/70 px-4 py-3">
              <summary className="cursor-pointer text-sm font-medium text-stone-700">
                The drafted email — review before anything sends
              </summary>
              <pre className="mt-3 max-h-52 overflow-y-auto whitespace-pre-wrap rounded-xl bg-stone-50 p-4 text-xs leading-relaxed text-stone-700">
                {copy.supplier_email_draft}
              </pre>
              <p className="mt-2 text-xs text-stone-400">Siki drafts, you press send — always.</p>
            </details>
          )}

          {/* the instrument — only meaningful where matcha transactions exist */}
          {hasMatcha ? (
          <>
          <div className="mt-5 rounded-2xl border border-orange-200 bg-white p-5">
            <div className="flex items-baseline justify-between">
              <label htmlFor="attach" className="text-sm font-medium text-stone-800">
                If {attachPct}% of matcha drinks left with a pastry…
              </label>
              <span className="text-sm font-semibold tabular-nums text-orange-800">{attachPct}%</span>
            </div>
            <input
              id="attach"
              type="range"
              min={2}
              max={40}
              value={attachPct}
              onChange={(e) => { attachTouched.current = true; setAttachPct(Number(e.target.value)); }}
              className="mt-2 w-full accent-orange-500"
            />
            <div className="mt-2 flex items-baseline gap-2">
              <AnimatedNumber
                value={Math.round(upliftWeek)}
                prefix="+£"
                className="text-4xl font-semibold tabular-nums text-orange-800"
              />
              <span className="text-sm text-stone-500">a week, estimated revenue</span>
              <span className="ml-auto text-sm font-medium tabular-nums text-stone-500">
                ≈ £{gbp(upliftYear)} a year
              </span>
            </div>
            <p className="mt-1 text-xs text-stone-400">
              {Math.round(weeklyMatcha)} weekly matcha orders × {Math.max(0, attachPct - baseRate).toFixed(1)}-point
              gain × £{treatPrice.toFixed(2)} average pastry · today’s attach rate: {baseRate.toFixed(0)}% ·
              {attachPct}% is a starting scenario — drag to explore
            </p>
          </div>

          <details className="mt-3 rounded-2xl border border-dashed border-orange-300 bg-white/70 px-4 py-3">
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
                <span className="text-[11px] text-stone-500">price of a pastry, £</span>
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
          </>
          ) : (
            <p className="mt-5 rounded-2xl bg-stone-100 px-4 py-3 text-xs leading-relaxed text-stone-500">
              No matcha-drink attach pattern was detected in this export, so there’s no
              attach-rate scenario to size.
            </p>
          )}
        </section>

        {/* -------------------- 4 · the evidence -------------------- */}
        <section className="mt-6 scroll-mt-8 rounded-3xl border border-stone-200 bg-white p-6 shadow-sm md:p-7" id="evidence">
          {attachOpp > 0 ? (
            <>
              <BeatLabel n="£" text="the evidence behind the pastry pairing" />
              <div className="mt-3 flex items-baseline gap-2">
                <AnimatedNumber
                  value={attachOpp}
                  prefix="£"
                  suffix="/week"
                  className="text-5xl font-semibold tabular-nums text-sky-800"
                />
              </div>
              <p className="mt-1 text-[11px] text-stone-400">estimated additional revenue, before ingredient costs</p>
              <p className="mt-2 text-sm leading-relaxed text-stone-600">
                <b>{currentPct.toFixed(1)}%</b> of matcha drinks leave with a pastry. Scenario: lifting that
                to {benchmarkPct}% — an indicative café benchmark, not a guarantee — is worth the figure above.
              </p>
              <p className="mt-2 rounded-xl bg-stone-50 px-3 py-2 text-xs leading-relaxed text-stone-500">
                ~{Math.round(weeklyMatchaBase)} weekly matcha orders × {gapPts.toFixed(1)} percentage-point gap
                × £{BACKEND_TREAT_GBP.toFixed(2)} average pastry ≈ £{gbp(attachOpp)}/week
              </p>
              {/* two-bar comparison */}
              <div className="mt-4 space-y-2">
                <div>
                  <div className="flex justify-between text-[11px] text-stone-500">
                    <span>This café</span><span>{currentPct.toFixed(1)}%</span>
                  </div>
                  <div className="mt-1 h-2.5 w-full rounded-full bg-stone-100">
                    <div className="h-2.5 rounded-full bg-orange-400" style={{ width: `${currentPct}%` }} />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-[11px] text-stone-500">
                    <span>Indicative benchmark</span><span>{benchmarkPct}%</span>
                  </div>
                  <div className="mt-1 h-2.5 w-full rounded-full bg-stone-100">
                    <div className="h-2.5 rounded-full bg-stone-400" style={{ width: `${data.benchmarks.attach * 100}%` }} />
                  </div>
                </div>
              </div>
            </>
          ) : (
            <p className="text-sm leading-relaxed text-stone-600">
              {hasMatcha
                ? `Matcha attach rate is ${currentPct.toFixed(1)}% — at or above the indicative ${benchmarkPct}% benchmark, so no pastry-pairing gap was detected.`
                : "No matcha-drink attach pattern was detected in this export, so the evidence here is the sales trend alone."}
            </p>
          )}

          {riser && (
            <div className="mt-6 border-t border-stone-100 pt-5">
              <BeatLabel n="01" text="what’s moving" />
              <div className="mt-3 flex items-baseline gap-2">
                <AnimatedNumber
                  value={riser.units_per_week}
                  className="text-4xl font-semibold tabular-nums text-emerald-950"
                />
                <span className="text-sm text-stone-500">{riser.item}/week, recent</span>
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
                    {faller.pct_change}% · {faller.units_per_week}/wk recent
                  </span>
                </div>
              )}
            </div>
          )}
        </section>

        {/* -------------------- 5 · trading rhythm (supply signal) -------------------- */}
        <section className="mt-6 rounded-3xl border border-stone-200 bg-white p-6 shadow-sm md:p-7">
          <BeatLabel n="·" text="when the rush hits — time the bake and the order" />
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

        {/* -------------------- 6 · localise + ask Siki -------------------- */}
        <LocalityCard pack={pack} onPack={setPack} />

        {pack && (
          <section className="mt-4 rounded-2xl border border-stone-200 bg-white px-5 py-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-widest text-stone-500">
              Your corner of the map{pack.cafe ? ` — ${pack.area}` : ""}
            </p>
            {pack.cafe && <p className="mt-1 text-sm text-stone-600">{pack.cafe.blurb}</p>}
            <ul className="mt-2 space-y-1.5 text-sm">
              {pack.competitors.map((c) => (
                <li key={c.name} className="flex items-baseline gap-2">
                  <span className="font-medium text-stone-800">
                    {c.url ? <a href={c.url} target="_blank" rel="noreferrer" className="underline decoration-sky-400">{c.name} ↗</a> : c.name}
                  </span>
                  <span className="text-xs text-stone-500">{c.note}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[11px] italic text-stone-400">{pack.source_note}</p>
          </section>
        )}

        <CafeChat briefing={data} pack={pack} />

        {/* -------------------- 7 · optional deeper analysis (collapsed) -------------------- */}
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

          {copy.competitor_prices && copy.competitor_prices.length > 0 && (
            <details className="rounded-2xl border border-stone-200 bg-white px-5 py-4 shadow-sm">
              <summary className="cursor-pointer text-sm font-semibold text-stone-800">
                What others charge nearby
              </summary>
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
            </details>
          )}

          <details className="rounded-2xl border border-stone-200 bg-white px-5 py-4 shadow-sm">
            <summary className="cursor-pointer text-sm font-semibold text-stone-800">
              Data used in this briefing
            </summary>
            <SourceChooser
              data={data}
              onUploaded={(b) => { setData(b); }}
            />
          </details>

          <details className="rounded-2xl border border-stone-200 bg-white px-5 py-4 shadow-sm">
            <summary className="cursor-pointer text-sm font-semibold text-stone-800">
              How this demo was made (the honest bit)
            </summary>
            <div className="mt-3 space-y-2 text-xs leading-relaxed text-stone-500">
              {data.verification && data.verification.length > 0 && (
                <p className="flex items-center gap-1.5 text-emerald-700"
                   title={data.verification.map((v) => `${v.claim} — ${v.note}`).join("\n")}>
                  <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 fill-emerald-600"><path d="M6.2 11.2 2.9 7.9l1.1-1.1 2.2 2.2 5-5L12.3 5z"/></svg>
                  {data.verification.filter((v) => v.verified).length}/{data.verification.length} figures
                  independently re-computed from the raw tills by the agent{" "}
                  {agentLink && <a href={agentLink} target="_blank" rel="noreferrer" className="underline">(watch)</a>}
                </p>
              )}
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
                Built at the Manus café hackathon.
              </p>
              {data.benchmarks.sources && (
                <p>
                  Benchmarks (researched by the agent, cited):{" "}
                  {Object.values(data.benchmarks.sources).map((v) => `${v.value} — ${v.source}`).join(" · ")}
                </p>
              )}

              {/* marquee artefacts, made by the agent */}
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <figure className="overflow-hidden rounded-2xl border border-stone-200 bg-black">
                  <video
                    src="/cafe/week-in-review.mp4"
                    controls
                    muted
                    loop
                    playsInline
                    className="h-52 w-full object-cover"
                  />
                  <figcaption className="bg-white px-4 py-2 text-[11px] text-stone-500">
                    20-second “week in review”, directed + animated + rendered by the agent{" "}
                    <a href="https://manus.im/share/bakMWaULrS9jiAmYftqAHx?replay=1" target="_blank" rel="noreferrer"
                       className="font-medium text-violet-700 underline">watch its run ↗</a>
                  </figcaption>
                </figure>
                <a
                  href="/cafe/monday-onepager.pdf"
                  target="_blank"
                  rel="noreferrer"
                  className="group flex flex-col justify-between rounded-2xl border border-stone-200 bg-white p-5 hover:border-violet-300"
                >
                  <div>
                    <p className="font-semibold text-stone-900 group-hover:text-violet-800">
                      The Monday one-pager (PDF)
                    </p>
                    <p className="mt-1 text-sm leading-relaxed text-stone-600">
                      A café-zine A4 card: stat chips, week-by-week bars, the EL&N price check.
                      Print it, pin it by the till.
                    </p>
                  </div>
                  <p className="mt-3 text-[11px] text-stone-400">
                    Designed by the agent in one pass{" "}
                    <span
                      onClick={(e) => {
                        e.preventDefault();
                        window.open("https://manus.im/share/c9Fi5Anv4qDn3dz8asdMsJ?replay=1", "_blank");
                      }}
                      className="font-medium text-violet-700 underline cursor-pointer"
                    >
                      watch its run ↗
                    </span>
                  </p>
                </a>
              </div>
              <p className="text-[11px] leading-relaxed text-stone-400">
                Both artefacts are served from this site (no standing dependency); the agent’s full
                runs replay publicly at the links above.
              </p>
            </div>
          </details>
        </section>

        {/* -------------------- 8 · run it on your shop -------------------- */}
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

        <footer className="mt-8 text-center text-[11px] leading-relaxed text-stone-400" data-scrollable>
          A snapshot of what Siki does with the books side, every day —{" "}
          <Link href="/" className="font-medium text-sky-700 underline">sikizana</Link> ·
          {" "}built at the Manus café hackathon, Matcha Mochi, City Road
          <br />
          <a href="https://matchamocha-sacjkwfw.manus.space/" target="_blank" rel="noreferrer"
             className="font-medium text-violet-600 underline">
            The presentation poster ↗
          </a>{" "}
          — the agent built and published this site itself, from its own earlier runs
        </footer>
      </div>

      {/* present-mode chrome */}
      {!deck && data && (
        <button
          onClick={() => { setStep(0); setDeck(true); }}
          className="fixed bottom-5 right-5 z-40 rounded-full bg-stone-900 px-4 py-2.5 text-xs font-semibold text-white shadow-lg hover:bg-stone-700"
        >
          ▸ Present
        </button>
      )}
      {deck && (
        <div className="pointer-events-none fixed inset-0 z-[60]">
          {/* dots + labels */}
          <div className="pointer-events-auto absolute left-4 top-1/2 hidden -translate-y-1/2 flex-col gap-2.5 lg:flex">
            {labels.map((l, i) => (
              <button key={i} onClick={() => setStep(i)} className="flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${i === step ? "bg-sky-600" : "bg-stone-300 hover:bg-stone-400"}`} />
                <span className={`max-w-40 truncate text-left text-[10px] ${i === step ? "font-semibold text-sky-700" : "text-stone-400"}`}>
                  {l}
                </span>
              </button>
            ))}
          </div>
          {/* exit */}
          <div className="pointer-events-auto absolute right-4 top-4">
            <button
              onClick={() => setDeck(false)}
              className="rounded-full border border-stone-300 bg-white/80 px-3 py-1.5 text-xs font-medium text-stone-600 hover:bg-white"
            >
              ✕ Exit · Esc
            </button>
          </div>
          {/* arrows + counter */}
          <div className="pointer-events-auto absolute bottom-5 right-5 flex items-center gap-2">
            <button
              onClick={() => setStep((s) => Math.max(0, s - 1))}
              className="rounded-full border border-stone-300 bg-white/80 px-3 py-1.5 text-stone-600 hover:bg-white"
              aria-label="Previous"
            >
              ←
            </button>
            <span className="text-xs tabular-nums text-stone-500">{step + 1}/{labels.length}</span>
            <button
              onClick={() => setStep((s) => Math.min(labels.length - 1, s + 1))}
              className="rounded-full bg-stone-900 px-3 py-1.5 text-white hover:bg-stone-700"
              aria-label="Next"
            >
              →
            </button>
          </div>
          {/* progress segments */}
          <div className="pointer-events-auto absolute bottom-5 left-1/2 flex -translate-x-1/2 gap-1">
            {labels.map((_, i) => (
              <span key={i} className={`h-1 rounded-full transition-all ${i === step ? "w-6 bg-sky-500" : "w-2 bg-stone-300"}`} />
            ))}
          </div>
          <p className="absolute bottom-5 left-5 hidden text-[10px] text-stone-400 md:block">
            scroll · arrows · swipe to move
          </p>
        </div>
      )}
    </main>
  );
}
