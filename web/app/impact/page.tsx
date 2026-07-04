"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { endpoints, type ImpactMetrics } from "@/lib/api";

export default function ImpactPage() {
  const [data, setData] = useState<ImpactMetrics | null>(null);
  const [error, setError] = useState("");

  const load = async () => {
    try {
      const metrics = await endpoints.impact();
      setData(metrics);
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

  const moneyFound = data?.money_found ?? 0;
  const overdueCount = data?.overdue_count ?? 0;
  const discrepanciesFound = data?.discrepancies_found ?? 0;
  const taxSavings = data?.estimated_tax_savings ?? 0;
  const feedbackTotal = data?.feedback?.total ?? 0;
  const feedbackUp = data?.feedback?.up ?? 0;
  const feedbackRatio =
    feedbackTotal > 0 ? Math.round((feedbackUp / feedbackTotal) * 100) : null;

  return (
    <div style={{ padding: "32px 20px 80px", maxWidth: 900, margin: "0 auto" }}>
      <header style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700 }}>Siki&apos;s Impact</h1>
        <p style={{ fontSize: 15, color: "var(--muted)", marginTop: 6 }}>
          Live numbers from Sikizana&apos;s Xero reconciliation engine.
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
        <StatCard
          label="Money Found"
          value={`£${moneyFound.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
          sub={`${overdueCount} overdue invoice${overdueCount === 1 ? "" : "s"} identified`}
        />
        <StatCard
          label="Issues Caught"
          value={discrepanciesFound.toString()}
          sub="Discrepancies flagged before accountant"
        />
        <StatCard
          label="Est. Tax Savings"
          value={`£${taxSavings.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
          sub="From deductible expenses identified"
        />
        <StatCard
          label="Thumbs-up Rate"
          value={feedbackRatio !== null ? `${feedbackRatio}%` : "—"}
          sub={`${feedbackUp} of ${feedbackTotal} responses`}
        />
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>
          How it works
        </h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 12,
          }}
        >
          {[
            {
              step: "1",
              title: "Connect Xero",
              desc: "One-click OAuth. Siki reads your invoices, bank transactions, and P&L.",
            },
            {
              step: "2",
              title: "Ask in plain English",
              desc: "“What’s overdue?” “How much tax will I owe?” “What can I deduct?”",
            },
            {
              step: "3",
              title: "Siki acts",
              desc: "Flags discrepancies, estimates tax, posts journal entries — with your approval.",
            },
          ].map((item) => (
            <div
              key={item.step}
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: 12,
                padding: 18,
              }}
            >
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  background: "var(--primary)",
                  color: "white",
                  fontSize: 13,
                  fontWeight: 700,
                  marginBottom: 10,
                }}
              >
                {item.step}
              </div>
              <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>
                {item.title}
              </div>
              <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.5 }}>
                {item.desc}
              </div>
            </div>
          ))}
        </div>
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
          See it in action
        </h2>
        <p style={{ fontSize: 14, color: "var(--foreground)", marginBottom: 12 }}>
          Connect your Xero org and ask Siki anything about your books.
        </p>
        <Link
          href="/books"
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
          Open Bookkeeper
        </Link>
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
