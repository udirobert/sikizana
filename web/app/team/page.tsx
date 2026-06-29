"use client";

import { useEffect, useSyncExternalStore, useState } from "react";
import {
  isTeamAuthenticated,
  setTeamToken,
  clearTeamToken,
  type Lead,
  type LeadStatus,
  type ScoreboardRow,
  type FunnelSummary,
} from "@/lib/api";
import { endpoints } from "@/lib/api";
import { formatKenyanPhone, maskPhone } from "@/lib/phone";

const PIPELINE: LeadStatus[] = [
  "contacted",
  "interested",
  "demoed",
  "paid",
  "testimonial",
  "inactive",
];

const PIPELINE_LABELS: Record<LeadStatus, string> = {
  contacted: "Contacted",
  interested: "Interested",
  demoed: "Demoed",
  paid: "Paid",
  testimonial: "Testimonial",
  inactive: "Inactive",
};

const PIPELINE_COLORS: Record<LeadStatus, string> = {
  contacted: "#9ca3af",
  interested: "#3b82f6",
  demoed: "#8b5cf6",
  paid: "#059669",
  testimonial: "#d97706",
  inactive: "#78716c",
};

interface LeadFormState {
  chama_name: string;
  contact_name: string;
  contact_phone: string;
  contact_handle: string;
  language: "en" | "sw" | "sheng";
  county: string;
  source: string;
  notes: string;
  status: LeadStatus;
}

const EMPTY_LEAD_FORM: LeadFormState = {
  chama_name: "",
  contact_name: "",
  contact_phone: "",
  contact_handle: "",
  language: "sw",
  county: "",
  source: "team_form",
  notes: "",
  status: "contacted",
};

const OUTREACH_TEMPLATES = [
  {
    id: "whatsapp_pitch_sw",
    label: "WhatsApp intro (Swahili)",
    body: "Habari! Nina huduma inayoitwa Sikizana — AI arbitrator for chama disputes. Unaweza kueleza mzozo wenu kwa Kiswahili na kupata suluhisho la haraka. 100 KES tu kwa deep audit + IPFS certificate. Mtu atafikiria kujaribu?",
  },
  {
    id: "whatsapp_pitch_en",
    label: "WhatsApp intro (English)",
    body: "Hi! Sikizana is an AI arbitrator for chama/ROSCAs that settles disputes by following your constitution. Tell the dispute in English/Swahili/Sheng and get a written verdict in under a minute. 100 KES for the deep audit + downloadable certificate. Free sample at the link.",
  },
  {
    id: "price_objection",
    label: "When they ask about the price",
    body: "100 KES is a tenth of what a single in-person chama meeting costs once you factor in venue, snacks, and lost hours. The full audit takes 60 seconds and we send back a written ruling they can show the treasurer and the constitution.",
  },
  {
    id: "followup",
    label: "Follow-up (day 3)",
    body: "Habari yako? Nilikuwa nimewasiliana kuhusu Sikizana — arbitrator wa chama disputes anayepatikana kwa bei ndogo. Kama chama yenu ina swali lolote kuhusu uongozi au michango, hii ni njia rahisi kupata jibu la haraka. Twende tukusaidie leo?",
  },
  {
    id: "testimonial_ask",
    label: "After paid audit — ask for testimonial",
    body: "Asante kwa kutumia Sikizana! Unaweza kunisaidia kwa sentensi moja kuhusu uzoefu wenu? Quote fupi itasaidia chama zingine kujua huduma hii. Tutaitumia tu kwa idhini yako.",
  },
];

export default function TeamDashboard() {
  const [tokenInput, setTokenInput] = useState("");
  const [authError, setAuthError] = useState("");
  const [actorName, setActorNameState] = useState("");
  const [authVersion, setAuthVersion] = useState(0);

  // Subscribe to team-token changes in localStorage. This avoids useEffect
  // setState and re-runs whenever the user signs in or out in this tab.
  const authed = useSyncExternalStore(
    (onStoreChange) => {
      if (typeof window === "undefined") return () => {};
      const handler = () => {
        setAuthVersion((v) => v + 1);
        onStoreChange();
      };
      window.addEventListener("storage", handler);
      window.addEventListener("sikizana:auth", handler);
      return () => {
        window.removeEventListener("storage", handler);
        window.removeEventListener("sikizana:auth", handler);
      };
    },
    () => isTeamAuthenticated(),
    () => false,
  );
  void authVersion;

  // Subscribe to the stored actor name (which team member the user signed in as).
  const storedActorName = useSyncExternalStore(
    (onStoreChange) => {
      if (typeof window === "undefined") return () => {};
      const handler = () => onStoreChange();
      window.addEventListener("sikizana:storage", handler);
      return () => window.removeEventListener("sikizana:storage", handler);
    },
    () => window.localStorage.getItem("sikizana.team_actor") || "",
    () => "",
  );

  const setActorName = (name: string) => {
    setActorNameState(name);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("sikizana.team_actor", name);
      window.dispatchEvent(new Event("sikizana:storage"));
    }
  };

  // Initialise actor state once from localStorage on first render — no setState-in-effect.
  if (actorName === "" && storedActorName !== "") {
    setActorNameState(storedActorName);
  }

  const [leads, setLeads] = useState<Lead[]>([]);
  const [funnel, setFunnel] = useState<FunnelSummary | null>(null);
  const [scoreboard, setScoreboard] = useState<ScoreboardRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [formState, setFormState] = useState<LeadFormState>(EMPTY_LEAD_FORM);
  const [showForm, setShowForm] = useState(false);
  const [copiedTemplateId, setCopiedTemplateId] = useState<string | null>(null);

  const reloadAll = async () => {
    if (!isTeamAuthenticated()) return;
    setLoading(true);
    setError("");
    try {
      const [leadList, funnelRow, sb] = await Promise.all([
        endpoints.leads.list(),
        endpoints.leads.funnel(),
        endpoints.leads.scoreboard(),
      ]);
      setLeads(leadList);
      setFunnel(funnelRow);
      setScoreboard(sb);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load dashboard");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authed) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void reloadAll();
    }
  }, [authed]);

  const onSignIn = () => {
    if (!tokenInput.trim()) {
      setAuthError("Enter the shared team password");
      return;
    }
    setTeamToken(tokenInput.trim());
    setAuthVersion((v) => v + 1);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("sikizana:auth"));
      window.dispatchEvent(new Event("sikizana:storage"));
    }
    setAuthError("");
  };

  const onSignOut = () => {
    clearTeamToken();
    setAuthVersion((v) => v + 1);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("sikizana:auth"));
    }
    setLeads([]);
  };

  const onCreateLead = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      const normalisedPhone = formState.contact_phone
        ? formatKenyanPhone(formState.contact_phone) || formState.contact_phone
        : undefined;
      const newLead = await endpoints.leads.create({
        chama_name: formState.chama_name,
        contact_name: formState.contact_name || undefined,
        contact_phone: normalisedPhone,
        contact_handle: formState.contact_handle || undefined,
        language: formState.language,
        county: formState.county || undefined,
        source: formState.source || undefined,
        status: formState.status,
        notes: formState.notes || undefined,
        owner: actorName || undefined,
      });
      if (actorName) {
        await endpoints.leads.claim(newLead.id, actorName).catch(() => {});
      }
      setFormState(EMPTY_LEAD_FORM);
      setShowForm(false);
      await reloadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save lead");
    }
  };

  const onStatusChange = async (lead: Lead, newStatus: LeadStatus) => {
    if (lead.status === newStatus) return;
    try {
      await endpoints.leads.setStatus(lead.id, newStatus, actorName || "unknown");
      await reloadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update lead");
    }
  };

  const copyTemplate = async (templateId: string, body: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(body);
        setCopiedTemplateId(templateId);
        setTimeout(() => setCopiedTemplateId(null), 2000);
      } catch {
        // ignore
      }
    }
  };

  // ---- Render ----

  if (!authed) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px",
        }}
      >
        <div
          style={{
            maxWidth: 380,
            width: "100%",
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 16,
            padding: 28,
          }}
        >
          <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>
            Team dashboard
          </h1>
          <p
            style={{
              fontSize: 13,
              color: "var(--muted)",
              marginBottom: 20,
            }}
          >
            Sign in with the shared team password to view leads and pipeline.
          </p>
          <label
            style={{
              fontSize: 12,
              fontWeight: 600,
              display: "block",
              marginBottom: 6,
            }}
          >
            Your name
          </label>
          <input
            value={actorName}
            onChange={(e) => setActorName(e.target.value)}
            placeholder="e.g. Jane"
            style={inputStyle}
          />
          <label
            style={{
              fontSize: 12,
              fontWeight: 600,
              display: "block",
              marginTop: 14,
              marginBottom: 6,
            }}
          >
            Team password
          </label>
          <input
            type="password"
            value={tokenInput}
            onChange={(e) => setTokenInput(e.target.value)}
            placeholder="••••••••"
            style={inputStyle}
            onKeyDown={(e) => {
              if (e.key === "Enter") onSignIn();
            }}
          />
          {authError ? (
            <p style={{ color: "#dc2626", fontSize: 12, marginTop: 8 }}>{authError}</p>
          ) : null}
          <button
            onClick={onSignIn}
            style={{
              marginTop: 18,
              width: "100%",
              background: "var(--primary)",
              color: "white",
              padding: "12px 16px",
              borderRadius: 10,
              border: 0,
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Sign in
          </button>
          <p
            style={{
              fontSize: 11,
              color: "var(--muted)",
              marginTop: 14,
              textAlign: "center",
            }}
          >
            Need access? Ask the developer for the team password.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "24px 20px 80px", maxWidth: 1100, margin: "0 auto" }}>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 24,
        }}
      >
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700 }}>Team dashboard</h1>
          <p style={{ fontSize: 13, color: "var(--muted)", marginTop: 2 }}>
            Signed in as <strong>{actorName || "unassigned"}</strong> ·{" "}
            <button
              onClick={onSignOut}
              style={{
                background: "none",
                border: 0,
                color: "var(--muted)",
                fontSize: 13,
                cursor: "pointer",
                textDecoration: "underline",
              }}
            >
              sign out
            </button>
          </p>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          style={{
            background: "var(--primary)",
            color: "white",
            padding: "10px 16px",
            borderRadius: 10,
            border: 0,
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          {showForm ? "Cancel" : "+ Add lead"}
        </button>
      </header>

      {error ? (
        <div
          style={{
            background: "#fee2e2",
            color: "#991b1b",
            padding: 12,
            borderRadius: 10,
            marginBottom: 16,
            fontSize: 13,
          }}
        >
          {error}
        </div>
      ) : null}

      {showForm ? (
        <form
          onSubmit={onCreateLead}
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 14,
            padding: 20,
            marginBottom: 24,
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 14,
          }}
        >
          <Field label="Chama name" required>
            <input
              required
              value={formState.chama_name}
              onChange={(e) =>
                setFormState({ ...formState, chama_name: e.target.value })
              }
              placeholder="e.g. Mwangaza Women"
              style={inputStyle}
            />
          </Field>
          <Field label="Contact name">
            <input
              value={formState.contact_name}
              onChange={(e) =>
                setFormState({ ...formState, contact_name: e.target.value })
              }
              placeholder="Faith, John…"
              style={inputStyle}
            />
          </Field>
          <Field label="Phone (Safaricom)">
            <input
              type="tel"
              inputMode="numeric"
              value={formState.contact_phone}
              onChange={(e) =>
                setFormState({ ...formState, contact_phone: e.target.value })
              }
              placeholder="0712 345 678"
              style={inputStyle}
            />
          </Field>
          <Field label="WhatsApp / handle">
            <input
              value={formState.contact_handle}
              onChange={(e) =>
                setFormState({ ...formState, contact_handle: e.target.value })
              }
              placeholder="@faith_mwangaza"
              style={inputStyle}
            />
          </Field>
          <Field label="Language">
            <select
              value={formState.language}
              onChange={(e) =>
                setFormState({
                  ...formState,
                  language: e.target.value as "en" | "sw" | "sheng",
                })
              }
              style={inputStyle}
            >
              <option value="sw">Swahili</option>
              <option value="en">English</option>
              <option value="sheng">Sheng</option>
            </select>
          </Field>
          <Field label="County">
            <input
              value={formState.county}
              onChange={(e) =>
                setFormState({ ...formState, county: e.target.value })
              }
              placeholder="Nairobi, Mombasa…"
              style={inputStyle}
            />
          </Field>
          <Field label="Source / channel">
            <input
              value={formState.source}
              onChange={(e) =>
                setFormState({ ...formState, source: e.target.value })
              }
              placeholder="whatsapp_demo, referral…"
              style={inputStyle}
            />
          </Field>
          <Field label="Starting status">
            <select
              value={formState.status}
              onChange={(e) =>
                setFormState({ ...formState, status: e.target.value as LeadStatus })
              }
              style={inputStyle}
            >
              {PIPELINE.map((s) => (
                <option key={s} value={s}>
                  {PIPELINE_LABELS[s]}
                </option>
              ))}
            </select>
          </Field>
          <div style={{ gridColumn: "1 / -1" }}>
            <Field label="Notes">
              <textarea
                value={formState.notes}
                onChange={(e) =>
                  setFormState({ ...formState, notes: e.target.value })
                }
                placeholder="What was discussed, blocker, next step…"
                rows={3}
                style={{ ...inputStyle, resize: "vertical" }}
              />
            </Field>
          </div>
          <div style={{ gridColumn: "1 / -1", display: "flex", gap: 10 }}>
            <button
              type="submit"
              style={{
                background: "var(--primary)",
                color: "white",
                padding: "10px 18px",
                borderRadius: 10,
                border: 0,
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Save lead
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              style={{
                background: "transparent",
                color: "var(--muted)",
                padding: "10px 18px",
                borderRadius: 10,
                border: "1px solid var(--border)",
                fontSize: 14,
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      <SectionHeader>Pipeline overview</SectionHeader>
      {funnel ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(6, minmax(0, 1fr))",
            gap: 10,
            marginBottom: 24,
          }}
        >
          {PIPELINE.map((status) => (
            <div
              key={status}
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: 12,
                padding: "14px 12px",
                textAlign: "center",
              }}
            >
              <div
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  background: PIPELINE_COLORS[status],
                  margin: "0 auto 8px",
                }}
              />
              <div style={{ fontSize: 11, color: "var(--muted)" }}>
                {PIPELINE_LABELS[status]}
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, marginTop: 2 }}>
                {funnel[status] ?? 0}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <SectionHeader>Scoreboard</SectionHeader>
      <div
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 14,
          overflow: "hidden",
          marginBottom: 24,
        }}
      >
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: 13,
          }}
        >
          <thead>
            <tr style={{ background: "#f5f5f4", textAlign: "left" }}>
              <th style={thStyle}>Team member</th>
              <th style={thStyle}>Leads</th>
              <th style={thStyle}>Engaged</th>
              <th style={thStyle}>Paid conversions</th>
              <th style={thStyle}>Revenue (KES)</th>
              <th style={thStyle}>Payments</th>
            </tr>
          </thead>
          <tbody>
            {scoreboard.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  style={{ ...tdStyle, textAlign: "center", color: "var(--muted)" }}
                >
                  No data yet. Get some leads and convert them.
                </td>
              </tr>
            ) : (
              scoreboard.map((row) => (
                <tr key={row.owner}>
                  <td style={{ ...tdStyle, fontWeight: 600 }}>{row.owner}</td>
                  <td style={tdStyle}>{row.lead_count}</td>
                  <td style={tdStyle}>{row.engaged_count}</td>
                  <td style={tdStyle}>{row.paid_count}</td>
                  <td style={{ ...tdStyle, color: "var(--primary)", fontWeight: 600 }}>
                    {row.revenue_kes.toLocaleString()}
                  </td>
                  <td style={tdStyle}>{row.revenue_tx_count}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <SectionHeader>Lead list</SectionHeader>
      {loading ? (
        <p style={{ color: "var(--muted)" }}>Loading…</p>
      ) : leads.length === 0 ? (
        <p style={{ color: "var(--muted)" }}>
          No leads yet. Hit + Add lead to capture your first chama contact.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {leads.map((lead) => (
            <LeadCard
              key={lead.id}
              lead={lead}
              actor={actorName}
              onStatusChange={(next) => onStatusChange(lead, next)}
            />
          ))}
        </div>
      )}

      <SectionHeader>Outreach templates</SectionHeader>
      <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 10 }}>
        Tap to copy. Edit before sending for best results.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {OUTREACH_TEMPLATES.map((template) => (
          <div
            key={template.id}
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 12,
              padding: 14,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 6,
              }}
            >
              <strong style={{ fontSize: 13 }}>{template.label}</strong>
              <button
                onClick={() => copyTemplate(template.id, template.body)}
                style={{
                  background: copiedTemplateId === template.id ? "#d1fae5" : "#f5f5f4",
                  color: copiedTemplateId === template.id ? "#065f46" : "var(--foreground)",
                  border: 0,
                  padding: "6px 12px",
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {copiedTemplateId === template.id ? "Copied" : "Copy"}
              </button>
            </div>
            <p style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.5, margin: 0 }}>
              {template.body}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function LeadCard({
  lead,
  actor,
  onStatusChange,
}: {
  lead: Lead;
  actor: string;
  onStatusChange: (status: LeadStatus) => void;
}) {
  const canClaim = !lead.owner && actor;
  const onClaim = async () => {
    try {
      await endpoints.leads.claim(lead.id, actor);
      window.location.reload();
    } catch {
      // ignore
    }
  };

  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        padding: 14,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 15 }}>{lead.chama_name}</div>
          {lead.contact_name ? (
            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
              {lead.contact_name}
              {lead.contact_phone ? ` · ${maskPhone(lead.contact_phone)}` : ""}
              {lead.contact_handle ? ` · ${lead.contact_handle}` : ""}
            </div>
          ) : null}
          {lead.notes ? (
            <p
              style={{
                fontSize: 12,
                color: "var(--muted)",
                marginTop: 6,
                lineHeight: 1.5,
              }}
            >
              {lead.notes}
            </p>
          ) : null}
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 6,
              marginTop: 8,
              fontSize: 11,
              color: "var(--muted)",
            }}
          >
            {lead.owner ? (
              <span
                style={{
                  background: "#d1fae5",
                  color: "#065f46",
                  padding: "2px 8px",
                  borderRadius: 6,
                  fontWeight: 600,
                }}
              >
                {lead.owner}
              </span>
            ) : (
              <span
                style={{
                  background: "#fef3c7",
                  color: "#92400e",
                  padding: "2px 8px",
                  borderRadius: 6,
                  fontWeight: 600,
                }}
              >
                unclaimed
              </span>
            )}
            {lead.county ? <span>· {lead.county}</span> : null}
            {lead.language ? <span>· {lead.language.toUpperCase()}</span> : null}
            {lead.source ? <span>· {lead.source}</span> : null}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
          <select
            value={lead.status}
            onChange={(e) => onStatusChange(e.target.value as LeadStatus)}
            style={{
              padding: "6px 10px",
              borderRadius: 8,
              border: "1px solid var(--border)",
              background: "var(--surface)",
              fontSize: 12,
              fontWeight: 600,
              color: PIPELINE_COLORS[lead.status],
              cursor: "pointer",
            }}
          >
            {PIPELINE.map((s) => (
              <option key={s} value={s}>
                {PIPELINE_LABELS[s]}
              </option>
            ))}
          </select>
          {canClaim ? (
            <button
              onClick={onClaim}
              style={{
                background: "transparent",
                border: 0,
                color: "var(--primary)",
                fontSize: 11,
                fontWeight: 600,
                cursor: "pointer",
                padding: 0,
              }}
            >
              Claim this lead
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label style={{ display: "block" }}>
      <span
        style={{
          fontSize: 12,
          fontWeight: 600,
          display: "block",
          marginBottom: 4,
          color: "var(--muted)",
        }}
      >
        {label}
        {required ? " *" : ""}
      </span>
      {children}
    </label>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <h2
      style={{
        fontSize: 14,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: 0.6,
        color: "var(--muted)",
        marginBottom: 10,
        marginTop: 4,
      }}
    >
      {children}
    </h2>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  border: "1px solid var(--border)",
  borderRadius: 10,
  fontSize: 14,
  background: "var(--background)",
  color: "var(--foreground)",
  outline: "none",
};

const thStyle: React.CSSProperties = {
  padding: "12px 14px",
  fontSize: 11,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: 0.6,
  color: "var(--muted)",
};

const tdStyle: React.CSSProperties = {
  padding: "12px 14px",
  borderTop: "1px solid var(--border)",
};
