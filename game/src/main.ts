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
import { CH1_DAYS, type Ch1State } from "./chapters/ch1";
import { runChapter2 } from "./chapters/ch2screen";
import { runChapter3 } from "./chapters/ch3screen";
import { buildFinaleView, verdictLine } from "./chapters/finale";
import { runFinale } from "./chapters/finaleScreen";
import { runSecondWeek, BEST_KEY } from "./chapters/secondWeek";
import type { Week2State } from "./engine/weekGen";
import { renderStreet as renderStreetRow, streetState, noteSceneDay, scenePulse, sceneReactHome, sceneStepUp, type StreetCounters } from "./ui/street";
import { speakerPara } from "./ui/characters";
import type { LedgerEntry } from "./engine/ledger";
import { setSimpleLanguage } from "./i18n";
import { el, choiceButton, clear } from "./ui/dom";
import { stingFor } from "./audio/stings";
import { scoreBed, scoreEvent } from "./audio/score";
import { getMarketMode, loadStoredMarketMode, money, resolveMarketMode, setMarketMode, SOUQ_AR, SOUQ_VO, type MarketMode } from "./engine/market";
import { chapterReached, runFinished, sendTelemetry } from "./engine/telemetry";
import { installChoiceKeys } from "./ui/keys";
import { burst, trail } from "./ui/fx";
import { camera } from "./ui/camera";
import { sequence } from "./ui/tween";
import { gutClockEnabled, setGutClockEnabled } from "./ui/gutTimer";
import { dayTiles } from "./ui/dayTiles";

// Market is resolved before anything renders: ?market=souq (trailer/deep link)
// wins, then the saved choice. Switching it at the title clears stale progress
// — a run's ledger was recorded against one remedy, and mixing them would make
// the debrief's numbers incoherent.
setMarketMode(resolveMarketMode(window.location.search, loadStoredMarketMode()));

const start = document.getElementById("start") as HTMLElement;
const game = document.getElementById("game") as HTMLElement;

const LEDGER_KEY = "lm.ledger.v1";
const CH1_SAVE_KEY = "lm.ch1.v1";
const WEEK2_KEY = "***********";
const PREFS_KEY = "lm.prefs.v1";
/** How many times the narrated intro has been OFFERED (counted at mount, not
 *  completion — a player who skips at 1s has still "seen" the intro beat).
 *  Drives the replay affordance: the skip is labelled for them, and it is
 *  never focused (the film must not die to a stray Enter). */
const INTRO_SEEN_KEY = "lm.intro.seen.v1";

function introSeenCount(): number {
  try { return Number(localStorage.getItem(INTRO_SEEN_KEY) ?? "0") || 0; } catch { return 0; }
}
function markIntroSeen(): void {
  try { localStorage.setItem(INTRO_SEEN_KEY, String(introSeenCount() + 1)); } catch { /* private-mode */ }
}

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
  // Identity motif, not a fanfare: with every line now baked, the stinger
  // sits UNDER the first take rather than clashing with it.
  bus.playOnce(`audio/sfx/${speaker}_stinger.mp3`, 0.35);
}

/**
 * One spoken line at a time — the speech grows, Bookkeeper-style.
 * The bubble goes into the ACTIVE chapter section (the last visible one),
 * so Siki's line never stacks above another chapter's cards. The dedup
 * rule (recovery plan §2.3) is about CONTENT: the spoken line is short,
 * the chapter's cards carry the detail — enforced in each chapter screen.
 */
function say(speaker: Speaker, text: string, onDone?: () => void, host?: HTMLElement): void {
  // The VISIBLE chapter is the stage: sections live inside #game-cam, and
  // beginChapter hides the rest, so "not hidden" picks the one the player
  // is on (finale/week2/review included). No match falls back to #game.
  const sections = Array.from(document.querySelectorAll<HTMLElement>("section.lm-chapter")).filter((s) => !s.hidden);
  const active = sections.length ? sections[sections.length - 1]! : game;
  for (const old of Array.from(active.querySelectorAll(":scope > p.lm-line"))) old.remove();
  // One voice at a time: a new narrator line supersedes a lingering
  // street-actor take, and vice versa (see actorStepUp).
  document.getElementById("street-actor")?.replaceChildren();
  // Only the narrators get stingers; the stallholders arrive unannounced.
  if (speaker === "siki" || speaker === "zana") sting(speaker);
  // The council speaks from its own seat: with a host node (a counsel
  // card's text element) the karaoke lands in that card and no second box
  // is stacked above the panel — the voice comes from the portrait. The
  // card already carries the text, so the bubble would be a duplicate.
  if (host) {
    void voice.speak(speaker, text, host, onDone);
    return;
  }
  const bubble = speakerPara(speaker, text);
  active.prepend(bubble);
  // Karaoke rebuilds only the text node — figure and nameplate survive.
  const lineNode = bubble.querySelector<HTMLElement>(".lm-line-text");
  if (lineNode) void voice.speak(speaker, text, lineNode, onDone);
  else onDone?.();
}

function saveLedger(): void {
  try { localStorage.setItem(LEDGER_KEY, ledger.serialize()) } catch { /* private-mode: in-memory only */ }
}

/** Title-screen purge (privacy rail: players scrub before sharing). Also the
 *  scrub run when switching market modes — numbers from the other remedy
 *  never carry. In both cases the wipe must be TOTAL: storage, in-memory
 *  ledger and street counters, and every title line that leaned on them. */
function purgeSave(): void {
  localStorage.removeItem(LEDGER_KEY);
  localStorage.removeItem(CH1_SAVE_KEY);
  localStorage.removeItem(WEEK2_KEY);
  localStorage.removeItem(PROFILE_KEY);
  localStorage.removeItem(BEST_KEY);
  localStorage.removeItem(INTRO_SEEN_KEY); // the scrub is total: the next Begin is a first impression again
  // Memory too, not just storage: without this, Erase followed by Begin
  // silently continues the old run (in-memory ledger + street counters),
  // and the button looks dead because nothing changes on screen.
  ledger = new DecisionLedger();
  streetSession.deferrals = 0;
  streetSession.billSkipped = 0;
  streetSession.collected = 0;
  streetSession.lateFees = 0;
  streetSession.streetTake = 0;
  streetSession.held = 0;
  streetSession.prologueLit = false;
  renderStreet();
  // The scrub must be FELT: the best-run line goes, a short-lived promise
  // takes its place.
  document.querySelector(".lm-title-best")?.remove();
  const panel = document.querySelector(".lm-title-panel");
  if (panel && !panel.querySelector(".lm-title-scrubbed")) {
    const note = document.createElement("p");
    note.className = "lm-title-best lm-title-scrubbed";
    note.textContent = "The books are blank — your next Begin starts a fresh market.";
    panel.append(note);
    window.setTimeout(() => note.remove(), 6000);
  }
}

const SEED = 20261109; // jam build: one canonical run for judging

/** ── The street — defer/pay/fees drive the stalls (GDD §2 step 2). ──
 *
 * ch1 street events (deferrals, skipped bill, collections) create NO ledger
 * entries, so they live in session counters; ch2/ch3 NPC fees do create ledger
 * entries, so they're read from the ledger. Both feed one counter. */
const streetSession = { deferrals: 0, billSkipped: 0, collected: 0, lateFees: 0, streetTake: 0, held: 0, prologueLit: false, npcTake: { factor: 0, collector: 0, shark: 0 } };

function streetCounters(): StreetCounters {
  const all = ledger.all();
  let npcFees = 0;
  const npcTake = { factor: streetSession.npcTake.factor, collector: streetSession.npcTake.collector, shark: streetSession.npcTake.shark };
  for (const e of all) {
    if (e.npc?.feePaid) {
      npcFees += e.npc.feePaid;
      if (e.npc.npc === "The Factor") npcTake.factor += e.npc.feePaid;
      else if (e.npc.npc === "The Collector") npcTake.collector += e.npc.feePaid;
      else if (e.npc.npc === "The Shark") npcTake.shark += e.npc.feePaid;
    }
  }
  // The street's money so far: ch1 shed value (the lantern) + late charges +
  // NPC fees from ch2/ch3. This is what the strip's "£X so far" tallies —
  // and the tally's breakdown lists the same three components, never a
  // fabricated per-stall split.
  const toStreet = npcFees + streetSession.lateFees + streetSession.streetTake;
  return {
    toStreet,
    streetTake: streetSession.streetTake,
    deferrals: streetSession.deferrals,
    collected: streetSession.collected,
    billSkipped: streetSession.billSkipped,
    lateFees: streetSession.lateFees,
    npcFees,
    npcTake,
    held: streetSession.held,
    /** The Shark's stall claim: he took the old debt off your hands at 70%
     *  of face — the £720 he keeps lights a market stall (the market runs
     *  on everyone's lateness, including his profit on yours). Session
     *  counter, deliberately NOT ledger feePaid: costOfNotActing sums
     *  npc.feePaid on acceptances, and the prologue must not inflate the
     *  finale's week-arithmetic. */
    prologueLit: streetSession.prologueLit,
  };
}

/** Consequence stingers — one procedural figure per street event, so the
 *  ledger's three moves (feed the street / kill the bill / money lands)
 *  each have their own sound. Silent-first and muted players get nothing;
 *  the visuals carry the same meaning. */
function consequenceSfx(kind: "defer" | "collect" | "bill"): void {
  if (!bus.unlocked || !prefs.sound) return;
  if (kind === "defer") {
    bus.tone(196, { dur: 0.22, gain: 0.1 });
    bus.tone(147, { dur: 0.3, gain: 0.09, delay: 0.09 });
  } else if (kind === "collect") {
    bus.tone(392, { dur: 0.16, gain: 0.1 });
    bus.tone(523, { dur: 0.24, gain: 0.09, delay: 0.08 });
  } else {
    bus.tone(110, { dur: 0.3, type: "triangle", gain: 0.12, slideTo: 82 });
  }
}

/** Chapter-1 driver reports street-moving events that have no ledger entry. */
function noteStreet(ev: { deferral?: boolean; billSkipped?: boolean; collected?: number; lateFee?: number; streetTake?: number; flair?: boolean; held?: number; prologueLit?: boolean }): void {
  if (ev.deferral) streetSession.deferrals += 1;
  if (ev.billSkipped) streetSession.billSkipped += 1;
  if (ev.collected) streetSession.collected += ev.collected;
  if (ev.lateFee) streetSession.lateFees += ev.lateFee;
  if (ev.streetTake) streetSession.streetTake += ev.streetTake;
  if (ev.held !== undefined) streetSession.held = ev.held;
  if (ev.prologueLit) streetSession.prologueLit = true;
  if (ev.collected) consequenceSfx("collect");
  else if (ev.deferral) consequenceSfx("defer");
  else if (ev.billSkipped) consequenceSfx("bill");
  // Cosmetic-only pulse (the prologue's off-book offer): the street flinches.
  // The take's REAL visibility travels separately, via prologueLit — one
  // stall lights, one line enters the tally's breakdown, no till arithmetic.
  if (ev.flair) {
    const slot = document.getElementById("street-slot");
    if (slot) {
      slot.classList.remove("lm-street-flair");
      void slot.offsetWidth; // restart the animation
      slot.classList.add("lm-street-flair");
      window.setTimeout(() => slot.classList.remove("lm-street-flair"), 1600);
    }
  }
  if (ev.collected || ev.deferral || ev.billSkipped) {
    camera.punch();
    const moved = document.querySelector<HTMLElement>(".lm-stall.lm-stall-change");
    const r = moved?.getBoundingClientRect();
    if (r) {
      if (ev.collected) burst({ shape: "coin", count: 16, colors: ["#ffd166", "#6fd08c"], origin: r });
      else if (ev.deferral) trail({ shape: "mote", count: 10, origin: r });
      else burst({ shape: "petal", count: 8, origin: tillRect() ?? r });
    }
  }
  if (ev.billSkipped) camera.settle();
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
let prevShut = -1;
/** Re-applied on held-only redraws so a stall that just lit stays the one that moved. */
let pulseKind: string | null = null;
/** The pitch's reaction to the last ledger beat — survives row rebuilds. */
let homeReact: { cls: string; until: number } | null = null;

const calmMotion = (): boolean => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** A coin arcs between the till and the stall that moved — the ledger
 *  event made visible. `to-street`: deferral funds a stall; `to-till`:
 *  a collection lands. Decorative only; the counters already moved. */
function flyCoin(from: DOMRect, to: DOMRect, dir: "to-street" | "to-till"): void {
  if (calmMotion()) return;
  const coin = document.createElement("div");
  coin.className = "lm-coin";
  const sx = from.left + from.width / 2 - 7;
  const sy = from.top + from.height / 2 - 7;
  const tx = to.left + to.width / 2 - 7;
  const ty = to.top + to.height / 2 - 7;
  coin.style.left = `${sx}px`;
  coin.style.top = `${sy}px`;
  document.body.append(coin);
  const peakY = Math.min(sy, ty) - 70;
  coin.animate([
    { transform: "translate(0, 0) scale(1)", opacity: 1 },
    { transform: `translate(${(tx - sx) / 2}px, ${peakY - sy}px) scale(1.15)`, opacity: 1, offset: 0.55 },
    { transform: `translate(${tx - sx}px, ${ty - sy}px) scale(0.55)`, opacity: 0.85 },
  ], { duration: 750, easing: "cubic-bezier(.3,.7,.4,1)" }).onfinish = () => coin.remove();
  // Lands in the ears too: a bright clink for money coming home, a duller
  // one for money leaving for the street. Scheduled on the audio clock to
  // land with the visual (~700ms); no-ops when the bus is locked/muted.
  if (dir === "to-till") {
    bus.tone(2093, { dur: 0.14, gain: 0.05, delay: 0.7 });
    bus.tone(2794, { dur: 0.1, gain: 0.035, delay: 0.73 });
  } else {
    bus.tone(660, { dur: 0.18, type: "triangle", gain: 0.06, slideTo: 440, delay: 0.7 });
  }
}

/** The till the coin flies from/to — whichever chrome the chapter drew. */
function tillRect(): DOMRect | null {
  const el = document.querySelector<HTMLElement>(".lm-till, .lm-stall-chrome-till");
  return el ? el.getBoundingClientRect() : null;
}

/** One line of street world-texture — chapters feed it (ch1: one per day).
 *  OpenTTD ticker pattern: a 2-line feed, newest on top; the street
 *  remembers what just happened instead of overwriting it. */
function streetWhisper(text: string): void {
  const el = document.getElementById("street-whisper");
  if (!el) return;
  const line = document.createElement("p");
  line.className = "lm-whisper-line lm-rise";
  line.textContent = text;
  el.prepend(line);
  while (el.children.length > 2) el.lastElementChild?.remove();
}

/** One-shot street effects for the moment beats: the Shark's shadow sweeps
 *  the stalls once, mid-week, only on the run where the player kept the old
 *  debt (or, on a clean run, carries his revised number); "shutter-blink"
 *  pulses the strip as a stall shutters on landing money. CSS owns both
 *  (reduced motion: the spoken lines carry the beat). */
function streetFx(fx: "shark-shadow" | "shutter-blink"): void {
  const slot = document.getElementById("street-slot");
  if (!slot || calmMotion()) return;
  if (fx === "shark-shadow") {
    slot.classList.remove("lm-shark-sweep");
    void slot.offsetWidth; // restart the animation if one is somehow alive
    slot.classList.add("lm-shark-sweep");
    window.setTimeout(() => slot.classList.remove("lm-shark-sweep"), 1800);
    return;
  }
  slot.classList.remove("lm-shutter-blink");
  void slot.offsetWidth;
  slot.classList.add("lm-shutter-blink");
  window.setTimeout(() => slot.classList.remove("lm-shutter-blink"), 900);
}

function renderStreet(): void {
  const slot = document.getElementById("street-slot");
  if (!slot) return;
  const counters = streetCounters();
  const { lit, shut } = streetState(counters);
  const row = renderStreetRow(counters);
  // The run's shape rides along with the street (same node, re-parented on
  // every rebuild) so "where am I" never needs its own bar. Meta lives on
  // the counter rail now, so search the whole slot, not just the row.
  const meta = slot.querySelector(".lm-street-meta");
  if (progressEl) (meta ?? row).append(progressEl);
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
    if (changed?.dataset.idx !== undefined) scenePulse(Number(changed.dataset.idx));
    pulseKind = changed?.dataset.kind ?? null;
    // Deferral lands hard on the people keeping your pitch. The row is
    // rebuilt on every street render, so the reaction is carried as a
    // short-lived flag and re-applied to whichever row is current.
    homeReact = { cls: "lm-home-droop", until: Date.now() + 1400 };
  scoreEvent("defer"); // a stall lit on the street's terms — tension up
    // The money's path, made visible: till → the stall it just lit.
    const till = tillRect();
    if (till && changed) flyCoin(till, changed.getBoundingClientRect(), "to-street");
    const kind = pulseKind;
    const actor = kind ? KIND_ACTORS[kind] : null;
    if (actor) {
      actorStepUp(actor.name, actor.kind, actor.line);
      // Faction beats get their reserved camera/particle response —
      // the FEEL_MATRIX rows for the three named stallholders.
      const r = changed?.getBoundingClientRect();
      if (r) {
        if (kind === "shark") {
          camera.shake(3);
          scoreEvent("shark");
          burst({ shape: "shard", count: 14, colors: ["#e5604f", "#ff7b72"], origin: r });
        } else if (kind === "collector") {
          camera.settle();
          burst({ shape: "shard", count: 12, colors: ["#b79bff", "#8f7ae0"], origin: r });
        } else {
          burst({ shape: "coin", count: 10, colors: ["#f5c04e", "#ffd166"], origin: r });
        }
      }
    }
  }
  // A collection shutters a stall: shut stalls render leftmost, so the one
  // that just closed sits at index prevShut.
  if (prevShut >= 0 && shut > prevShut) {
    const stalls = Array.from(row.querySelectorAll<HTMLElement>(".lm-stall"));
    const closed = stalls[prevShut] ?? null;
    closed?.classList.add("lm-stall-change");
    if (closed?.dataset.idx !== undefined) scenePulse(Number(closed.dataset.idx));
    // Money coming home is the pitch's good day.
    homeReact = { cls: "lm-home-cheer", until: Date.now() + 1400 };
  scoreEvent("collect"); // money came home — release
    // And the cash comes home: stall → till.
    const till = tillRect();
    if (till && closed) flyCoin(closed.getBoundingClientRect(), till, "to-till");
  }
  if (pulseKind) row.querySelector(`[data-kind="${pulseKind}"]`)?.classList.add("lm-stall-change");
  // The companions' reaction survives row rebuilds for its ~1s window.
  if (homeReact) {
    if (Date.now() < homeReact.until) {
      row.querySelector(".lm-stall-home")?.classList.add(homeReact.cls);
      sceneReactHome(homeReact.cls as "lm-home-cheer" | "lm-home-droop");
    } else homeReact = null;
  }
  prevLit = lit;
  prevShut = shut;
  slot.replaceChildren(row, ...(counterRail ? [counterRail] : []));
}

/** A stallholder steps to your stall: their line, briefly, in the same
 *  painterly voice as every other beat (speakerPara portrait, not line
 *  art). Text always; voiced only if the line is in the baked manifest
 *  (else silent). The figure performs in-scene via sceneStepUp. */
function actorStepUp(name: string, kind: "factor" | "collector" | "shark", line: string): void {
  const slot = document.getElementById("street-actor");
  if (!slot) return;
  // A new event supersedes a fading one: reset the fade before re-filling.
  slot.classList.remove("lm-actor-out");
  slot.replaceChildren();
  void name;
  // One voice at a time: the consequence voice replaces the day-opener.
  const sections = Array.from(document.querySelectorAll<HTMLElement>("section.lm-chapter")).filter((s) => !s.hidden);
  const active = sections.length ? sections[sections.length - 1]! : null;
  if (active) for (const old of Array.from(active.querySelectorAll(":scope > p.lm-line"))) old.remove();
  // Painterly standard: the portrait lives inside the bubble, same grammar
  // as Siki/Zana everywhere else — no floating line-art figure above it.
  const bubble = speakerPara(kind, line);
  bubble.classList.add("stall-actor", "lm-rise");
  const lineSpan = bubble.querySelector<HTMLElement>(".lm-line-text");
  slot.append(bubble);
  // The stallholder performs their own line — silent when the take isn't
  // baked (manifest miss), but the text always lands.
  if (lineSpan) void voice.speak(kind, line, lineSpan);
  // In-scene step-up: the sprite approaches your counter in the place,
  // while the DOM line stays the accessible text. Indices: factor 2,
  // collector 3, shark 4 (STALLS order cart/awning/factor/collector/shark).
  sceneStepUp(kind === "factor" ? 2 : kind === "collector" ? 3 : 4);
  // Sits for the take, fades like it arrived, then clears — unless the
  // street re-renders (a new event supersedes and wipes it first).
  window.setTimeout(() => { slot.classList.add("lm-actor-out"); }, 6200);
  window.setTimeout(() => { if (slot.contains(bubble)) slot.replaceChildren(); slot.classList.remove("lm-actor-out"); }, 6700);
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
/** The counter rail — the wooden edge between the street (far plane) and
 *  the chapter boards (near plane). Lives inside #street-slot so it sticks
 *  with the strip and carries the street's books on the counter front. */
let counterRail: HTMLElement | null = null;

function setProgress(label: string, reached: number): void {
  if (!progressEl) return;
  progressEl.replaceChildren(
    dayTiles(reached, 3),
    elSpan("lm-progress-label", label),
  );
}

function elSpan(cls: string, text: string): HTMLSpanElement {
  const s = document.createElement("span");
  s.className = cls;
  s.textContent = text;
  return s;
}

/**
 * The chapter sting — a scene change, not a page swap. One overlay card
 * (eyebrow + title + epigraph) that fades and is gone in ~2.4s; the epigraph
 * is voiced when a baked take exists (STING_LINES is the frozen contract —
 * manifest key = display text, byte-for-byte). Missing audio degrades
 * silently: the card always renders. Under reduced motion the card is
 * static — deliberately different from the old actCard, which showed
 * nothing: a chapter boundary is information, not decoration.
 */
/**
 * The camera rig: chapter content lives inside #game-cam so camera moves
 * (drift/punch/settle/shake/pan) transform the scene — while the street
 * strip, actor line, whisper and fiction mark stay pinned siblings.
 * Created lazily on first stage append.
 */
let camEl: HTMLElement | null = null;
function stageAppend(node: HTMLElement): void {
  if (!camEl) {
    camEl = document.createElement("div");
    camEl.id = "game-cam";
    game.append(camEl);
    camera.attach(camEl); // apply any pending camera state (idle etc.)
  }
  camEl.append(node);
}

function chapterSting(n: 1 | 2 | 3 | "finale"): void {
  if (n === 1) return; // the prologue is chapter 1's entrance
  const spec = stingFor(n);
  let host = document.getElementById("lm-act");
  if (!host) {
    host = document.createElement("div");
    host.id = "lm-act";
    host.setAttribute("aria-hidden", "true"); // the chapter heading already announces it
    stageAppend(host);
  }
  const card = el("div", { class: "lm-sting-card" });
  card.append(
    elSpan("lm-act-eyebrow", n === "finale" ? "The week closes" : `Chapter ${n} of 3`),
    elSpan("lm-act-title", n === "finale" ? "Market Close" : CHAPTERS[n]),
    el("p", { class: "lm-sting-line" }, spec.text),
  );
  host.replaceChildren(card);
  camera.flash(); // chapter turns get the lantern pulse (camera/flash.js)
  scoreEvent("sting");
  // The card's own text node is the karaoke target — say() would prepend
  // into the chapter section, which clear(root) wipes the moment it mounts.
  const lineNode = card.querySelector<HTMLElement>(".lm-sting-line");
  if (lineNode) void voice.speak(spec.speaker, spec.text, lineNode);
  window.setTimeout(() => { if (host?.contains(card)) host.replaceChildren(); }, 2400);
}

/** Chapter sequence — one shared frame, nothing resets between chapters. */
function beginChapter(n: 1 | 2 | 3): void {
  const root = document.querySelector<HTMLElement>(`#ch${n}`) ?? (() => {
    const r = document.createElement("section");
    r.className = "lm-chapter";
    r.id = `ch${n}`;
    stageAppend(r);
    return r;
  })();
  for (const s of game.querySelectorAll("section.lm-chapter")) (s as HTMLElement).hidden = s.id !== `ch${n}`;
  chapterSting(n);
  camera.panIn(); // the scene travels in — pan, not cut
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
        whisper: streetWhisper,
        streetFx,
        sceneDay: noteSceneDay,
        onTool: () => {
          localStorage.removeItem(CH1_SAVE_KEY); // chapter closed — the run is done
          document.dispatchEvent(new CustomEvent("lm:chapter-done", { detail: 1 }));
        },
        // "Start the week over" on the resume screen — same semantics as the
        // finale's restart: this run's ledger, save and street counters go,
        // the Shark gets another pass (prologue is per-run).
        onRestart: () => {
          ledger = new DecisionLedger();
          saveLedger();
          localStorage.removeItem(CH1_SAVE_KEY);
          streetSession.deferrals = 0;
          streetSession.billSkipped = 0;
          streetSession.collected = 0;
          streetSession.lateFees = 0;
          streetSession.streetTake = 0;
          streetSession.held = 0;
          renderStreet();
          beginChapter(1);
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
        entries: () => ledger.all(),
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
      entries: () => ledger.all(),
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
  scoreBed(bus, musicHandle);
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
  // The counter rail: a wooden edge the street's books sit on. Rendered
  // inside the sticky slot by renderStreet (row + rail, in that order).
  counterRail = document.createElement("div");
  counterRail.id = "counter-rail"; // not aria-hidden: it carries the Details toggle
  streetSlot.append(counterRail); // in-DOM before renderStreet so street.ts can find it
  renderStreet();

  // The stallholder "actor" line — the street's character who steps up when
  // one of their stalls lights on the player's own choice. Cleared on every
  // chapter change so a leftover figure never carries into the next scene.
  const actorSlot = document.createElement("div");
  actorSlot.id = "street-actor";
  game.append(actorSlot);

  // The street whisper — one line of world-texture under the stalls,
  // fed by chapters (ch1 sets one per day). Empty until first use.
  const whisperEl = document.createElement("div");
  whisperEl.id = "street-whisper";
  whisperEl.className = "lm-street-whisper";
  game.insertBefore(whisperEl, actorSlot);

  // The honesty mark, once, always on screen — so the cards don't have to
  // keep re-litigating "fictional · indicative" on every beat. The audit
  // page is the proof; this is the label the rails ask for.
  const fictionMark = document.createElement("p");
  fictionMark.className = "lm-fiction-mark";
  fictionMark.textContent = "Fictional figures · indicative · arithmetic audited in public";
  game.append(fictionMark);

  // Market-bg parallax — the backdrop drifts a few px against the pointer.
  // Fine pointers only, never under reduced motion; CSS owns the smoothing.
  const bg = document.getElementById("market-bg");
  if (bg && window.matchMedia("(pointer: fine)").matches && !calmMotion()) {
    window.addEventListener("pointermove", (e) => {
      const x = (e.clientX / window.innerWidth - 0.5) * 14;
      const y = (e.clientY / window.innerHeight - 0.5) * 10;
      // Deadzone (Phaser follow-with-deadzone): sub-4px offsets do nothing —
      // the backdrop must not "swim" when the pointer is nearly still.
      if (Math.abs(x) < 4 && Math.abs(y) < 3) return;
      bg.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) scale(1.06)`;
    });
  }

  document.addEventListener("lm:chapter-done", (ev) => {
    const n = (ev as CustomEvent<number>).detail as 1 | 2 | 3;
    actorSlot.replaceChildren();
    if (n === 3) return finale();
    beginChapter((n + 1) as 2 | 3);
  });

  // The keyboard is a first-class way to play: 1–3 pick, Enter continues.
  installChoiceKeys(game);

  // Camera: ambient drift for the whole run (killed under reduced motion).
  camera.idle(true);

  // Till inspection — OpenTTD's cost-estimation pattern: hover/focus the
  // till and its real breakdown appears. Delegated, so chapter re-renders
  // never need rewiring.
  const tillTip = document.createElement("div");
  tillTip.id = "till-tip";
  tillTip.className = "lm-till-tip";
  tillTip.hidden = true;
  tillTip.setAttribute("role", "status");
  game.append(tillTip);
  const showTillTip = (till: HTMLElement): void => {
    const c = streetCounters();
    tillTip.innerHTML = "";
    const lines = [
      ["Shed while invoices sat", c.streetTake],
      ["Late charges on skipped bills", c.lateFees ?? 0],
      ["Fees to stallholders", c.npcFees ?? 0],
    ] as const;
    for (const [label, v] of lines) {
      if (!v) continue;
      const row = document.createElement("span");
      row.className = "lm-till-tip-line";
      row.textContent = `${label} — ${money(v, 0)}`;
      tillTip.append(row);
    }
    const total = document.createElement("span");
    total.className = "lm-till-tip-line lm-till-tip-total";
    total.textContent = `To the street — ${money(c.toStreet, 0)}`;
    tillTip.append(total);
    const r = till.getBoundingClientRect();
    tillTip.style.left = `${Math.min(r.left, window.innerWidth - 240)}px`;
    tillTip.style.top = `${r.bottom + 8}px`;
    tillTip.hidden = false;
  };
  game.addEventListener("mouseover", (e) => {
    const t = (e.target as HTMLElement).closest?.(".lm-till, .lm-stall-chrome-till");
    if (t instanceof HTMLElement) showTillTip(t);
  });
  game.addEventListener("focusin", (e) => {
    const t = (e.target as HTMLElement).closest?.(".lm-till, .lm-stall-chrome-till");
    if (t instanceof HTMLElement) showTillTip(t);
  });
  const hideTillTip = (e: Event): void => {
    const t = (e.target as HTMLElement).closest?.(".lm-till, .lm-stall-chrome-till");
    if (!(t instanceof HTMLElement)) return;
    const next = (e as MouseEvent).relatedTarget as HTMLElement | null;
    if (next?.closest?.(".lm-till-tip, .lm-till, .lm-stall-chrome-till")) return;
    tillTip.hidden = true;
  };
  game.addEventListener("mouseout", hideTillTip);
  game.addEventListener("focusout", hideTillTip);

  // Dev/trailer jump: ?ch=2 starts mid-board without the 20-day replay.
  const jump = Number(new URLSearchParams(location.search).get("ch") ?? 1);
  const chapter = ([1, 2, 3].includes(jump) ? jump : 1) || 1;

  // First minute is one scene: cold open (film + story) first, market pick
  // after. Default UK; Souq offered as a line inside the story card.
  // Skipped for returning players, deep links, mid-run (remedy must not yank a saved week).
  const fresh = chapter === 1 && loadCh1Save() === null && ledger.all().length === 0;
  if (fresh) {
    playCinematic(() => showStoryCard(() => {
      if (shouldOfferMarketPick()) showMarketPick(() => beginChapter(1));
      else beginChapter(1);
    }));
    return;
  }
  beginChapter(chapter as 1 | 2 | 3);
}

const MARKET_PICKED_KEY = "lm.market.picked";

function marketExplicitlyChosen(): boolean {
  try { return localStorage.getItem(MARKET_PICKED_KEY) === "1"; } catch { return false; }
}

function markMarketPicked(): void {
  try { localStorage.setItem(MARKET_PICKED_KEY, "1"); } catch { /* private-mode */ }
}

function shouldOfferMarketPick(): boolean {
  const params = new URLSearchParams(location.search);
  if (params.has("market") || params.has("ch")) return false; // deep links resolve silently
  if (marketExplicitlyChosen()) return false;
  if (loadCh1Save() !== null) return false; // mid-run
  if (ledger.all().length > 0) return false; // a run exists — even a finished one
  return true;
}

/**
 * The market choice as a beat: two cards, the instruments in plain words,
 * and the Souq path surfaces its Arabic name before the shutters open.
 * Routes through the same setMarketMode + purgeSave path as the title
 * radio, so a pick can never leave a UK ledger under souq rules.
 */
function showMarketPick(onDone: () => void): void {
  const sec = document.createElement("section");
  sec.className = "lm-chapter";
  sec.id = "market-pick";
  stageAppend(sec);

  const enter = (mode: MarketMode): void => {
    markMarketPicked();
    if (mode !== getMarketMode()) {
      setMarketMode(mode);
      purgeSave(); // numbers from the other remedy don't carry
    }
    sec.remove();
    // The cold open has ALREADY played (the film and the story card come
    // before this pick — the first minute is one scene). Replaying them here
    // showed the player the whole intro twice; the pick now steps straight
    // into the street. The souq keeps its own bilingual title card, because
    // that card IS its remedy statement.
    if (mode === "souq") souqTitleCard(() => onDone());
    else onDone();
  };

  const souqBeat = (): void => {
    // Commit the mode as the beat opens so every figure on it already reads
    // in dirhams — the preview must not lie about the instrument.
    setMarketMode("souq");
    clear(sec);
    sec.append(
      el("h3", { text: SOUQ_AR.marketName }),
      el("p", {
        class: "lm-line souq-ar",
        text: `${SOUQ_AR.marketName} — ${SOUQ_AR.marketNameGloss}. ${SOUQ_AR.zakat} on what you're still owed.`,
      }),
      el("p", {
        class: "lm-hint",
        text: `${SOUQ_AR.remedyTitle} — the fee is the one you wrote into your own terms. No interest anywhere: the instrument is a contractual charge, agreed on day one.`,
      }),
      el("div", { class: "lm-choices" },
        choiceButton("Open the shutters", `Day 1 of ${CH1_DAYS} · till ${money(1200)}`, () => enter("souq")),
      ),
    );
    // The picker beat voiced in Arabic — the bubble IS the display text,
    // so the manifest key and karaoke stay byte-identical.
    say("siki", SOUQ_VO.picker);
  };

  const marketCards = (): HTMLButtonElement[] => {
    const mk = (label: string, detail: string, cls: string, art: string, fn: () => void): HTMLButtonElement => {
      const c = choiceButton(label, detail, fn);
      c.classList.add(cls);
      const txt = el("span", { class: "lm-choice-text" });
      for (const k of [...c.children]) txt.append(k);
      c.append(txt);
      c.prepend(el("img", { class: "lm-market-art", src: art, alt: "" }));
      return c;
    };
    return [
      mk(`${SOUQ_AR.londonName} — London`, "Pounds · the lawful price of lateness: £40 fixed plus base + 8%", "lm-market-uk", "/assets/sprites/awning.png", () => enter("uk")),
      mk(`${SOUQ_AR.marketName} — The Souq`, "Dirhams · the fee is the one you wrote into your own terms · Arabic throughout", "lm-market-souq", "/assets/sprites/cart.png", souqBeat),
    ];
  };

  sec.append(
    el("h3", { text: "Where do your books live?" }),
    el("p", { class: "lm-hint", text: "Same sums. Different street rules." }),
    el("div", { class: "lm-choices lm-market-cards" }, ...marketCards()),
  );
}

/**
 * The title→Ch.1 bridge: the moonrise cinematic, muted and skippable —
 * and NARRATED. Siki's baked intro line plays over the film as a karaoke
 * subtitle; the cut is 8s and the take ~11s, so the bridge holds on the
 * last frame until the line lands. This is the game's verbal + visual
 * intro, and it ends in the Siki story card.
 *
 * prefers-reduced-motion gets the poster card and an explicit Begin — the
 * film never plays for them; the story card carries the intro in text.
 * A missing/failed asset falls through to onDone so the game can never be
 * blocked by the bridge.
 */
/** The narrated intro line — baked for both markets. The manifest key is
 * the display text byte-for-byte (do not reword without re-baking). */
const INTRO_LINE = {
  uk: "I'm Siki — I keep your books. That's Zana — she chases what's owed. £2,400 of yours is already sleeping out on that street.",
  souq: "I'm Siki — I keep your books. That's Zana — she chases what's owed. AED 11,520 of yours is already sleeping out on that street.",
} as const;

/** Zana's card line — her own voice on the story card (the card is
 * player-paced reading time, so the take adds no wall-clock to the intro).
 * Same rule: byte-for-byte with the manifest key; re-bake if reworded. */
const INTRO_ZANA = "I'm Zana. You point, I chase. First one's Harborne — say the word.";

function playCinematic(onDone: () => void): void {
  // The Souq gets its own cut and its own take — same grammar, sandstone
  // and brass. Mode is committed before the bridge runs, so it never lies.
  const souq = getMarketMode() === "souq";
  const film = souq ? "cinematic-souq" : "cinematic";
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  // Replay affordance (best practice: force once, never again, never
  // silently): a returning player's skip says what it skips, so the intro
  // never feels like a wall. Counted at mount — skipping at 1s still
  // counts as having met the beat.
  const replay = introSeenCount() > 0;
  markIntroSeen();
  const wrap = el("div", { class: "lm-cine" });
  let done = false;
  let filmDone = false;
  let voiceDone = false;
  const finish = (): void => {
    if (done) return;
    done = true;
    document.removeEventListener("keydown", onKeySkip); // the Esc hatch goes with the overlay
    voice.stop(); // skipping the intro skips the voice too
    wrap.remove();
    onDone();
  };
  // Esc skips — quiet, deliberate, and not a gameplay key. Nothing is
  // auto-focused on the film path: a stray Enter (the player just pressed
  // it on Begin) must not kill the intro before it starts.
  const onKeySkip = (e: KeyboardEvent): void => { if (e.key === "Escape") finish(); };
  document.addEventListener("keydown", onKeySkip);
  const settle = (): void => { if (filmDone && voiceDone) finish(); };
  const skip = el("button", {
    class: "lm-cine-skip", type: "button",
    text: reduced ? "Begin ›" : replay ? "Skip intro ›" : "Skip ›",
  });
  skip.addEventListener("click", finish);
  if (reduced) {
    wrap.append(
      el("img", { class: "lm-cine-poster", src: `cinematic/${film}-poster.jpg`, alt: "" }),
      skip,
    );
    document.body.append(wrap);
    skip.focus(); // here the button IS the action; Enter must work
    return;
  }
  const video = el("video", {
    class: "lm-cine-video",
    src: `cinematic/${film}.mp4`,
    poster: `cinematic/${film}-poster.jpg`,
    autoplay: true, muted: true, playsinline: true, preload: "auto",
  });
  video.muted = true;
  video.defaultMuted = true;
  // The film's last frame holds while Siki finishes the line — the tail
  // of the intro, not a freeze: the karaoke is still moving.
  video.addEventListener("ended", () => { filmDone = true; settle(); });
  video.addEventListener("error", () => { filmDone = true; settle(); });
  const lineText = souq ? INTRO_LINE.souq : INTRO_LINE.uk;
  const sub = speakerPara("siki", lineText);
  sub.classList.add("lm-cine-sub");
  wrap.append(video, sub, skip);
  document.body.append(wrap);
  void video.play().catch(() => { filmDone = true; settle(); });
  // Karaoke rides the timing file; the text always lands.
  const lineNode = sub.querySelector<HTMLElement>(".lm-line-text");
  if (lineNode) void voice.speak("siki", lineText, lineNode, () => { voiceDone = true; settle(); });
  else { voiceDone = true; settle(); }
}

/**
 * One story card after the narrated cinematic: the intro's last beat —
 * Siki has just spoken over the film; this card is the stakes in writing,
 * and Zana introduces HERSELF in her own voice (her take plays during the
 * player's reading time — no wall-clock cost, and clicking through into
 * the street hands the stage to the Shark, cutting her off cleanly).
 * Relatable by design (the jam's brief: everyday money decisions): work
 * done, invoice sent, money still waiting.
 */
function showStoryCard(onDone: () => void): void {
  const wrap = el("div", { class: "lm-welcome" });
  const card = el("div", { class: "lm-welcome-card", role: "dialog", "aria-label": "The Late Market" });
  const face = document.createElement("img");
  face.className = "lm-welcome-face";
  face.src = "assets/sprites/siki.png";
  face.alt = "Siki the owl bookkeeper";
  face.width = 112;
  face.height = 112;
  // Zana speaks for herself: her bubble rides the card, karaoke and all.
  const zana = speakerPara("zana", INTRO_ZANA);
  card.append(
    face,
    el("h3", { text: "One stall. Three days." }),
    el("p", {
      class: "lm-line-text",
      text: `You did the work. The invoices went out weeks ago. The money is still out there — ${money(2400, 0)} nobody has paid — and every day it waits, the street takes a little more of it.`,
    }),
    el("p", {
      class: "lm-hint",
      text: "Siki keeps your books — she explains what every choice costs. Leave an invoice out there, and a stall lights.",
    }),
    zana,
    el("div", { class: "lm-choices" },
      choiceButton("Step into the street", "The Shark walks past before the shutters open", () => {
        wrap.remove();
        onDone();
      }),
    ),
  );
  wrap.append(card);
  document.body.append(wrap);
  wrap.querySelector<HTMLButtonElement>(".lm-choice")?.focus();
  const zanaLine = zana.querySelector<HTMLElement>(".lm-line-text");
  if (zanaLine) void voice.speak("zana", INTRO_ZANA, zanaLine);
}

/**
 * The Souq path's bilingual title card — the beat souq_intro was written
 * for ("plays over the bilingual title card"). Static content, so
 * reduced-motion players get it too: it's a story beat, not motion.
 */
function souqTitleCard(onDone: () => void): void {
  const sec = document.createElement("section");
  sec.className = "lm-chapter";
  sec.id = "souq-title";
  stageAppend(sec);
  sec.append(
    el("h3", { class: "souq-ar", text: `${SOUQ_AR.marketName} · The Late Market` }),
    el("p", {
      class: "lm-hint souq-ar",
      text: `${SOUQ_AR.remedyTitle} — ${SOUQ_AR.zakat} on what you're still owed. The fee is the one you wrote into your own terms.`,
    }),
    el("div", { class: "lm-choices" },
      choiceButton("Open the shutters", `Day 1 of ${CH1_DAYS} · till ${money(1200)}`, () => {
        sec.remove();
        onDone();
      }),
    ),
  );
  say("siki", SOUQ_VO.intro);
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
    stageAppend(review);
  }
  for (const s of game.querySelectorAll("section.lm-chapter")) (s as HTMLElement).hidden = s.id !== "finale";
  // The finale is the street's payoff — release the one-viewport compaction
  // so the market reads at full size.
  document.getElementById("street-slot")?.classList.remove("lm-street-compact");
  chapterSting("finale");
  noteSceneDay(4); // market close — the grade warms to dawn
  setProgress("Market close", 3);
  runFinale({
    root: review,
    say,
    view,
    entries: () => ledger.all(),
    street: streetCounters(),
    delta,
    onSecondWeek: beginSecondWeek,
    onRestart: () => {
      ledger = new DecisionLedger();
      saveLedger();
      localStorage.removeItem(CH1_SAVE_KEY);
      streetSession.deferrals = 0;
      streetSession.billSkipped = 0;
      streetSession.collected = 0;
      streetSession.lateFees = 0;
      streetSession.streetTake = 0;
      streetSession.held = 0;
      renderStreet();
      beginChapter(1);
    },
  });

  // The money shot: settle → flash → shake, then every lit stall emits
  // its cost in sequence — the street's whole week made visible at once.
  const litRects = Array.from(document.querySelectorAll<HTMLElement>(".lm-stall.lit"))
    .map((s) => s.getBoundingClientRect());
  void sequence([
    () => camera.settle(),
    () => camera.flash(),
  ]).then(() => {
    camera.shake(3);
    litRects.forEach((r, i) => {
      window.setTimeout(() => burst({ shape: "coin", count: 10, origin: r }), i * 90);
    });
  });
}

/**
 * The Second Week — the scored procedural replay dealt from the finale.
 * Fresh invoices, one score (what the street took), best-run kept. No
 * DecisionLedger writes: this is practice, not the experiment, and the
 * street strip keeps its cumulative memory — the stalls you lit stay lit.
 */
function beginSecondWeek(): void {
  const sec = document.querySelector<HTMLElement>("#week2") ?? (() => {
    const r = document.createElement("section");
    r.className = "lm-chapter";
    r.id = "week2";
    stageAppend(r);
    return r;
  })();
  for (const s of game.querySelectorAll("section.lm-chapter")) (s as HTMLElement).hidden = s.id !== "week2";
  // Second-week beats are decisions again — one-viewport compaction back on.
  // The finale hid the persistent strip (its market close rendered the
  // street in its own stage); the second week needs the strip back.
  document.getElementById("street-slot")?.classList.remove("lm-street-hidden");
  document.getElementById("street-slot")?.classList.add("lm-street-compact");
  sec.classList.add("lm-beat-compact");
  setProgress("The second week", 3);
  // A stored mid-run week resumes; a finished one re-deals from scratch.
  let saved: Week2State | null = null;
  try {
    const raw = localStorage.getItem(WEEK2_KEY);
    if (raw) {
      const s = JSON.parse(raw) as Week2State;
      if (s && typeof s.day === "number" && Array.isArray(s.invoices) && !s.done) saved = s;
    }
  } catch { /* corrupt or private-mode: a fresh deal is fine */ }
  runSecondWeek(
    {
      root: sec,
      say,
      noteStreet,
      save: (s) => { try { localStorage.setItem(WEEK2_KEY, JSON.stringify(s)); } catch { /* private-mode */ } },
      onDone: () => {
        try { localStorage.removeItem(WEEK2_KEY); } catch { /* private-mode */ }
        window.location.reload(); // the read-back closed — back to the title
      },
    },
    // Every visit deals a different week: the point of the score is that
    // the week is not memorised. (Tests deal fixed seeds; play does not.)
    (Date.now() % 2147483646) | 0,
    saved,
  );
}

// ── Market picker (title screen) ──
for (const radio of document.querySelectorAll<HTMLInputElement>('input[name="market"]')) {
  radio.checked = radio.value === getMarketMode();
  radio.addEventListener("change", () => {
    if (!radio.checked) return;
    const next = radio.value as MarketMode;
    if (next === getMarketMode()) return;
    // No markMarketPicked here: this is a default-market setting, not the
    // canonical pick — first-run players still get the painted door cards.
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
  if (!prefs.sound) { bus.silence(); voice.stop(); bedsStarted = false; musicHandle = null; scoreBed(bus, null); }
  else void startBeds();
});
optMusic?.addEventListener("change", () => {
  prefs.music = optMusic.checked;
  savePrefs();
  if (!prefs.music) { musicHandle?.stop(); musicHandle = null; }
  else if (bus.unlocked && prefs.sound) void bus.play("audio/sfx/market_music.mp3", { channel: "music", loop: true }).then((h) => { musicHandle = h; scoreBed(bus, h); });
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

// Zana's clock — timed key decisions (opt-out: countdowns stress some
// players; the game must stay playable with the clock off).
const optClock = document.getElementById("opt-gutclock") as HTMLInputElement | null;
if (optClock) optClock.checked = gutClockEnabled();
optClock?.addEventListener("change", () => setGutClockEnabled(optClock.checked));

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
