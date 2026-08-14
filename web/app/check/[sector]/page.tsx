import type { Metadata } from "next";
import { QuickCheck } from "@/components/QuickCheck";
import {
  formatPct,
  resolveSnapshotSector,
} from "@/lib/sector-benchmarks";

type PageProps = {
  params: Promise<{ sector: string }>;
};

const SITE = "https://sikizana.persidian.com";

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { sector: slug } = await params;
  const resolved = resolveSnapshotSector(slug);

  // For known sectors, generate rich OG metadata.
  // For unknown slugs (resolved by backend dynamically), use generic metadata.
  if (!resolved) {
    const label = decodeURIComponent(slug).replace(/[-_]/g, " ");
    return {
      title: `${label} quick check — Sikizana`,
      description: `Siki checks your ${label.toLowerCase()} business against UK sector benchmarks. See what an AI finance assistant finds.`,
      openGraph: {
        title: `${label} quick check — Sikizana`,
        description: `Siki checks your ${label.toLowerCase()} business against UK sector benchmarks.`,
        siteName: "Sikizana",
        type: "website",
      },
    };
  }

  const { label, bench } = resolved;
  const title = `${label} quick check — Sikizana`;
  const description = `Siki checks your ${label.toLowerCase()} margins against typical UK ranges: ~${formatPct(bench.avgGrossMargin)} gross, ~${formatPct(bench.avgNetMargin)} net. See what an AI finance assistant finds — then check your own books.`;

  const og = new URL("/api/og/check", SITE);
  og.searchParams.set("sector", resolved.slug);

  const canonical = `/check/${resolved.slug}`;

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

export default async function QuickCheckPage({ params }: PageProps) {
  const { sector: slug } = await params;
  // Pass the raw slug — QuickCheck resolves via the backend API.
  // Known slugs get instant local resolution as a hint; unknown slugs
  // are resolved by the backend's keyword/LLM/cache system.
  const hint = resolveSnapshotSector(slug);
  return <QuickCheck slug={slug} hint={hint} />;
}
