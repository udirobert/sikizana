/**
 * Pre-baked dialogue playback (docs/game/VOICE_PIPELINE.md §4/§5).
 * The client ships {audio, timing.json} pairs and a manifest keyed by the
 * exact display text passed to say(). No API keys, no runtime TTS — the
 * manifest is the versioned performance bible, baked by scripts/bake-voices.mjs.
 */

/** Full cast: the two narrators plus the three stallholders, who double
 *  the narrators' base voices at a shifted rate (small-cast audio drama —
 *  the Collector IS Zana's voice; the Factor and the Shark share Siki's
 *  workspace voice, pitched apart so they never blur). */
export type Speaker = "siki" | "zana" | "factor" | "collector" | "shark";

export interface VoiceLine {
  id: string;
  speaker: Speaker;
  audio: string;
  timing: string;
  /** Playback rate that shaped the take's character (1 = as baked). */
  rate?: number;
}

export interface VoiceManifest {
  generated_at: string;
  model_id: string;
  dictionary_version: string;
  voices: Record<string, string>;
  /** Key = normalized display text (whitespace-collapsed, trimmed). */
  lines: Record<string, VoiceLine>;
}

export interface WordSpan {
  word: string;
  start: number;
  end: number;
  /** char offset of word start within the spoken text */
  charStart: number;
  charEnd: number;
}

interface TimingFile {
  characters: string[];
  start_times_seconds: number[];
  end_times_seconds: number[];
}

/** Same normalization the bake script uses for manifest keys. */
export function normalizeSpokenText(s: string): string {
  return s.trim().replace(/\s+/g, " ");
}

/** Group the char-level alignment into word spans (first-char start → last-char end). */
export function wordSpans(t: TimingFile): WordSpan[] {
  const spans: WordSpan[] = [];
  let cur: { chars: string[]; start: number; end: number; charStart: number } | null = null;
  const flush = () => {
    if (cur) {
      spans.push({
        word: cur.chars.join(""),
        start: cur.start,
        end: cur.end,
        charStart: cur.charStart,
        charEnd: cur.charStart + cur.chars.length - 1,
      });
      cur = null;
    }
  };
  t.characters.forEach((ch, i) => {
    if (/\s/.test(ch)) { flush(); return; }
    if (!cur) cur = { chars: [], start: t.start_times_seconds[i] ?? 0, end: 0, charStart: i };
    cur.chars.push(ch);
    cur.end = t.end_times_seconds[i] ?? cur.end;
  });
  flush();
  return spans;
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export class VoicePlayer {
  private manifestPromise: Promise<VoiceManifest | null> | null = null;
  private audio: HTMLAudioElement | null = null;
  private timing: TimingFile | null = null;
  private spans: WordSpan[] = [];
  private bubble: HTMLElement | null = null;
  private displayText = "";
  private highlightRaf = 0;

  constructor(private isEnabled: () => boolean) {}

  private loadManifest(): Promise<VoiceManifest | null> {
    if (!this.manifestPromise) {
      this.manifestPromise = fetch("audio/manifest.json")
        .then((r) => (r.ok ? (r.json() as Promise<VoiceManifest>) : null))
        .catch(() => null);
    }
    return this.manifestPromise;
  }

  /** Stop whatever is playing and clear highlighting. Safe to call anytime. */
  stop(): void {
    if (this.audio) {
      this.audio.pause();
      this.audio = null;
    }
    this.timing = null;
    this.spans = [];
    this.bubble = null;
    this.displayText = "";
    if (this.highlightRaf) cancelAnimationFrame(this.highlightRaf);
    this.highlightRaf = 0;
  }

  /**
   * Speak a line if a baked take exists and audio is enabled.
   * `bubble` is the DOM node that received the display text — word-level
   * karaoke highlighting is applied to it from the timing file.
   */
  async speak(speaker: Speaker, text: string, bubble: HTMLElement): Promise<void> {
    this.stop();
    if (!this.isEnabled()) return;
    const manifest = await this.loadManifest();
    const line = manifest?.lines[normalizeSpokenText(text)];
    if (!line || line.speaker !== speaker) return;

    try {
      const timingRes = await fetch(line.timing);
      if (!timingRes.ok) return;
      this.timing = (await timingRes.json()) as TimingFile;
      // Highlight only when the alignment's char stream is the display text
      // verbatim (true in v1 — no acting tags). Otherwise play silently-correct.
      const spoken = (this.timing.characters ?? []).join("");
      this.spans = spoken === text ? wordSpans(this.timing) : [];
    } catch {
      this.timing = null;
      this.spans = [];
    }

    const audio = new Audio(line.audio);
    audio.preload = "auto";
    // NPC character rate: the take was baked on a narrator's base voice and
    // is performed slower/deeper. Timing files index the MEDIA timeline, so
    // karaoke highlighting stays aligned at any rate.
    if (line.rate && line.rate !== 1) audio.playbackRate = line.rate;
    this.audio = audio;
    this.bubble = bubble;
    this.displayText = text;

    audio.addEventListener("timeupdate", () => this.scheduleHighlight());
    audio.addEventListener("ended", () => this.stop());
    void audio.play().catch(() => this.stop());
  }

  private scheduleHighlight(): void {
    if (this.highlightRaf || !this.audio || !this.bubble) return;
    this.highlightRaf = requestAnimationFrame(() => {
      this.highlightRaf = 0;
      this.applyHighlight(this.audio?.currentTime ?? 0);
    });
  }

  private applyHighlight(t: number): void {
    if (!this.bubble || !this.spans.length) return;
    // Active word = last span whose start <= t (lines are short; linear scan fine).
    let active = -1;
    for (let i = 0; i < this.spans.length; i++) {
      const span = this.spans[i];
      if (span && span.start <= t + 0.05) active = i;
      else break;
    }
    // Rebuild the bubble as escaped text with the active word wrapped.
    // Spans carry charStart/charEnd into the SPOKEN text; spoken == display
    // in v1 (no acting tags), so offsets index displayText directly.
    let html = "";
    let cursor = 0;
    for (let i = 0; i < this.spans.length; i++) {
      const s = this.spans[i];
      if (!s) continue;
      if (s.charStart > cursor) html += escapeHtml(this.displayText.slice(cursor, s.charStart));
      const word = escapeHtml(this.displayText.slice(s.charStart, s.charEnd + 1));
      html += i === active ? `<span class="lm-word-active">${word}</span>` : word;
      cursor = s.charEnd + 1;
    }
    if (cursor < this.displayText.length) html += escapeHtml(this.displayText.slice(cursor));
    // Only touch the DOM when the active index actually changed.
    const prev = Number(this.bubble.dataset.wordIdx ?? -1);
    if (prev !== active) {
      this.bubble.dataset.wordIdx = String(active);
      this.bubble.innerHTML = html;
    }
  }
}
