"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { endpoints, type MemoryEntry } from "@/lib/api";
import { MemoryBadge } from "@/components/MemoryBadge";
import { SikiMascot } from "@/components/SikiMascot";

/**
 * /memory — inspect what Siki remembers about your business.
 *
 * This page makes the Supermemory layer transparent and tangible:
 * - Shows whether Supermemory is connected (Memory: ON/OFF badge)
 * - Lists all memories stored for this session
 * - Each memory can be deleted (right-to-erasure at the individual level)
 *
 * For the hackathon demo, this is the "show, don't tell" page — judges
 * can see exactly what the memory layer has learned, not just trust that
 * it's working behind the scenes.
 */

export default function MemoryPage() {
  const [memories, setMemories] = useState<MemoryEntry[]>([]);
  const [available, setAvailable] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await endpoints.memory.list();
      setMemories(res.memories);
      setAvailable(res.available);
    } catch {
      setMemories([]);
      setAvailable(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await endpoints.memory.delete(id);
      setMemories((prev) => prev.filter((m) => m.id !== id));
    } catch {
      // Error — keep the memory in the list
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-stone-50">
      {/* Header */}
      <header className="bg-white border-b border-stone-200 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link href="/books" className="flex items-center gap-2 text-sm text-stone-500 hover:text-stone-800 transition-colors">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            Back to chat
          </Link>
          <MemoryBadge />
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8">
        {/* Title section */}
        <div className="flex items-start gap-4 mb-8">
          <div className="shrink-0">
            <SikiMascot size={48} mood="idle" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-stone-800">What Siki Remembers</h1>
            <p className="text-sm text-stone-500 mt-1">
              Siki uses Supermemory Local to recall past conversations, customer payment patterns,
              and your preferences across sessions. Everything here is stored on your machine —
              you can inspect and delete any memory at any time.
            </p>
          </div>
        </div>

        {/* Status banner */}
        {!available && !loading && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
            <div className="flex items-start gap-3">
              <div className="shrink-0 mt-0.5">
                <svg className="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-amber-900">Supermemory is not connected</p>
                <p className="text-xs text-amber-700 mt-1">
                  Siki is working without memory — every session starts fresh. Start Supermemory Local
                  to enable persistent memory and semantic tax RAG.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Loading state */}
        {loading && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white border border-stone-200 rounded-xl p-4 animate-pulse">
                <div className="h-4 bg-stone-100 rounded w-3/4 mb-2" />
                <div className="h-3 bg-stone-100 rounded w-1/2" />
              </div>
            ))}
          </div>
        )}

        {/* Memories list */}
        {!loading && available && memories.length === 0 && (
          <div className="text-center py-12">
            <div className="mb-3">
              <svg className="w-12 h-12 text-stone-300 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </div>
            <p className="text-sm text-stone-500">No memories yet</p>
            <p className="text-xs text-stone-400 mt-1">
              Have a conversation with Siki and check back — memories are extracted and indexed
              after each session.
            </p>
          </div>
        )}

        {!loading && available && memories.length > 0 && (
          <div className="space-y-3">
            <p className="text-xs text-stone-500 mb-2">
              {memories.length} {memories.length === 1 ? "memory" : "memories"} stored
            </p>
            {memories.map((memory) => (
              <div
                key={memory.id}
                className="bg-white border border-stone-200 rounded-xl p-4 fade-in-up group"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-stone-800 leading-relaxed">{memory.content}</p>
                    {memory.score !== undefined && (
                      <p className="text-[10px] text-stone-400 mt-2">
                        Relevance score: {(memory.score * 100).toFixed(0)}%
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => handleDelete(memory.id)}
                    disabled={deletingId === memory.id}
                    className="shrink-0 p-1.5 rounded-lg text-stone-300 hover:text-red-500 hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100 disabled:opacity-50"
                    title="Delete this memory"
                  >
                    {deletingId === memory.id ? (
                      <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 12a8 8 0 018-8" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Footer — privacy note */}
        {!loading && (
          <div className="mt-8 pt-6 border-t border-stone-200">
            <p className="text-xs text-stone-400 leading-relaxed">
              Memories are stored locally by Supermemory Local on your machine.
              They are never sent to a third party. You can delete individual memories
              above, or erase everything by disconnecting your session from the Account page.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
