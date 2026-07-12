"use client";

import { useState } from "react";
import Link from "next/link";
import { endpoints, type MemoryEntry } from "@/lib/api";
import { SikiMascot } from "@/components/SikiMascot";
import { MemoryBadge } from "@/components/MemoryBadge";

const REGIONS = [
  { code: "GB", label: "UK HMRC" },
  { code: "AU", label: "Australia ATO" },
  { code: "US", label: "US IRS" },
];

const SAMPLE_QUERIES = [
  "Can I deduct lunch with a client?",
  "What is the business mileage rate?",
  "Is client entertainment deductible?",
  "How much is corporation tax?",
  "Can I claim home office expenses?",
];

export default function TaxRagPage() {
  const [query, setQuery] = useState("");
  const [region, setRegion] = useState("GB");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<MemoryEntry[]>([]);
  const [regionInfo, setRegionInfo] = useState<{ name: string; authority: string } | null>(null);
  const [supermemory, setSupermemory] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async (q: string) => {
    setQuery(q);
    setLoading(true);
    setError(null);
    try {
      const data = await endpoints.taxRag(q, region);
      setResults(data.results);
      setRegionInfo(data.region_info);
      setSupermemory(data.supermemory);
    } catch {
      setError("Could not search the tax corpus. Try again or check that Supermemory is running.");
    } finally {
      setLoading(false);
    }
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    void handleSearch(query.trim());
  };

  return (
    <div className="min-h-screen bg-stone-50">
      <header className="bg-white border-b border-stone-200 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 text-sm text-stone-500 hover:text-stone-800 transition-colors">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            Back home
          </Link>
          <MemoryBadge />
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-10">
        <div className="flex items-start gap-4 mb-8">
          <SikiMascot size={48} mood="wave" />
          <div>
            <h1 className="text-xl font-semibold text-stone-800">Tax Assistant</h1>
            <p className="text-sm text-stone-500 mt-1">
              Multi-region semantic tax RAG powered by Supermemory Local. Ask a plain English question
              and see the exact documents that answer it.
            </p>
          </div>
        </div>

        <form onSubmit={onSubmit} className="bg-white border border-stone-200 rounded-2xl p-4 mb-8 shadow-sm">
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <select
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-700 focus:outline-none focus:ring-2 focus:ring-sky-500"
            >
              {REGIONS.map((r) => (
                <option key={r.code} value={r.code}>
                  {r.label}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ask a tax question..."
              className="flex-1 rounded-lg border border-stone-200 px-3 py-2 text-sm text-stone-800 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
            <button
              type="submit"
              disabled={loading || !query.trim()}
              className="bg-sky-600 hover:bg-sky-700 disabled:bg-stone-300 text-white text-sm font-semibold px-4 py-2 rounded-lg transition btn-press"
            >
              {loading ? "Searching..." : "Search"}
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            <span className="text-xs text-stone-500">Try:</span>
            {SAMPLE_QUERIES.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => void handleSearch(q)}
                className="text-xs text-sky-600 bg-sky-50 hover:bg-sky-100 px-2 py-1 rounded-md transition"
              >
                {q}
              </button>
            ))}
          </div>
        </form>

        {error && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 text-sm text-amber-800">
            {error}
          </div>
        )}

        {regionInfo && (
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-stone-700">
              Results for {regionInfo.name} · {regionInfo.authority}
            </h2>
            <span className="text-xs text-stone-400">
              {supermemory ? "Powered by Supermemory Local" : "Keyword fallback — Supermemory offline"}
            </span>
          </div>
        )}

        {results.length > 0 && (
          <div className="space-y-3">
            {results.map((result, i) => (
              <div
                key={result.id || i}
                className="bg-white border border-stone-200 rounded-xl p-4 fade-in-up"
              >
                <p className="text-sm text-stone-800 leading-relaxed">{result.content}</p>
                <div className="flex items-center gap-3 mt-2">
                  {result.score !== undefined && (
                    <span className="text-[10px] font-medium text-violet-700 bg-violet-50 px-1.5 py-0.5 rounded">
                      {(result.score * 100).toFixed(0)}% match
                    </span>
                  )}
                  {!!result.metadata?.source && (
                    <span className="text-[10px] text-stone-500">
                      Source: {String(result.metadata.source)}
                    </span>
                  )}
                  {!!result.metadata?.region && (
                    <span className="text-[10px] text-stone-500">
                      Region: {String(result.metadata.region).toUpperCase()}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && results.length === 0 && query && !error && (
          <div className="text-center py-12">
            <p className="text-sm text-stone-500">No matching tax rules found.</p>
            <p className="text-xs text-stone-400 mt-1">Try a different question or region.</p>
          </div>
        )}

        {!query && !loading && results.length === 0 && (
          <div className="text-center py-12">
            <p className="text-sm text-stone-500">Ask a tax question to see Supermemory in action.</p>
          </div>
        )}
      </main>
    </div>
  );
}
