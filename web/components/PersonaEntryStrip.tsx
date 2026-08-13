import Link from "next/link";
import { SikiMascot, ZanaMascot } from "@/components/SikiMascot";
import { getLandingPersonaPaths } from "@/lib/persona-theme";

export function PersonaEntryStrip({
  sikiHref,
  zanaHref,
}: {
  sikiHref?: string;
  zanaHref?: string;
}) {
  const paths = getLandingPersonaPaths();
  return (
    <section className="max-w-6xl mx-auto px-6 py-12">
      <div className="grid grid-cols-1 border-y border-stone-200 md:grid-cols-2 md:divide-x md:divide-stone-200">
        {paths.map((path) => {
          const href = path.persona === "siki" ? (sikiHref ?? path.demoHref) : (zanaHref ?? path.demoHref);
          return (
            <Link
              key={path.persona}
              href={href}
              className={`group flex items-start gap-3 py-6 first:md:pr-8 last:md:pl-8 ${path.persona === "siki" ? "hover:text-sky-700" : "hover:text-rose-700"}`}
            >
              {path.persona === "siki" ? (
                <SikiMascot size={44} mood="wave" />
              ) : (
                <ZanaMascot size={44} mood="look" />
              )}
              <div>
                <p className="text-base font-bold text-stone-900">{path.name}</p>
                <p className="mt-1 text-sm text-stone-600 leading-snug">{path.description}</p>
                <p className="mt-3 text-xs font-semibold text-stone-400 group-hover:text-current">
                  Open {path.name} →
                </p>
              </div>
            </Link>
          );
        })}
      </div>
      <p className="mt-5 text-xs text-stone-500">
        Siki can&rsquo;t change anything, Zana can&rsquo;t chase anyone — without you.
      </p>
    </section>
  );
}

export function JobStrip({
  jobs,
}: {
  jobs: { title: string; href: string }[];
}) {
  return (
    <section className="border-y border-stone-200 bg-white">
      <div className="max-w-6xl mx-auto px-6 py-5">
        <div className="grid grid-cols-1 md:grid-cols-3 md:divide-x md:divide-stone-200">
          {jobs.map((job) => (
            <Link
              key={job.title}
              href={job.href}
              className="group py-2 md:px-6 first:pl-0 last:pr-0 text-sm font-semibold text-stone-950 hover:text-sky-700"
            >
              {job.title} <span className="text-stone-400 group-hover:text-sky-700">→</span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
