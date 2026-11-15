/**
 * Zana's clock contract: the pref defaults on and round-trips, private
 * mode never crashes anything, the telemetry log caps at 20, and the timer
 * fires onTimeout exactly once — never after stop(), with no leaked
 * intervals. Tests run in the default node environment, so a minimal
 * DOM/storage shim stands in for the browser (the component's DOM surface
 * is just createElement/append/className/style/setAttribute).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  gutCalls,
  gutClockEnabled,
  mountGutTimer,
  recordGutCall,
  setGutClockEnabled,
} from "../src/ui/gutTimer";

/* ── Minimal DOM shim (enough for src/ui/dom.ts's el()) ───────────── */

class FakeNode {
  childNodes: FakeNode[] = [];
  parentNode: FakeNode | null = null;
  private text = "";
  constructor(text = "") {
    this.text = text;
  }
  get textContent(): string {
    return this.childNodes.length ? this.childNodes.map((c) => c.textContent).join("") : this.text;
  }
  set textContent(v: string) {
    this.childNodes = [];
    this.text = v;
  }
  append(...nodes: (FakeNode | string)[]): void {
    for (const n of nodes) {
      const node = typeof n === "string" ? new FakeNode(n) : n;
      node.parentNode = this;
      this.childNodes.push(node);
    }
  }
}

class FakeElement extends FakeNode {
  tagName: string;
  className = "";
  attributes: Record<string, string> = {};
  style: Record<string, string> = {};
  constructor(tag: string) {
    super();
    this.tagName = tag;
  }
  setAttribute(k: string, v: string): void {
    this.attributes[k] = String(v);
  }
  getAttribute(k: string): string | null {
    return this.attributes[k] ?? null;
  }
}

const documentShim = {
  createElement: (tag: string) => new FakeElement(tag),
  createTextNode: (t: string) => new FakeNode(t),
};

/** Find the first element whose class list contains `cls`, depth-first. */
function findByClass(root: FakeNode, cls: string): FakeElement | null {
  for (const child of root.childNodes) {
    if (child instanceof FakeElement && child.className.split(/\s+/).includes(cls)) return child;
    const hit = findByClass(child, cls);
    if (hit) return hit;
  }
  return null;
}

/* ── Storage shims ─────────────────────────────────────────────────── */

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => void map.set(k, String(v)),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: () => null,
    get length() {
      return map.size;
    },
  } as Storage;
}

/** Private mode: every access throws. */
function throwingStorage(): Storage {
  const boom = (): never => {
    throw new Error("localStorage is not available");
  };
  return {
    getItem: boom,
    setItem: boom,
    removeItem: boom,
    clear: boom,
    key: boom,
    length: 0,
  } as Storage;
}

/* ── Harness ──────────────────────────────────────────────────────── */

let host: FakeElement;

beforeEach(() => {
  vi.stubGlobal("document", documentShim);
  vi.stubGlobal("Node", FakeNode);
  vi.stubGlobal("localStorage", memoryStorage());
  host = new FakeElement("div");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const opts = (over: Partial<Parameters<typeof mountGutTimer>[1]> = {}) => ({
  seconds: 2,
  label: "Zana's clock",
  calm: false,
  onTimeout: vi.fn(),
  ...over,
});

/* ── Pref: opt-in by default, the choice persists ─────────────────── */

describe("gut clock pref", () => {
  it("defaults to off — the clock observes, it never decides", () => {
    expect(gutClockEnabled()).toBe(false);
  });

  it("round-trips through localStorage as lm.gutclock.v1", () => {
    setGutClockEnabled(false);
    expect(gutClockEnabled()).toBe(false);
    expect(localStorage.getItem("lm.gutclock.v1")).toBe("0");
    setGutClockEnabled(true);
    expect(gutClockEnabled()).toBe(true);
    expect(localStorage.getItem("lm.gutclock.v1")).toBe("1");
  });

  it("stays off if the stored value is garbage (opt-in is explicit)", () => {
    localStorage.setItem("lm.gutclock.v1", "junk");
    expect(gutClockEnabled()).toBe(false);
  });

  it("private mode: reads default to off, writes never throw", () => {
    vi.stubGlobal("localStorage", throwingStorage());
    expect(gutClockEnabled()).toBe(false);
    expect(() => setGutClockEnabled(false)).not.toThrow();
  });
});

/* ── Gut-call telemetry ────────────────────────────────────────────── */

describe("gut call log", () => {
  it("round-trips entries under lm.gut.v1", () => {
    recordGutCall("ch1_d3_defer", "defer", 4.2);
    recordGutCall("ch1_d5_chase", "chase", 1.1);
    const calls = gutCalls();
    expect(calls).toHaveLength(2);
    expect(calls[0]).toMatchObject({ experimentId: "ch1_d3_defer", chosenOptionId: "defer", secondsTaken: 4.2 });
    expect(typeof calls[1]!.at).toBe("string");
  });

  it("caps the log at 20 entries, newest kept", () => {
    for (let i = 0; i < 25; i++) recordGutCall(`e${i}`, `c${i}`, i);
    const calls = gutCalls();
    expect(calls).toHaveLength(20);
    expect(calls[0]!.experimentId).toBe("e5");
    expect(calls[19]!.experimentId).toBe("e24");
  });

  it("returns [] for corrupted JSON instead of throwing", () => {
    localStorage.setItem("lm.gut.v1", "{not json");
    expect(gutCalls()).toEqual([]);
  });

  it("private mode: reads give [], writes never throw", () => {
    vi.stubGlobal("localStorage", throwingStorage());
    expect(gutCalls()).toEqual([]);
    expect(() => recordGutCall("e", "c", 1)).not.toThrow();
  });
});

/* ── The timer itself ──────────────────────────────────────────────── */

describe("mountGutTimer", () => {
  it("fires onTimeout exactly once on expiry, then stops ticking", () => {
    vi.useFakeTimers();
    const o = opts({ seconds: 2 });
    const t = mountGutTimer(host as unknown as HTMLElement, o);
    expect(t.timedOut()).toBe(false);

    vi.advanceTimersByTime(2000);
    expect(o.onTimeout).toHaveBeenCalledTimes(1);
    expect(t.timedOut()).toBe(true);
    expect(vi.getTimerCount()).toBe(0); // the interval cleaned itself up

    vi.advanceTimersByTime(10000);
    t.stop();
    t.stop(); // idempotent
    expect(o.onTimeout).toHaveBeenCalledTimes(1);
  });

  it("never fires after stop(), and leaves no leaked interval", () => {
    vi.useFakeTimers();
    const o = opts({ seconds: 5 });
    const t = mountGutTimer(host as unknown as HTMLElement, o);
    expect(vi.getTimerCount()).toBe(1);

    vi.advanceTimersByTime(1000);
    t.stop();
    t.stop();
    expect(vi.getTimerCount()).toBe(0);
    expect(t.timedOut()).toBe(false);

    vi.advanceTimersByTime(60000);
    expect(o.onTimeout).not.toHaveBeenCalled();
  });

  it("expires immediately for a zero-second clock (still exactly once)", () => {
    vi.useFakeTimers();
    const o = opts({ seconds: 0 });
    const t = mountGutTimer(host as unknown as HTMLElement, o);
    expect(o.onTimeout).toHaveBeenCalledTimes(1);
    expect(t.timedOut()).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("announces 3-2-1 politely, then 'time called'", () => {
    vi.useFakeTimers();
    const o = opts({ seconds: 4 });
    mountGutTimer(host as unknown as HTMLElement, o);
    const root = host.childNodes[0]!;
    const live = findByClass(root, "lm-gut-live")!;
    expect(live.getAttribute("aria-live")).toBe("polite");
    expect(live.textContent).toBe(""); // no chatter above 3

    vi.advanceTimersByTime(1500); // 3 left
    expect(live.textContent).toBe("3");
    vi.advanceTimersByTime(1000);
    expect(live.textContent).toBe("2");
    vi.advanceTimersByTime(1000);
    expect(live.textContent).toBe("1");
    vi.advanceTimersByTime(1000);
    expect(live.textContent).toBe("time called");
    expect(live.textContent).not.toMatch(/4/); // never announced the start
  });

  it("renders the depletion bar and ticks the visible seconds down", () => {
    vi.useFakeTimers();
    mountGutTimer(host as unknown as HTMLElement, opts({ seconds: 3 }));
    const root = host.childNodes[0]!;
    const fill = findByClass(root, "lm-gut-bar-fill")!;
    const secs = findByClass(root, "lm-gut-secs")!;
    expect(secs.getAttribute("aria-hidden")).toBe("true");
    expect(secs.textContent).toBe("3");
    expect(fill.style.width).toBe("100%");

    vi.advanceTimersByTime(1800); // ticks at 200ms steps → 1200ms left = 40% of the bar
    expect(secs.textContent).toBe("2");
    expect(fill.style.width).toBe("40%");
  });

  it("calm mode: static text countdown, no bar, still expires once", () => {
    vi.useFakeTimers();
    const o = opts({ seconds: 4, calm: true });
    mountGutTimer(host as unknown as HTMLElement, o);
    const root = host.childNodes[0] as FakeElement;
    expect(root.className).toContain("lm-gut--calm");
    expect(findByClass(root, "lm-gut-bar")).toBeNull();
    expect(findByClass(root, "lm-gut-bar-fill")).toBeNull();

    const secs = findByClass(root, "lm-gut-secs")!;
    expect(secs.textContent).toBe("4");
    vi.advanceTimersByTime(1500);
    expect(secs.textContent).toBe("3"); // text ticks down, nothing animates

    vi.advanceTimersByTime(2500);
    expect(o.onTimeout).toHaveBeenCalledTimes(1);
    expect(findByClass(root, "lm-gut-label")!.textContent).toContain("time called");
  });

  it("calm mode is also forced by prefers-reduced-motion", () => {
    vi.useFakeTimers();
    vi.stubGlobal("window", {
      matchMedia: (q: string) => ({ matches: q.includes("prefers-reduced-motion"), addEventListener: () => {}, removeEventListener: () => {} }),
    });
    mountGutTimer(host as unknown as HTMLElement, opts({ seconds: 3, calm: false }));
    const root = host.childNodes[0] as FakeElement;
    expect(root.className).toContain("lm-gut--calm");
    expect(findByClass(root, "lm-gut-bar")).toBeNull();
  });

  it("timer has role=timer and never takes focus", () => {
    vi.useFakeTimers();
    mountGutTimer(host as unknown as HTMLElement, opts({ seconds: 3 }));
    const root = host.childNodes[0] as FakeElement;
    expect(root.getAttribute("role")).toBe("timer");
    expect(root.getAttribute("tabindex")).toBe(null);
  });
});
