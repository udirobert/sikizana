/**
 * Choice keys — the game is a sequence of two- and three-button decisions, so
 * the keyboard should be able to play it: 1–9 pick a visible choice, Enter
 * takes a lone one. The keycap is drawn from the same attribute that drives
 * the handler (`data-key`), so what the player sees on a button and what the
 * keyboard does can never disagree.
 *
 * Rules that keep this from surprising anyone:
 *  - never while typing (the floor input is a real input, not a game key),
 *  - never for the finale's outbound door (`<a>`): a stray keypress must not
 *    navigate anyone off the ending,
 *  - never instead of the browser: a focused choice keeps its native Enter,
 *  - only visible choices are numbered, so `1` is always the top button on
 *    screen and the debrief's single "Continue" is always Enter.
 */

const CHOICE = ".lm-choice";
const MAX_KEYS = 9;
const TYPING = "input, select, textarea, [contenteditable='true']";

export function installChoiceKeys(game: HTMLElement): () => void {
  let current: HTMLElement[] = [];
  let queued = false;

  /** The chapter on screen: the last section main.ts left visible. */
  const activeSection = (): HTMLElement => {
    const sections = Array.from(game.querySelectorAll<HTMLElement>(":scope > section.lm-chapter")).filter((s) => !s.hidden);
    return sections[sections.length - 1] ?? game;
  };

  const visible = (n: HTMLElement): boolean => n.getClientRects().length > 0;
  const keyable = (n: HTMLElement): boolean =>
    n.tagName === "BUTTON" && !(n as HTMLButtonElement).disabled && visible(n);

  function sync(): void {
    queued = false;
    // The stage is re-rendered wholesale on most beats, so strip and renumber
    // everything each time rather than trying to diff.
    const all = Array.from(game.querySelectorAll<HTMLElement>(CHOICE));
    for (const n of all) {
      if (!n.hasAttribute("data-key")) continue;
      n.removeAttribute("data-key");
      n.removeAttribute("aria-keyshortcuts");
    }
    current = Array.from(activeSection().querySelectorAll<HTMLElement>(CHOICE)).filter(keyable).slice(0, MAX_KEYS);
    current.forEach((n, i) => {
      n.dataset.key = String(i + 1);
      n.setAttribute("aria-keyshortcuts", String(i + 1));
    });
  }

  function schedule(): void {
    if (queued) return;
    queued = true;
    requestAnimationFrame(sync);
  }

  const onKey = (e: KeyboardEvent): void => {
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
    const t = e.target as HTMLElement | null;
    if (t?.closest(TYPING)) return;

    if (e.key === "Enter") {
      if (t?.closest(CHOICE)) return; // the browser already knows how to do this
      if (current.length !== 1) return;
      e.preventDefault();
      current[0]!.click();
      return;
    }
    if (!/^[1-9]$/.test(e.key)) return;
    const btn = current[Number(e.key) - 1];
    if (!btn) return;
    e.preventDefault();
    btn.click();
  };

  const observer = new MutationObserver(schedule);
  observer.observe(game, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden"] });
  document.addEventListener("keydown", onKey);
  sync();

  return () => {
    observer.disconnect();
    document.removeEventListener("keydown", onKey);
  };
}
