import { redirect } from "next/navigation";

/**
 * /benchmarks folded into the shareable margin note at /b/[sector].
 * Preserve ?sector= when present.
 */
export default async function BenchmarksRedirect({
  searchParams,
}: {
  searchParams: Promise<{ sector?: string }>;
}) {
  const sp = await searchParams;
  const sector = (sp.sector ?? "catering").toLowerCase().replace(/ /g, "_");
  const slug =
    sector === "hospitality"
      ? "catering"
      : sector === "professional_services"
        ? "services"
        : sector;
  redirect(`/b/${encodeURIComponent(slug)}`);
}
