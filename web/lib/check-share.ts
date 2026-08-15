/** Shareable /check artefact: URL encodes only what the visitor chose to include. */

export type CheckShareState = {
  g: number | null;
  n: number | null;
  ratios: Record<string, number>;
  include: Set<string>;
  inbound: boolean;
};

function firstString(
  sp: URLSearchParams | Record<string, string | string[] | undefined>,
  key: string,
): string | null {
  if (sp instanceof URLSearchParams) return sp.get(key);
  const v = sp[key];
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

export function parseShareNum(raw: string | null | undefined): number | null {
  if (raw == null || !String(raw).trim()) return null;
  const n = Number(String(raw).replace(/%/g, "").trim());
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 10) / 10;
}

export function researchLabelFromSlug(slug: string): string {
  try {
    return decodeURIComponent(slug).replace(/[-_]/g, " ").trim();
  } catch {
    return slug.replace(/[-_]/g, " ").trim();
  }
}

export function parseCheckShare(
  sp: URLSearchParams | Record<string, string | string[] | undefined>,
): CheckShareState {
  const g = parseShareNum(firstString(sp, "g"));
  const n = parseShareNum(firstString(sp, "n"));
  const ratios: Record<string, number> = {};
  const keys = sp instanceof URLSearchParams ? [...sp.keys()] : Object.keys(sp);
  for (const key of keys) {
    if (!key.startsWith("r_")) continue;
    const val = parseShareNum(firstString(sp, key));
    if (val != null) ratios[key.slice(2)] = val;
  }
  const incRaw = firstString(sp, "inc");
  const inbound = g != null || n != null || Object.keys(ratios).length > 0;
  const include = incRaw
    ? new Set(incRaw.split(",").map((s) => s.trim()).filter(Boolean))
    : new Set<string>([
        ...(g != null ? (["g"] as const) : []),
        ...(n != null ? (["n"] as const) : []),
        ...Object.keys(ratios),
        ...(inbound ? (["read"] as const) : []),
      ]);
  return { g, n, ratios, include, inbound };
}

export function emptyCheckShare(): CheckShareState {
  return { g: null, n: null, ratios: {}, include: new Set(), inbound: false };
}

export function buildCheckShareQuery(opts: {
  g: number | null;
  n: number | null;
  ratioValues: Record<string, number | null>;
  include: Set<string>;
}): string {
  const params = new URLSearchParams();
  const inc: string[] = [];
  if (opts.include.has("g") && opts.g != null) {
    params.set("g", String(opts.g));
    inc.push("g");
  }
  if (opts.include.has("n") && opts.n != null) {
    params.set("n", String(opts.n));
    inc.push("n");
  }
  for (const [id, val] of Object.entries(opts.ratioValues)) {
    if (opts.include.has(id) && val != null) {
      params.set(`r_${id}`, String(val));
      inc.push(id);
    }
  }
  if (opts.include.has("read")) inc.push("read");
  if (inc.length > 0) params.set("inc", inc.join(","));
  return params.toString();
}

export function buildCheckSharePath(slug: string, query: string): string {
  const base = `/check/${encodeURIComponent(slug)}`;
  return query ? `${base}?${query}` : base;
}

export function buildCheckShareBlurb(opts: {
  researchLabel: string;
  sectorLabel: string;
  lines: string[];
  read: string | null;
  includeRead: boolean;
  url: string;
}): string {
  const { researchLabel, sectorLabel, lines, read, includeRead, url } = opts;
  const same = researchLabel.toLowerCase() === sectorLabel.toLowerCase();
  const typical = same
    ? `Typical UK ${sectorLabel.toLowerCase()} · indicative.`
    : `Typical UK ${sectorLabel.toLowerCase()} — looking at ${researchLabel}. Indicative, not a peer dataset.`;
  const yours = lines.length > 0 ? `Yours: ${lines.join(" · ")}.` : null;
  const siki = includeRead && read ? `Siki's read: ${read}` : null;
  return [typical, yours, siki, "Ballpark figures — not stored by Sikizana.", url]
    .filter(Boolean)
    .join("\n");
}
