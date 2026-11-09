/**
 * Web Audio bus — unlock-once pattern (GDD App.B/C).
 * Three groups: dialogue, music, ambience/SFX. Ducking to come with frames.
 * Absolutely no runtime network fetching for audio with shipped keys — all assets pre-baked.
 */
export class AudioBus {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;

  /** Must be called inside a user-gesture handler. */
  unlock(): void {
    if (!this.ctx) {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = 1;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") void this.ctx.resume().catch(() => undefined);
  }

  get unlocked(): boolean {
    return this.ctx?.state === "running";
  }

  setVolume(v: number): void {
    if (this.master) this.master.gain.value = Math.max(0, Math.min(1, v));
  }

  dispose(): void {
    void this.ctx?.close().catch(() => undefined);
    this.ctx = null;
    this.master = null;
  }
}
