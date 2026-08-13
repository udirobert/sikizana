import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Margin note — Sikizana",
  description: "Typical UK sector margins — indicative ranges you can share, then compare in your books.",
};

export default function BenchmarksLayout({ children }: { children: React.ReactNode }) {
  return children;
}
