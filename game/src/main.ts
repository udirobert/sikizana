/**
 * The Late Market — entry point.
 * Boot order: title flow → Web Audio unlock gesture → chapters 1→2→3.
 * All persistence is localStorage-only (privacy rails, docs/game/GDD.md):
 * the decision ledger + street counters live in the browser, clearable from
 * the title screen, never transmitted anywhere.
 */
import "./styles/tokens.css";
import { AudioBus, type PlayHandle } from "./audio/bus";
import { VoicePlayer, type Speaker } from "./audio/voice";
import { DecisionLedger } from "./engine/ledger";
import { runChapter1 } from "./chapters/ch1screen";
import type { Ch1State } from "./chapters/ch1";
import { runChapter2 } from "./chapters/ch2screen";
import { runChapter3 } from "./chapters/ch3screen";
import { buildFinaleView, verdictLine } from "./chapters/finale";
import { runFinale } from "./chapters/finaleScreen";
import { renderStreet as renderStreetRow, stallFigure, streetState, type StreetCounters } from "./ui/street";
import type { LedgerEntry } from "./engine/ledger";
import { setSimpleLanguage } from "./i18n";
import { getMarketMode, loadStoredMarketMode, resolveMarketMode, setMarketMode, type MarketMode } from "./engine/market";
import { chapterReached, runFinished, sendTelemetry } from "./engine/telemetry";
import { installChoiceKeys } from "./ui/keys";

// Market is resolved before anything renders: ?market=souq (trailer/deep link)
// wins, then the saved choice. Switching it at the title clears stale progress
// — a run's ledger was recorded against one remedy, and mixing them would make
// the debrief's numbers incoherent.
setMarketMode(resolveMarketMode(window.location.search, loadStoredMarketMode()));

const start = document.getElementById("start") as HTMLElement;
const game = document.getElementById("game") as HTMLElement;

const LEDGER_KEY = "lm.ledger.v1";
const CH1_SAVE_KEY = "lm.ch1.v1";
const PREFS_KEY = "lm.prefs.v1";

interface Prefs { sound: boolean; music: boolean; textScale: "sm" | "md" | "lg"; simpleLang: boolean }

function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) return { sound: true, music: true, textScale: "md", simpleLang: false, ...(JSON.parse(raw) as Partial<Prefs>) };
  } catch { /* fall through to defaults */ }
  return { sound: true, music: true, textScale: "md", simpleLang: false };
}

const prefs = loadPrefs();
function savePrefs(): void {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* private-mode */ }
}
document.documentElement.dataset.textScale = prefs.textScale;
setSimpleLanguage(prefs.simpleLang);

function loadLedger(): DecisionLedger {
  try {
    const raw = localStorage.getItem(LEDGER_KEY);
    return raw ? DecisionLedger.deserialize(raw) : new DecisionLedger();
  } catch {
    return new DecisionLedger();
  }
}

function loadCh1Save(): Ch1State | null {
  try {
    const raw = localStorage.getItem(CH1_SAVE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Ch1State;
    return s && typeof s.day === "number" && Array.isArray(s.invoices) ? s : null;
  } catch {
    return null;
  }
}

const bus = new AudioBus();
// Pre-baked dialogue: plays only when the player chose sound on (bus unlocked
// AND the Sound pref is on) and a baked take exists for the exact line.
const voice = new VoicePlayer(() => bus.unlocked && prefs.sound);
let ledger = loadLedger();

/** Speaker stingers fire once per speaker per session — punctuation, not wallpaper. */
const stung = new Set<string>();
function sting(speaker: "siki" | "zana"): void {
  if (stung.has(speaker)) return;
  stung.add(speaker);
  bus.playOnce(`audio/sfx/${speaker}_stinger.mp3`, 0.8);
}

/**
 * One spoken line at a time — the speech grows, Bookkeeper-style.
 * The bubble goes into the ACTIVE chapter section (the last visible one),
 * so Siki's line never stacks above another chapter's cards. The dedup
 * rule (recovery plan §2.3) is about CONTENT: the spoken line is short,
 * the chapter's cards carry the detail — enforced in each chapter screen.
 */
function say(speaker: Speaker, text: string): void {
  const sections = Array.from(game.querySelectorAll(":scope > section.lm-chapter")) as HTMLElement[];
  const active = sections.length ? sections[sections.length - 1]! : game;
  for (const old of Array.from(active.querySelectorAll(":scope > p.lm-line"))) old.remove();
  const bubble = document.createElement("p");
  bubble.className = `lm-line ${speaker}`;
  bubble.textContent = text;
  bubble.setAttribute("role", "note");
  active.prepend(bubble);
  // Only the narrators get stingers; the stallholders arrive unannounced.
  if (speaker === "siki" || speaker === "zana") sting(speaker);
  void voice.speak(speaker, text, bubble);
}

function saveLedger(): void {
  try { localStorage.setItem(LEDGER_KEY, ledger.serialize()) } catch { /* private-mode: in-memory only */ }
}

/** Title-screen purge (privacy rail: players scrub before sharing). */
function purgeSave(): void {
  localStorage.removeItem(LEDGER_KEY);
  localStorage.removeItem(CH1_SAVE_KEY);
  localStorage.removeItem(PROFILE_KEY);
}

const SEED = 20261109; // jam build: one canonical run for judging

/** ── The street — defer/pay/fees drive the stalls (GDD §2 step 2). ──
 *
 * ch1 street events (deferrals, skipped bill, collections) create NO ledger
 * entries, so they live in session counters; ch2/ch3 NPC fees do create ledger
 * entries, so they're read from the ledger. Both feed one counter. */
const streetSession = { deferrals: 0, billSkipped: 0, collected: 0, lateFees: 0, streetTake: 0 };

function streetCounters(): StreetCounters {
  const all = ledger.all();
  let npcFees = 0;
  for (const e of all) if (e.npc?.feePaid) npcFees += e.npc.feePaid;
  // The street's money so far: ch1 shed value (the lantern) + late charges +
  // NPC fees from ch2/ch3. This is what the strip's "£X so far" tallies.
  const toStreet = npcFees + streetSession.lateFees + streetSession.streetTake;
  return {
    toStreet,
    streetTake: streetSession.streetTake,
    deferrals: streetSession.deferrals,
    collected: streetSession.collected,
    billSkipped: streetSession.billSkipped,
  };
}

/** Chapter-1 driver reports street-moving events that have no ledger entry. */
function noteStreet(ev: { deferral?: boolean; billSkipped?: boolean; collected?: number; lateFee?: number; streetTake?: number }): void {
  if (ev.deferral) streetSession.deferrals += 1;
  if (ev.billSkipped) streetSession.billSkipped += 1;
  if (ev.collected) streetSession.collected += ev.collected;
  if (ev.lateFee) streetSession.lateFees += ev.lateFee;
  if (ev.streetTake) streetSession.streetTake += ev.streetTake;
  renderStreet();
}

// The named stallholders, keyed by stall kind (cart/awning are the market
// itself — no character). When one of THEIR stalls lights because of the
// player's own choice, they step up to your stall with a line — the street's
// idea becomes a character, not an icon (recovery plan §4).
const KIND_ACTORS: Record<string, { name: string; kind: "factor" | "collector" | "shark"; line: string }> = {
  factor: { name: "The Factor", kind: "factor", line: "Aged on your desk, did it? Good. I will pay you for the days you lost — the rest is mine." },
  collector: { name: "The Collector", kind: "collector", line: "I buy the customer with the debt still on it. You keep the invoice; I keep the account." },
  shark: { name: "The Shark", kind: "shark", line: "A little cash now, a little back each day. The daily number is small on purpose. Is it not?" },
};

let prevLit = -1;
function renderStreet(): void {
  const slot = document.getElementById("street-slot");
  if (!slot) return;
  const counters = streetCounters();
  const { lit } = streetState(counters);
  const row = renderStreetRow(counters);
  // The run's shape rides along with the street (same node, re-parented on
  // every rebuild) so "where am I" never needs its own bar.
  if (progressEl) row.append(progressEl);
  // The stall that just changed flares once (recovery plan §3: the street
  // changes *when* you leave it — the player should see the stall move). If
  // it's a named stallholder, that character steps up with a line. Track the
  // COMPUTED lit count (monotonic) — not the DOM ".lit" class count, which
  // drops when a stall shutters in the same frame.
  if (prevLit >= 0 && lit > prevLit) {
    // The newly-lit stall is the one that crossed from dark to lit. With
    // `shut` shuttered (left) and `lit` lit, the rightmost lit stall is the
    // one that just lit — find it by position, then key the actor off kind.
    const stalls = Array.from(row.querySelectorAll<HTMLElement>(".lm-stall"));
    const litStalls = stalls.filter((s) => s.classList.contains("lit"));
    const changed = litStalls[litStalls.length - 1] ?? null; // rightmost lit
    changed?.classList.add("lm-stall-change");
    const kind = changed?.dataset.kind;
    const actor = kind ? KIND_ACTORS[kind] : null;
    if (actor) actorStepUp(actor.name, actor.kind, actor.line);
  }
  prevLit = lit;
  slot.replaceChildren(row);
}

/** A stallholder steps to your stall: their figure + a line, briefly. Text
 *  always; voiced only if the line is in the baked manifest (else silent). */
function actorStepUp(name: string, kind: "factor" | "collector" | "shark", line: string): void {
  const slot = document.getElementById("street-actor");
  if (!slot) return;
  slot.replaceChildren();
  const fig = stallFigure(kind);
  fig.classList.add("lm-stall-actor-fig");
  const figWrap = document.createElement("div");
  figWrap.className = "lm-stall-actor-fig-wrap";
  figWrap.setAttribute("aria-hidden", "true");
  figWrap.append(fig);
  const bubble = document.createElement("p");
  bubble.className = "lm-line stall-actor lm-rise";
  bubble.setAttribute("role", "note");
  const who = document.createElement("span");
  who.className = "lm-stall-actor-who";
  who.textContent = name;
  // The line gets its own span: the voice player's karaoke rebuilds its
  // target node's content, so the name prefix must live outside it.
  const lineSpan = document.createElement("span");
  lineSpan.textContent = line;
  bubble.append(who, document.createTextNode(" — "), lineSpan);
  slot.append(figWrap, bubble);
  // The stallholder performs their own line — silent when the take isn't
  // baked (manifest miss), but the text always lands.
  void voice.speak(kind, line, lineSpan);
  // Clear after a beat unless the street re-renders (a new event supersedes).
  window.setTimeout(() => { if (slot.contains(bubble)) slot.replaceChildren(); }, 6000);
}

/**
 * The run has a shape, and a player should be able to see it without having
 * read the store page: three chapters and a close. The chip lives in the
 * street strip (the place is the map) and the act card names each chapter as
 * a scene change — two seconds, non-blocking, then gone. Chapter 1 gets no
 * card: the title screen has just done that job, and the cold open is the
 * first thing a player should meet.
 */
const CHAPTERS: Record<1 | 2 | 3, string> = { 1: "The Stall", 2: "The Offer", 3: "Good Money After Bad" };

let progressEl: HTMLElement | null = null;

function setProgress(label: string, reached: number): void {
  if (!progressEl) return;
  const dots = "●".repeat(reached).padEnd(3, "○");
  progressEl.replaceChildren(
    elSpan("lm-progress-dots", dots),
    elSpan("lm-progress-label", label),
  );
}

function elSpan(cls: string, text: string): HTMLSpanElement {
  const s = document.createElement("span");
  s.className = cls;
  s.textContent = text;
  return s;
}

function actCard(n: 1 | 2 | 3 | "finale"): void {
  if (n === 1) return; // the title screen was the card
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  let host = document.getElementById("lm-act");
  if (!host) {
    host = document.createElement("div");
    host.id = "lm-act";
    host.setAttribute("aria-hidden", "true"); // the chapter heading already announces it
    game.append(host);
  }
  const card = document.createElement("div");
  card.className = "lm-act-card";
  card.append(
    elSpan("lm-act-eyebrow", n === "finale" ? "The week closes" : `Chapter ${n} of 3`),
    elSpan("lm-act-title", n === "finale" ? "Market Close" : CHAPTERS[n]),
  );
  host.replaceChildren(card);
  window.setTimeout(() => { if (host?.contains(card)) host.replaceChildren(); }, 2000);
}

/** Chapter sequence — one shared frame, nothing resets between chapters. */
function beginChapter(n: 1 | 2 | 3): void {
  const root = document.querySelector<HTMLElement>(`#ch${n}`) ?? (() => {
    const r = document.createElement("section");
    r.className = "lm-chapter";
    r.id = `ch${n}`;
    game.append(r);
    return r;
  })();
  for (const s of game.querySelectorAll("section.lm-chapter")) (s as HTMLElement).hidden = s.id !== `ch${n}`;
  actCard(n);
  setProgress(`Chapter ${n} of 3 · ${CHAPTERS[n]}`, n);
  // Funnel point: how far a visitor got. Anonymous, four events a run at most.
  sendTelemetry(chapterReached(n === 1 ? "ch1" : n === 2 ? "ch2" : "ch3"));

  if (n === 1) {
    runChapter1(
      {
        root,
        record: (e: Omit<LedgerEntry, "id">) => { ledger.record(e); saveLedger(); renderStreet(); },
        pairEntries: () => ledger.all().filter((e) => e.chapter === 1 && e.experimentId === "ch1_present_pair_a"),
        say,
        save: (s: Ch1State) => { try { localStorage.setItem(CH1_SAVE_KEY, JSON.stringify(s)); } catch { /* private-mode */ } },
        noteStreet,
        onTool: () => {
          localStorage.removeItem(CH1_SAVE_KEY); // chapter closed — the run is done
          document.dispatchEvent(new CustomEvent("lm:chapter-done", { detail: 1 }));
        },
      },
      SEED,
      loadCh1Save(),
    );
  }
  if (n === 2) {
    runChapter2(
      {
        root,
        record: (e: Omit<LedgerEntry, "id">) => { ledger.record(e); saveLedger(); renderStreet(); },
        pairEntries: () => ledger.all().filter((e) => e.chapter === 2 && e.experimentId.startsWith("ch2_anchor")),
        say,
        onTool: () => document.dispatchEvent(new CustomEvent("lm:chapter-done", { detail: 2 })),
      },
      SEED + 1,
    );
  }
  if (n === 3) {
    runChapter3({
      root,
      record: (e: Omit<LedgerEntry, "id">) => { ledger.record(e); saveLedger(); renderStreet(); },
      say,
      onTool: () => document.dispatchEvent(new CustomEvent("lm:chapter-done", { detail: 3 })),
    });
  }
}

let musicHandle: PlayHandle | null = null;
let bedsStarted = false;

/** Ambience always; music bed only while the Music pref is on. Idempotent. */
async function startBeds(): Promise<void> {
  if (bedsStarted || !bus.unlocked || !prefs.sound) return;
  bedsStarted = true;
  void bus.play("audio/sfx/market_ambience.mp3", { channel: "ambience", loop: true });
  if (prefs.music) musicHandle = await bus.play("audio/sfx/market_music.mp3", { channel: "music", loop: true });
}

function begin(withSound: boolean): void {
  if (withSound) {
    bus.unlock();
    bus.setVolume(prefs.sound ? 1 : 0);
    void startBeds();
  }
  start.hidden = true;
  game.hidden = false;

  // Persistent street strip sits above whatever chapter is running. The
  // progress chip is created first: renderStreet re-parents it into the row.
  progressEl = document.createElement("span");
  progressEl.className = "lm-progress";
  const streetSlot = document.createElement("div");
  streetSlot.id = "street-slot";
  game.append(streetSlot);
  renderStreet();

  // The stallholder "actor" line — the street's character who steps up when
  // one of their stalls lights on the player's own choice. Cleared on every
  // chapter change so a leftover figure never carries into the next scene.
  const actorSlot = document.createElement("div");
  actorSlot.id = "street-actor";
  game.append(actorSlot);

  document.addEventListener("lm:chapter-done", (ev) => {
    const n = (ev as CustomEvent<number>).detail as 1 | 2 | 3;
    actorSlot.replaceChildren();
    if (n === 3) return finale();
    beginChapter((n + 1) as 2 | 3);
  });

  // The keyboard is a first-class way to play: 1–3 pick, Enter continues.
  installChoiceKeys(game);

  // Dev/trailer jump: ?ch=2 starts mid-board without the 20-day replay.
  const jump = Number(new URLSearchParams(location.search).get("ch") ?? 1);
  beginChapter((([1, 2, 3].includes(jump) ? jump : 1) || 1) as 1 | 2 | 3);
}

const PROFILE_KEY = "lm.profile.v1";

interface StoredProfile {
  /** Mean of the three irrationality axes (0–100, lower is better). */
  score: number;
  deferral: number;
  anchoring: number;
  sunkCost: number;
  at: string;
  /** The quotable one-liner, so the title screen can read your week back. */
  verdictSiki?: string;
}

function irrationalityScore(p: { deferral: number; anchoring: number; sunkCost: number }): number {
  return (p.deferral + p.anchoring + p.sunkCost) / 3;
}

function loadBestProfile(): StoredProfile | null {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    return raw ? (JSON.parse(raw) as StoredProfile) : null;
  } catch {
    return null;
  }
}

function saveBestProfile(p: StoredProfile): void {
  try { localStorage.setItem(PROFILE_KEY, JSON.stringify(p)); } catch { /* private-mode */ }
}

/**
 * Finale — "You Were the Experiment / Market Close" (GDD A5).
 * Everything on screen derives from the ledger; the only extra state is the
 * best-profile record that powers the Rationality Delta across replays.
 */
function finale(): void {
  const view = buildFinaleView(ledger);
  const score = irrationalityScore(view.profile);
  const prev = loadBestProfile();
  const delta = prev ? { score: prev.score - score, improved: prev.score - score > 0 } : null;
  // Only a complete run may set the baseline — a partial/jumped run would
  // post an unbeatable score-0 "best" and poison every future delta.
  const replay = prev !== null;
  // The run is over — one event with the two things a post can quote: how many
  // finished, and whether a second run was better than the first.
  sendTelemetry(runFinished(delta ? delta.score : null, view.partial, replay));
  if (!view.partial && (!prev || score < prev.score)) {
    saveBestProfile({ score, ...view.profile, at: new Date().toISOString(), verdictSiki: verdictLine(view.profile).siki });
  }

  let review = document.getElementById("finale") as HTMLElement | null;
  if (!review) {
    review = document.createElement("section");
    review.id = "finale";
    review.className = "lm-chapter"; // hidden automatically by beginChapter
    game.append(review);
  }
  for (const s of game.querySelectorAll("section.lm-chapter")) (s as HTMLElement).hidden = s.id !== "finale";
  actCard("finale");
  setProgress("Market close", 3);
  runFinale({
    root: review,
    say,
    view,
    entries: () => ledger.all(),
    street: streetCounters(),
    delta,
    onRestart: () => {
      ledger = new DecisionLedger();
      saveLedger();
      localStorage.removeItem(CH1_SAVE_KEY);
      streetSession.deferrals = 0;
      streetSession.billSkipped = 0;
      streetSession.collected = 0;
      streetSession.lateFees = 0;
      streetSession.streetTake = 0;
      renderStreet();
      beginChapter(1);
    },
  });
}

// ── Market picker (title screen) ──
for (const radio of document.querySelectorAll<HTMLInputElement>('input[name="market"]')) {
  radio.checked = radio.value === getMarketMode();
  radio.addEventListener("change", () => {
    if (!radio.checked) return;
    const next = radio.value as MarketMode;
    if (next === getMarketMode()) return;
    setMarketMode(next);
    purgeSave(); // numbers from the other remedy don't carry
  });
}

document.getElementById("start-btn")?.addEventListener("click", () => begin(true));
document.getElementById("start-muted")?.addEventListener("click", () => begin(false));
document.getElementById("purge-save")?.addEventListener("click", purgeSave);

// ── Options (title screen): sound / music / text size, persisted. ──
const optSound = document.getElementById("opt-sound") as HTMLInputElement | null;
const optMusic = document.getElementById("opt-music") as HTMLInputElement | null;
const optText = document.getElementById("opt-textsize") as HTMLSelectElement | null;
if (optSound) optSound.checked = prefs.sound;
if (optMusic) optMusic.checked = prefs.music;
if (optText) optText.value = prefs.textScale;

optSound?.addEventListener("change", () => {
  prefs.sound = optSound.checked;
  savePrefs();
  bus.setVolume(prefs.sound ? 1 : 0);
  if (!prefs.sound) { bus.silence(); voice.stop(); bedsStarted = false; musicHandle = null; }
  else void startBeds();
});
optMusic?.addEventListener("change", () => {
  prefs.music = optMusic.checked;
  savePrefs();
  if (!prefs.music) { musicHandle?.stop(); musicHandle = null; }
  else if (bus.unlocked && prefs.sound) void bus.play("audio/sfx/market_music.mp3", { channel: "music", loop: true }).then((h) => { musicHandle = h; });
});
optText?.addEventListener("change", () => {
  prefs.textScale = (optText.value as Prefs["textScale"]) || "md";
  savePrefs();
  document.documentElement.dataset.textScale = prefs.textScale;
});

// Simple-language mode (GDD §4 accessibility bonus — it claims it, so it ships).
const optSimple = document.getElementById("opt-simplelang") as HTMLInputElement | null;
if (optSimple) optSimple.checked = prefs.simpleLang;
optSimple?.addEventListener("change", () => {
  prefs.simpleLang = optSimple.checked;
  savePrefs();
  setSimpleLanguage(prefs.simpleLang);
});

// ── Returning runner: the title screen reads your best week back. ──
// The score-chase hook — your own verdict, quoted at you, daring a rematch.
function renderBestWeek(): void {
  const best = loadBestProfile();
  if (!best) return;
  const panel = document.querySelector(".lm-title-panel");
  if (!panel) return;
  const when = (() => { try { return new Date(best.at).toLocaleDateString(); } catch { return ""; } })();
  const wrap = document.createElement("p");
  wrap.className = "lm-title-best";
  wrap.textContent = `Your best week: irrationality ${Math.round(best.score)}/100 (lower is better)${when ? ` · ${when}` : ""} — run it back and beat it.`;
  if (best.verdictSiki) {
    const q = document.createElement("span");
    q.className = "lm-title-verdict";
    q.textContent = `\u201C${best.verdictSiki}\u201D`;
    wrap.append(document.createElement("br"), q);
  }
  const actions = panel.querySelector(".lm-title-actions");
  if (actions) actions.after(wrap); else panel.prepend(wrap);
}
renderBestWeek();

// UI confirm blip on every choice click (delegated — covers all chapters).
game.addEventListener("click", (ev) => {
  if ((ev.target as HTMLElement).closest(".lm-choice")) bus.playOnce("audio/sfx/ui_confirm.mp3", 0.7);
});

export {};
