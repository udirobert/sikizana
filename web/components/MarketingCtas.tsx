import Link from "next/link";

/** Shared marketing CTA copy and hrefs — keep landing, music, nav, and pricing in sync. */
export const SAMPLE_BOOKS_HREF = "/books?flow=check";
export const CONNECT_XERO_HREF = "/books?flow=check&connect=1";
/** Default family when they compare without typing a business. */
export const COMPARE_TYPICALS_HREF = "/check/hospitality";

export const PRIMARY_CTA_CLASS =
  "inline-flex items-center justify-center rounded-xl bg-stone-950 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-stone-900/15 transition hover:bg-stone-800 btn-press";

export const SECONDARY_CTA_CLASS =
  "inline-flex items-center justify-center rounded-xl border border-stone-300 bg-white px-6 py-3 text-sm font-semibold text-stone-800 transition hover:bg-stone-100 btn-press";

export function BooksNextLinks({
  sampleHref = SAMPLE_BOOKS_HREF,
  connectHref = CONNECT_XERO_HREF,
}: {
  sampleHref?: string;
  connectHref?: string;
}) {
  return (
    <p className="mt-4 text-sm text-stone-500 fade-in-up fade-in-up-delay-4">
      Then{" "}
      <Link href={sampleHref} className="font-semibold text-stone-800 hover:text-sky-700">
        sample books
      </Link>
      {" · "}
      <Link href={connectHref} className="font-semibold text-stone-800 hover:text-sky-700">
        Connect Xero
      </Link>
    </p>
  );
}

export function MarketingCtas({
  sampleHref = SAMPLE_BOOKS_HREF,
  connectHref = CONNECT_XERO_HREF,
}: {
  sampleHref?: string;
  connectHref?: string;
}) {
  return (
    <>
      <div className="mt-7 flex flex-col sm:flex-row gap-3 fade-in-up fade-in-up-delay-3">
        <Link href={sampleHref} className={PRIMARY_CTA_CLASS}>
          Try sample books
        </Link>
        <Link href={connectHref} className={SECONDARY_CTA_CLASS}>
          Connect Xero
        </Link>
      </div>
      <p className="mt-5 text-xs text-stone-500 fade-in-up fade-in-up-delay-4">
        No signup · No changes without approval · No data sold
      </p>
    </>
  );
}
