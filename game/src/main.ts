/**
 * The Late Market — entry point.
 * Boot order: title flow → Web Audio unlock gesture → chapters 1→2→3.
 * All persistence is localStorage-only (privacy rails, docs/game/GDD.md):
 * the decision ledger + street counters live in the browser, clearable from
 * the title screen, never transmitted anywhere.
 */
import "./styles/tokens.css";
import { AudioBus, type PlayHandle } from "./audio/bus";
import { VoicePlayer } from "./audio/voice";
import { DecisionLedger } from "./engine/ledger";
import { runChapter1 } from "./chapters/ch1screen";
import type { Ch1State } from "./chapters/ch1";
import { runChapter2 } from "./chapters/ch2screen";
import { runChapter3 } from "./chapters/ch3screen";
import { buildFinaleView } from "./chapters/finale";
import { runFinale } from "./chapters/finaleScreen";
import { renderStreet as renderStreetRow, type StreetCounters } from "./ui/street";
import type { LedgerEntry } from "./engine/ledger";
import { setSimpleLanguage } from "./i18n";

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
function say(speaker: "siki" | "zana", text: string): void {
  const sections = Array.from(game.querySelectorAll(":scope > section.lm-chapter")) as HTMLElement[];
  const active = sections.length ? sections[sections.length - 1]! : game;
  for (const old of Array.from(active.querySelectorAll(":scope > p.lm-line"))) old.remove();
  const bubble = document.createElement("p");
  bubble.className = `lm-line ${speaker}`;
  bubble.textContent = text;
  bubble.setAttribute("role", "note");
  active.prepend(bubble);
  sting(speaker);
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
const streetSession = { deferrals: 0, billSkipped: 0, collected: 0, lateFees: 0 };

function streetCounters(): StreetCounters {
  const all = ledger.all();
  let npcFees = 0;
  for (const e of all) if (e.npc?.feePaid) npcFees += e.npc.feePaid;
  return {
    toStreet: npcFees + streetSession.lateFees,
    deferrals: streetSession.deferrals,
    collected: streetSession.collected,
    billSkipped: streetSession.billSkipped,
  };
}

/** Chapter-1 driver reports street-moving events that have no ledger entry. */
function noteStreet(ev: { deferral?: boolean; billSkipped?: boolean; collected?: number; lateFee?: number }): void {
  if (ev.deferral) streetSession.deferrals += 1;
  if (ev.billSkipped) streetSession.billSkipped += 1;
  if (ev.collected) streetSession.collected += ev.collected;
  if (ev.lateFee) streetSession.lateFees += ev.lateFee;
  renderStreet();
}

let prevLit = -1;
function renderStreet(): void {
  const slot = document.getElementById("street-slot");
  if (!slot) return;
  const counters = streetCounters();
  const row = renderStreetRow(counters);
  // The stall that just changed flares once (recovery plan §3: the street
  // changes *when* you leave it — the player should see the stall move).
  if (prevLit >= 0) {
    const litCount = row.querySelectorAll(".lm-stall.lit").length;
    if (litCount !== prevLit) {
      const stalls = row.querySelectorAll(".lm-stall");
      const idx = Math.min(litCount, stalls.length) - 1; // the one that just changed
      (stalls[Math.max(0, idx)] as HTMLElement | undefined)?.classList.add("lm-stall-change");
    }
  }
  prevLit = row.querySelectorAll(".lm-stall.lit").length;
  slot.replaceChildren(row);
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

  // Persistent street strip sits above whatever chapter is running.
  const streetSlot = document.createElement("div");
  streetSlot.id = "street-slot";
  game.append(streetSlot);
  renderStreet();

  document.addEventListener("lm:chapter-done", (ev) => {
    const n = (ev as CustomEvent<number>).detail as 1 | 2 | 3;
    if (n === 3) return finale();
    beginChapter((n + 1) as 2 | 3);
  });

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
  if (!view.partial && (!prev || score < prev.score)) {
    saveBestProfile({ score, ...view.profile, at: new Date().toISOString() });
  }

  let review = document.getElementById("finale") as HTMLElement | null;
  if (!review) {
    review = document.createElement("section");
    review.id = "finale";
    review.className = "lm-chapter"; // hidden automatically by beginChapter
    game.append(review);
  }
  for (const s of game.querySelectorAll("section.lm-chapter")) (s as HTMLElement).hidden = s.id !== "finale";
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
      renderStreet();
      beginChapter(1);
    },
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

// UI confirm blip on every choice click (delegated — covers all chapters).
game.addEventListener("click", (ev) => {
  if ((ev.target as HTMLElement).closest(".lm-choice")) bus.playOnce("audio/sfx/ui_confirm.mp3", 0.7);
});

export {};
