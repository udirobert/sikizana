"use client";

import { useEffect, useState } from "react";
import { endpoints, type RevenueSummary, type Testimonial } from "@/lib/api";

interface RevenueWithExtras extends RevenueSummary {
  feedback?: { up: number; down: number; total: number };
  testimonials?: { total: number; approved_public: number };
  funnel?: Record<string, number>;
}

const FUNNEL_FALLBACK = {
  contacted: 0,
  interested: 0,
  demoed: 0,
  paid: 0,
  testimonial: 0,
  inactive: 0,
};

export default function ImpactPage() {
  const [data, setData] = useState<RevenueWithExtras | null>(null);
  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
  const [error, setError] = useState("");

  const load = async () => {
    try {
      const [rev, tList] = await Promise.all([
        endpoints.revenue(),
        endpoints.testimonials.list(true),
      ]);
      setData(rev);
      setTestimonials(tList);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load data");
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    const id = setInterval(() => void load(), 30_000);
    return () => clearInterval(id);
  }, []);

  const totalKes = data?.total_revenue_kes ?? 0;
  const paidCount = data?.confirmed_count ?? 0;
  const approvedTestiCount = data?.testimonials?.approved_public ?? 0;
  const feedbackTotal = data?.feedback?.total ?? 0;
  const feedbackUp = data?.feedback?.up ?? 0;
  const feedbackRatio =
    feedbackTotal > 0 ? Math.round((feedbackUp / feedbackTotal) * 100) : null;
  const funnel: Record<string, number> = (data?.funnel ?? FUNNEL_FALLBACK) as Record<string, number>;

  return (
    <div style={{ padding: "32px 20px 80px", maxWidth: 900, margin: "0 auto" }}>
      <header style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700 }}>Real impact from real groups</h1>
        <p style={{ fontSize: 15, color: "var(--muted)", marginTop: 6 }}>
          Live numbers from Sikizana&apos;s Daraja M-Pesa settlement ledger.
          Updated every 30 seconds.
        </p>
      </header>

      {error ? (
        <div
          style={{
            background: "#fef3c7",
            border: "1px solid #fbbf24",
            padding: 12,
            borderRadius: 10,
            marginBottom: 20,
            fontSize: 13,
          }}
        >
          Could not reach the backend right now. Showing cached values.
        </div>
      ) : null}

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 14,
          marginBottom: 32,
        }}
      >
        <StatCard label="Total revenue" value={`KES ${totalKes.toLocaleString()}`} />
        <StatCard label="Paid mediations" value={paidCount.toString()} />
        <StatCard label="Approved testimonials" value={approvedTestiCount.toString()} />
        <StatCard
          label="Thumbs-up rate"
          value={feedbackRatio !== null ? `${feedbackRatio}%` : "—"}
          sub={`${feedbackUp} of ${feedbackTotal}`}
        />
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>
          Lead funnel
        </h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(6, minmax(0, 1fr))",
            gap: 8,
          }}
        >
          {Object.entries(FUNNEL_FALLBACK).map(([key]) => (
            <div
              key={key}
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: 10,
                padding: 14,
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 4, textTransform: "capitalize" }}>
                {key}
              </div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>
                {funnel[key] ?? 0}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>
          What groups are saying
        </h2>
        {testimonials.length === 0 ? (
          <p
            style={{
              background: "var(--surface)",
              border: "1px dashed var(--border)",
              padding: 18,
              borderRadius: 12,
              color: "var(--muted)",
              fontSize: 14,
            }}
          >
            No testimonials published yet. The first batch will appear here as
            soon as a paid dispute is resolved and the customer gives
            permission.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {testimonials.map((t) => (
              <figure
                key={t.id}
                style={{
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                  padding: 18,
                  margin: 0,
                }}
              >
                <blockquote
                  style={{
                    fontSize: 15,
                    lineHeight: 1.6,
                    margin: 0,
                    color: "var(--foreground)",
                  }}
                >
                  &ldquo;{t.quote}&rdquo;
                </blockquote>
                <figcaption
                  style={{
                    fontSize: 12,
                    color: "var(--muted)",
                    marginTop: 10,
                  }}
                >
                  — {t.contact_name || "Anonymous"} · {t.chama_name}
                </figcaption>
              </figure>
            ))}
          </div>
        )}
      </section>

      <section
        style={{
          background: "var(--primary-light)",
          borderRadius: 14,
          padding: 22,
          textAlign: "center",
        }}
      >
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>
          Bring Sikizana to your group
        </h2>
        <p style={{ fontSize: 14, color: "var(--foreground)", marginBottom: 12 }}>
          Resolve disputes in minutes, with a written verdict you can pin to the
          group record.
        </p>
        <a
          href="/arbitrate"
          style={{
            display: "inline-block",
            background: "var(--primary)",
            color: "white",
            padding: "10px 22px",
            borderRadius: 10,
            fontSize: 14,
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          Try a free sample
        </a>
      </section>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 14,
        padding: 16,
      }}
    >
      <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 24, fontWeight: 700 }}>{value}</div>
      {sub ? (
        <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
          {sub}
        </div>
      ) : null}
    </div>
  );
}
