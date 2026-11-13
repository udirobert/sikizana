/**
 * Outbound links — the only place a product URL lives.
 *
 * The finale used to describe Sikizana without offering a way to reach it,
 * which made a ten-minute game a dead end. Every outbound link is built here
 * so the campaign tag is consistent and the click-through is measurable.
 *
 * Rules: the destination is the read-only finance check (no login wall, no
 * payment surface), and the UTM source is the game itself so a product
 * funnel can tell a judge from a stranger.
 */

export const PRODUCT_URL = "https://sikizana.persidian.com";

/** Sector the link opens; wholesale is the closest bucket to a trading mill. */
export const PRODUCT_CHECK_SECTOR = "wholesale";

export const UTM = {
  source: "late_market",
  medium: "game",
  campaign: "zoud",
} as const;

/** The read-only finance check, tagged so clicks from the game are countable. */
export function productCheckUrl(sector: string = PRODUCT_CHECK_SECTOR): string {
  const params = new URLSearchParams({
    utm_source: UTM.source,
    utm_medium: UTM.medium,
    utm_campaign: UTM.campaign,
  });
  return `${PRODUCT_URL}/check/${encodeURIComponent(sector)}?${params.toString()}`;
}
