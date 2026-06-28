"use client";

import { useState, useEffect } from "react";

interface RevenueData {
  total_payments: number;
  confirmed_count: number;
  total_revenue_kes: number | null;
  pending_count: number;
  failed_count: number;
}

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8080";

export function RevenueBadge() {
  const [revenue, setRevenue] = useState<RevenueData | null>(null);

  useEffect(() => {
    const fetchRevenue = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/revenue`);
        const data = await res.json();
        setRevenue(data);
      } catch {
        // silently fail - badge is non-critical
      }
    };
    fetchRevenue();
    const interval = setInterval(fetchRevenue, 15000);
    return () => clearInterval(interval);
  }, []);

  if (!revenue || revenue.total_payments === 0) {
    return null;
  }

  const totalKes = revenue.total_revenue_kes || 0;

  return (
    <div className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-lg">
      <svg className="w-3 h-3 text-emerald-600" fill="currentColor" viewBox="0 0 20 20">
        <path d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" fillRule="evenodd" />
      </svg>
      <span className="text-[11px] font-semibold text-emerald-700">
        {totalKes.toLocaleString()} KES
      </span>
      <span className="text-[10px] text-emerald-500">
        ({revenue.confirmed_count} paid)
      </span>
    </div>
  );
}
