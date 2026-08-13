import { ImageResponse } from "next/og";
import {
  formatPct,
  marginNoteRead,
  parseMarginPct,
  resolveSnapshotSector,
} from "@/lib/sector-benchmarks";

export const runtime = "edge";

const SIZE = { width: 1200, height: 630 };

/**
 * Dynamic OG card for WhatsApp / Twitter unfurls.
 * /api/og/margin?sector=catering&g=42&n=6
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const resolved = resolveSnapshotSector(searchParams.get("sector") ?? "hospitality");
  if (!resolved) {
    return new Response("Unknown sector", { status: 404 });
  }

  const gross = parseMarginPct(searchParams.get("g"));
  const net = parseMarginPct(searchParams.get("n"));
  const { label, bench } = resolved;
  const read = marginNoteRead(bench, gross, net);
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
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 36,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div
              style={{
                fontSize: 22,
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
                marginTop: 8,
                fontSize: 52,
                fontWeight: 800,
                color: "#0c0a09",
                letterSpacing: "-0.03em",
                lineHeight: 1.05,
              }}
            >
              Are these margins normal?
            </div>
            <div style={{ marginTop: 10, fontSize: 28, fontWeight: 600, color: "#57534e" }}>
              {label} · typical UK
            </div>
          </div>
          <div
            style={{
              fontSize: 20,
              fontWeight: 600,
              color: "#a8a29e",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          >
            Typical UK · indicative
          </div>
        </div>

        <div
          style={{
            display: "flex",
            gap: 48,
            borderTop: "2px solid #e7e5e4",
            borderBottom: "2px solid #e7e5e4",
            paddingTop: 28,
            paddingBottom: 28,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 20, fontWeight: 600, color: "#78716c" }}>Gross</div>
            <div
              style={{
                marginTop: 4,
                fontSize: 72,
                fontWeight: 800,
                color: "#0c0a09",
                letterSpacing: "-0.04em",
              }}
            >
              {formatPct(bench.avgGrossMargin)}
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 20, fontWeight: 600, color: "#78716c" }}>Net</div>
            <div
              style={{
                marginTop: 4,
                fontSize: 72,
                fontWeight: 800,
                color: "#0c0a09",
                letterSpacing: "-0.04em",
              }}
            >
              {formatPct(bench.avgNetMargin)}
            </div>
          </div>
          {hasYours ? (
            <div style={{ display: "flex", flexDirection: "column", marginLeft: "auto" }}>
              <div style={{ fontSize: 20, fontWeight: 600, color: "#0369a1" }}>Yours</div>
              <div
                style={{
                  marginTop: 4,
                  fontSize: 48,
                  fontWeight: 800,
                  color: "#0c4a6e",
                  letterSpacing: "-0.03em",
                }}
              >
                {gross != null ? `${gross}%` : "—"} / {net != null ? `${net}%` : "—"}
              </div>
            </div>
          ) : null}
        </div>

        <div
          style={{
            marginTop: 28,
            display: "flex",
            flexDirection: "column",
            fontSize: 28,
            fontWeight: 600,
            color: "#292524",
            lineHeight: 1.35,
            maxWidth: 1000,
          }}
        >
          <div style={{ fontSize: 20, fontWeight: 700, color: "#0369a1", marginBottom: 8 }}>
            {"Siki's read"}
          </div>
          <div>{read}</div>
        </div>

        <div
          style={{
            marginTop: "auto",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: 22,
            color: "#a8a29e",
          }}
        >
          <div>Compare to your Xero books →</div>
          <div style={{ fontWeight: 700, color: "#57534e" }}>sikizana.persidian.com</div>
        </div>
      </div>
    ),
    SIZE,
  );
}
