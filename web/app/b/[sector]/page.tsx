import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MarginSnapshot } from "@/components/MarginSnapshot";
import {
  formatPct,
  marginNoteRead,
  parseMarginPct,
  resolveSnapshotSector,
  snapshotPath,
} from "@/lib/sector-benchmarks";

type PageProps = {
  params: Promise<{ sector: string }>;
  searchParams: Promise<{ g?: string; n?: string }>;
};

const SITE = "https://sikizana.persidian.com";

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const { sector: slug } = await params;
  const sp = await searchParams;
  const resolved = resolveSnapshotSector(slug);
  if (!resolved) {
    return { title: "Margin note — Sikizana" };
  }

  const gross = parseMarginPct(sp.g);
  const net = parseMarginPct(sp.n);
  const read = marginNoteRead(resolved.bench, gross, net);
  const title = `${resolved.label}: are these margins normal? — Sikizana`;
  const description = `Typical UK ${resolved.label.toLowerCase()}: ~${formatPct(resolved.bench.avgGrossMargin)} gross / ~${formatPct(resolved.bench.avgNetMargin)} net · indicative. Siki's read: ${read}`;

  const og = new URL("/api/og/margin", SITE);
  og.searchParams.set("sector", resolved.slug);
  if (gross != null) og.searchParams.set("g", String(gross));
  if (net != null) og.searchParams.set("n", String(net));

  const path = snapshotPath(resolved.slug, { g: gross, n: net });

  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      title,
      description,
      url: `${SITE}${path}`,
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

export default async function MarginNotePage({ params, searchParams }: PageProps) {
  const { sector: slug } = await params;
  const sp = await searchParams;
  const resolved = resolveSnapshotSector(slug);
  if (!resolved) notFound();

  return (
    <MarginSnapshot
      resolved={resolved}
      initialGross={parseMarginPct(sp.g)}
      initialNet={parseMarginPct(sp.n)}
    />
  );
}
