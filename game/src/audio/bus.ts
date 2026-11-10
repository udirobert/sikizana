/**
 * Web Audio bus — unlock-once pattern (GDD App.B/C).
 * Channels: music / ambience / sfx → master. Dialogue (VoicePlayer) is a
 * separate HTMLAudio path gated by the same unlock + mute prefs.
 * All assets are pre-baked local files — no runtime network fetching for
 * audio with shipped keys.
 */
export type BusChannel = "music" | "ambience" | "sfx";

export interface PlayHandle {
  stop(): void;
  setVolume(v: number): void;
}

const CHANNEL_VOLUME: Record<BusChannel, number> = {
  music: 0.22,
  ambience: 0.35,
  sfx: 0.9,
};

export class AudioBus {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private channels: Record<BusChannel, GainNode> | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private live = new Set<AudioBufferSourceNode>();

  /** Must be called inside a user-gesture handler. */
  unlock(): void {
    if (!this.ctx) {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = 1;
      this.master.connect(this.ctx.destination);
      this.channels = {
        music: this.ctx.createGain(),
        ambience: this.ctx.createGain(),
        sfx: this.ctx.createGain(),
      };
      for (const g of Object.values(this.channels)) {
        g.gain.value = 1;
        g.connect(this.master);
      }
    }
    if (this.ctx.state === "suspended") void this.ctx.resume().catch(() => undefined);
  }

  get unlocked(): boolean {
    return this.ctx?.state === "running";
  }

  setVolume(v: number): void {
    if (this.master) this.master.gain.value = Math.max(0, Math.min(1, v));
  }

  /** Fetch + decode once, cached for the session. */
  private async buffer(url: string): Promise<AudioBuffer | null> {
    const hit = this.buffers.get(url);
    if (hit) return hit;
    if (!this.ctx) return null;
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      const buf = await this.ctx.decodeAudioData(await res.arrayBuffer());
      this.buffers.set(url, buf);
      return buf;
    } catch {
      return null;
    }
  }

  /**
   * Play a baked asset on a channel. `loop` for beds; one-shots auto-clean.
   * Returns null when the bus isn't unlocked or the asset is missing.
   */
  async play(url: string, opts: { channel?: BusChannel; loop?: boolean; volume?: number } = {}): Promise<PlayHandle | null> {
    const channel = opts.channel ?? "sfx";
    if (!this.ctx || !this.channels || this.ctx.state !== "running") return null;
    const buf = await this.buffer(url);
    if (!buf || !this.channels) return null;

    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = opts.loop ?? false;
    const gain = this.ctx.createGain();
    gain.gain.value = (opts.volume ?? 1) * CHANNEL_VOLUME[channel];
    src.connect(gain);
    gain.connect(this.channels[channel]);
    src.onended = () => { this.live.delete(src); };
    this.live.add(src);
    src.start();
    return {
      stop: () => { try { src.stop(); } catch { /* already ended */ } this.live.delete(src); },
      setVolume: (v: number) => { gain.gain.value = Math.max(0, Math.min(1, v)) * CHANNEL_VOLUME[channel]; },
    };
  }

  /** Convenience: fire-and-forget one-shot. */
  playOnce(url: string, volume = 1): void {
    void this.play(url, { channel: "sfx", volume }).catch(() => undefined);
  }

  /** Silence everything immediately (mute toggle). */
  silence(): void {
    for (const src of this.live) { try { src.stop(); } catch { /* noop */ } }
    this.live.clear();
  }

  dispose(): void {
    this.silence();
    void this.ctx?.close().catch(() => undefined);
    this.ctx = null;
    this.master = null;
    this.channels = null;
  }
}
