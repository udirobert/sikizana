/**
 * Simple-language mode (GDD §4 accessibility; the +5 bonus claims it, so it
 * must exist). A thin string swap for the longest teaching lines — the deck
 * that becomes a handout. Not a full i18n layer: one toggle, English only,
 * set from Options on the title screen.
 */

let simple = false;

export function setSimpleLanguage(v: boolean): void {
  simple = v;
}

export function isSimpleLanguage(): boolean {
  return simple;
}

/** Pick the phrasing for the current mode. `plain` is the shorter, plainer sentence. */
export function phrased(nested: { normal: string; plain: string }): string {
  return simple ? nested.plain : nested.normal;
}
