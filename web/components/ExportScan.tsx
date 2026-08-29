"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { endpoints, type ScanUploadFinding, type ScanUploadResponse } from "@/lib/api";

/**
 * ExportScan — the "no login" rung of the trust ladder.
 *
 * Drop a Xero bills export (CSV) and get real findings on YOUR suppliers in
 * seconds — no account, no OAuth, nothing stored. Optional sales + payments
 * exports widen coverage. Findings render in the same card language as the
 * QuickCheck demo findings, but labelled honestly as coming from the upload.
 *
 * docs/TRUST_FUNNEL_PLAN.md (Phase 1)
 */

type Stage = "idle" | "uploading" | "results" | "error";

const TONE_CLASSES: Record<ScanUploadFinding["tone"], { badge: string; border: string }> = {
  info: { badge: "bg-sky-50 text-sky-700 border-sky-100", border: "border-l-sky-400" },
  watch: { badge: "bg-amber-50 text-amber-700 border-amber-100", border: "border-l-amber-400" },
  risk: { badge: "bg-rose-50 text-rose-700 border-rose-100", border: "border-l-rose-400" },
};

const TONE_LABEL: Record<ScanUploadFinding["tone"], string> = {
  info: "Good to know",
  watch: "Keep an eye on",
  risk: "Review this",
};

function FileChip({
  label,
  file,
  required,
  onPick,
}: {
  label: string;
  file: File | null;
  required?: boolean;
  onPick: (f: File | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <button
      type="button"
      onClick={() => inputRef.current?.click()}
      className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-xs transition ${
        file
          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
          : "border-stone-200 bg-white text-stone-500 hover:border-stone-300"
      }`}
    >
      <span className="min-w-0 truncate font-semibold">
        {file ? file.name : label}
        {required && !file ? " · required" : ""}
      </span>
      <span className="ml-2 shrink-0 text-[10px] uppercase tracking-wide opacity-70">
        {file ? "Change" : "Choose CSV"}
      </span>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,.txt"
        className="hidden"
        onChange={(e) => onPick(e.target.files?.[0] ?? null)}
      />
    </button>
  );
}

export function ExportScan({ connectHref }: { connectHref: string }) {
  const [stage, setStage] = useState<Stage>("idle");
  const [dragging, setDragging] = useState(false);
  const [bills, setBills] = useState<File | null>(null);
  const [sales, setSales] = useState<File | null>(null);
  const [payments, setPayments] = useState<File | null>(null);
  const [result, setResult] = useState<ScanUploadResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const submit = async (billsFile: File, salesFile: File | null, paymentsFile: File | null) => {
    setStage("uploading");
    setError(null);
    endpoints.trackEvent("scan_upload", {
      has_sales: Boolean(salesFile),
      has_payments: Boolean(paymentsFile),
    });
    try {
      const res = await endpoints.scanUpload({
        bills: billsFile,
        sales: salesFile,
        payments: paymentsFile,
      });
      setResult(res);
      setStage("results");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed — try again.");
      setStage("error");
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      setBills(file);
      void submit(file, sales, payments);
    }
  };

  const reset = () => {
    setStage("idle");
    setResult(null);
    setError(null);
    setBills(null);
    setSales(null);
    setPayments(null);
  };

  return (
    <div id="export-scan" className="rounded-xl border border-stone-200 bg-white p-5 text-left">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-stone-900">
          Check <em>your</em> books — no login needed
        </p>
        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
          Nothing stored
        </span>
      </div>
      <p className="mt-1 text-xs leading-relaxed text-stone-500">
        Export your bills from Xero as a CSV and drop them here. Siki runs the same
        duplicate and overdue checks as a connected account. The file is read once,
        in memory, and discarded.
      </p>

      {stage !== "results" && (
        <>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={`mt-4 rounded-xl border-2 border-dashed px-4 py-6 text-center transition ${
              dragging ? "border-sky-400 bg-sky-50" : "border-stone-200 bg-stone-50/60"
            }`}
          >
            <p className="text-sm font-semibold text-stone-700">
              {bills ? bills.name : "Drop your bills CSV here"}
            </p>
            <p className="mt-1 text-[11px] text-stone-400">
              or use the file pickers below — bills are enough to start
            </p>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <FileChip label="Bills (what you owe)" file={bills} required onPick={setBills} />
            <FileChip label="Sales invoices (owed to you)" file={sales} onPick={setSales} />
            <FileChip label="Payments" file={payments} onPick={setPayments} />
          </div>

          <button
            type="button"
            disabled={!bills || stage === "uploading"}
            onClick={() => bills && void submit(bills, sales, payments)}
            className="mt-3 inline-flex w-full items-center justify-center rounded-xl bg-stone-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-stone-800 btn-press disabled:cursor-not-allowed disabled:opacity-50"
          >
            {stage === "uploading" ? "Siki is reading your export…" : "Run the check on my export"}
          </button>

          {stage === "error" && error && (
            <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              {error}
            </p>
          )}

          <button
            type="button"
            onClick={() => setGuideOpen((v) => !v)}
            className="mt-3 text-[11px] font-semibold text-stone-500 underline-offset-2 hover:text-stone-700 hover:underline"
          >
            {guideOpen ? "Hide the how-to" : "How do I export from Xero?"}
          </button>
          {guideOpen && (
            <div className="mt-2 rounded-lg border border-stone-100 bg-stone-50/70 px-3.5 py-3 text-xs leading-relaxed text-stone-600">
              <ol className="list-decimal space-y-1 pl-4">
                <li>In Xero, go to <strong>Business → Bills to pay</strong>.</li>
                <li>Select all bills, then choose <strong>Export</strong> (CSV).</li>
                <li>Repeat in <strong>Business → Invoices</strong> for sales (optional).</li>
                <li>Drop the files here — totals, dates, and suppliers are all Siki needs.</li>
              </ol>
              <p className="mt-2 text-[11px] text-stone-400">
                Prefer to paste?{" "}
                <a href="/templates/bills-template.csv" download className="font-semibold underline underline-offset-2">
                  Download our template
                </a>{" "}
                and fill it in.
              </p>
            </div>
          )}
        </>
      )}


      {stage === "results" && result && (
        <div className="mt-4 fade-in-up">
          {/* Honest provenance: what we read, from when */}
          <p className="text-[11px] text-stone-500">
            From your export
            {result.stats.date_from && result.stats.date_to
              ? ` · ${result.stats.date_from} → ${result.stats.date_to}`
              : ""}
            {" · "}
            {result.stats.bills} bill{result.stats.bills === 1 ? "" : "s"}
            {result.stats.sales_invoices > 0 ? ` · ${result.stats.sales_invoices} sales invoices` : ""}
            {result.stats.payments > 0 ? ` · ${result.stats.payments} payments` : ""}
            {" — read once, never stored."}
          </p>

          {result.findings.length === 0 ? (
            <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-4">
              <p className="text-sm font-semibold text-emerald-800">Clean — nothing flagged.</p>
              <p className="mt-1 text-xs leading-relaxed text-emerald-700">
                No duplicates or overdues in this export. That&apos;s a real result — and
                Siki can keep watch as new bills arrive if you connect Xero.
              </p>
            </div>
          ) : (
            <div className="mt-3 space-y-2.5">
              {result.findings.map((f) => {
                const tone = TONE_CLASSES[f.tone];
                const isExpanded = expandedId === f.id;
                return (
                  <div
                    key={f.id}
                    className={`rounded-xl border bg-white px-4 py-3 border-l-4 ${tone.border} cursor-pointer transition hover:shadow-sm`}
                    onClick={() => setExpandedId(isExpanded ? null : f.id)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-stone-900">{f.label}</p>
                        <p className="mt-0.5 text-xs text-stone-500">{f.detail}</p>
                      </div>
                      <span
                        className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${tone.badge}`}
                      >
                        {TONE_LABEL[f.tone]}
                      </span>
                    </div>
                    {isExpanded && (
                      <p className="mt-2 border-t border-stone-100 pt-2 text-xs leading-relaxed text-stone-600">
                        {f.evidence}
                      </p>
                    )}
                  </div>
                );
              })}
              {result.stats.truncated > 0 && (
                <p className="text-center text-[11px] text-stone-400">
                  + {result.stats.truncated} more — connect Xero to see everything.
                </p>
              )}
            </div>
          )}

          {/* Coverage honesty: what this export could NOT check */}
          <ul className="mt-3 space-y-1">
            {result.coverage_notes.map((note) => (
              <li key={note} className="flex items-start gap-1.5 text-[11px] text-stone-500">
                <span className="mt-0.5 text-stone-300">•</span>
                <span>{note}</span>
              </li>
            ))}
          </ul>

          <div className="mt-4 rounded-xl border border-sky-200 bg-gradient-to-br from-sky-50/60 to-white p-4">
            <p className="text-sm font-semibold text-stone-900">
              That was one snapshot. Your books change every day.
            </p>
            <p className="mt-1 text-xs leading-relaxed text-stone-500">
              Connect Xero and Siki re-runs these checks continuously — plus supplier
              bank-detail changes, which need a live baseline.
            </p>
            <Link
              href={connectHref}
              onClick={() => endpoints.trackEvent("connect_click", { surface: "export_scan" })}
              className="mt-3 inline-flex w-full items-center justify-center rounded-xl bg-sky-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-sky-700 btn-press"
            >
              Connect Xero — keep watching my books
            </Link>
            <button
              type="button"
              onClick={reset}
              className="mt-2 w-full text-center text-[11px] font-semibold text-stone-500 underline-offset-2 hover:text-stone-700 hover:underline"
            >
              Scan a different export
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

