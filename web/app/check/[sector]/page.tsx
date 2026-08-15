import type { Metadata } from "next";
import { QuickCheck } from "@/components/QuickCheck";
import { parseCheckShare, researchLabelFromSlug } from "@/lib/check-share";
import {
  formatPct,
  resolveSnapshotSector,
} from "@/lib/sector-benchmarks";

type PageProps = {
  params: Promise<{ sector: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const SITE = "https://sikizana.persidian.com";

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const { sector: slug } = await params;
  const sp = await searchParams;
  const share = parseCheckShare(sp);
  const resolved = resolveSnapshotSector(slug);
  const research = researchLabelFromSlug(slug);

  if (!resolved) {
    return {
      title: `${research} quick check — Sikizana`,
      description: `Siki checks your ${research.toLowerCase()} business against UK sector benchmarks. Ballpark figures stay in your browser until you share.`,
      openGraph: {
        title: `${research} quick check — Sikizana`,
        description: `Siki checks your ${research.toLowerCase()} business against UK sector benchmarks.`,
        siteName: "Sikizana",
        type: "website",
      },
    };
  }

  const { label, bench } = resolved;
  const yoursBits = [
    share.include.has("g") && share.g != null ? `gross ${share.g}%` : null,
    share.include.has("n") && share.n != null ? `net ${share.n}%` : null,
  ].filter(Boolean);
  const title = `${research} quick check — Sikizana`;
  const description = yoursBits.length
    ? `Yours vs typical UK ${label.toLowerCase()}: ${yoursBits.join(", ")}. Indicative ranges — ballpark is fine.`
    : `Siki checks your ${research.toLowerCase()} margins against typical UK ranges: ~${formatPct(bench.avgGrossMargin)} gross, ~${formatPct(bench.avgNetMargin)} net. Ballpark is enough — then check your own books.`;

  const og = new URL("/api/og/check", SITE);
  og.searchParams.set("sector", resolved.slug);
  og.searchParams.set("q", research);
  if (share.include.has("g") && share.g != null) og.searchParams.set("g", String(share.g));
  if (share.include.has("n") && share.n != null) og.searchParams.set("n", String(share.n));

  const canonical = `/check/${encodeURIComponent(slug)}`;

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      url: `${SITE}${canonical}`,
      siteName: "Sikizana",
      type: "website",
      images: [{ url: og.toString(), width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [og.toString()],
    },
  };
}

export default async function QuickCheckPage({ params, searchParams }: PageProps) {
  const { sector: slug } = await params;
  const sp = await searchParams;
  const hint = resolveSnapshotSector(slug);
  return <QuickCheck slug={slug} hint={hint} initialShare={parseCheckShare(sp)} />;
}
