import { ImageResponse } from "next/og";
import {
  formatPct,
  resolveSnapshotSector,
} from "@/lib/sector-benchmarks";

export const runtime = "edge";

const SIZE = { width: 1200, height: 630 };

/**
 * Dynamic OG card for /check/[sector] — agentic lead magnet unfurl.
 * /api/og/check?sector=catering
 *
 * Designed to feel like a findings card rather than a data table.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const resolved = resolveSnapshotSector(searchParams.get("sector") ?? "hospitality");
  if (!resolved) {
    return new Response("Unknown sector", { status: 404 });
  }

  const { label, bench } = resolved;
  const queryLabel = searchParams.get("q")?.trim() || label;
  const gross = searchParams.get("g");
  const net = searchParams.get("n");
  const hasYours = gross != null || net != null;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: "#fafaf9",
          padding: "56px 64px",
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
        }}
      >
        {/* Top: Brand + headline */}
        <div style={{ display: "flex", flexDirection: "column", marginBottom: 40 }}>
          <div
            style={{
              fontSize: 20,
              fontWeight: 700,
              letterSpacing: "0.16em",
              color: "#78716c",
              textTransform: "uppercase",
            }}
          >
            Sikizana
          </div>
          <div
            style={{
              marginTop: 12,
              fontSize: 52,
              fontWeight: 800,
              color: "#0c0a09",
              letterSpacing: "-0.03em",
              lineHeight: 1.1,
            }}
          >
            {`Siki's ${queryLabel.toLowerCase()} check`}
          </div>
          <div style={{ marginTop: 12, fontSize: 24, fontWeight: 500, color: "#57534e" }}>
            {hasYours ? "A comparison someone chose to share · indicative" : "AI finance assistant · 3 findings in seconds"}
          </div>
        </div>

        {/* Findings strip */}
        <div
          style={{
            display: "flex",
            gap: 20,
            borderTop: "2px solid #e7e5e4",
            paddingTop: 32,
          }}
        >
          {/* Finding 1 */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              flex: 1,
              borderLeft: "4px solid #0ea5e9",
              paddingLeft: 16,
            }}
          >
            <div style={{ fontSize: 16, fontWeight: 700, color: "#0c4a6e" }}>
              {hasYours ? "Yours vs typical" : "Typical margins"}
            </div>
            <div
              style={{
                marginTop: 8,
                fontSize: 40,
                fontWeight: 800,
                color: "#0c0a09",
                letterSpacing: "-0.03em",
              }}
            >
              {hasYours
                ? `${gross != null ? `${gross}%` : "—"} / ${net != null ? `${net}%` : "—"}`
                : `${formatPct(bench.avgGrossMargin)} / ${formatPct(bench.avgNetMargin)}`}
            </div>
            <div style={{ marginTop: 4, fontSize: 16, color: "#78716c" }}>
              {hasYours
                ? `typical ${formatPct(bench.avgGrossMargin)} / ${formatPct(bench.avgNetMargin)}`
                : "gross / net"}
            </div>
          </div>

          {/* Finding 2 */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              flex: 1,
              borderLeft: "4px solid #f59e0b",
              paddingLeft: 16,
            }}
          >
            <div style={{ fontSize: 16, fontWeight: 700, color: "#92400e" }}>Watch for</div>
            <div
              style={{
                marginTop: 8,
                fontSize: 20,
                fontWeight: 600,
                color: "#292524",
                lineHeight: 1.3,
              }}
            >
              {bench.watchFor}
            </div>
          </div>

          {/* Finding 3 */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              flex: 1,
              borderLeft: "4px solid #e11d48",
              paddingLeft: 16,
            }}
          >
            <div style={{ fontSize: 16, fontWeight: 700, color: "#9f1239" }}>Overdue exposure</div>
            <div
              style={{
                marginTop: 8,
                fontSize: 32,
                fontWeight: 800,
                color: "#0c0a09",
                letterSpacing: "-0.02em",
              }}
            >
              ~{formatPct(bench.avgOverdueRate)}
            </div>
            <div style={{ marginTop: 4, fontSize: 16, color: "#78716c" }}>
              {bench.avgReceivablesDays}d avg receivables
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            marginTop: "auto",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: 20,
            color: "#a8a29e",
          }}
        >
          <div>Connect Xero — Siki checks your actual books →</div>
          <div style={{ fontWeight: 700, color: "#57534e" }}>sikizana.persidian.com</div>
        </div>
      </div>
    ),
    SIZE,
  );
}
