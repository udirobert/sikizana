import type { Finding, FindingKind } from "@/lib/api";

export type Persona = "siki" | "zana";

export const PERSONA_STORAGE_KEY = "sikizana.persona";

export type PersonaCopy = {
  name: string;
  memoryLink: string;
  activityLink: string;
  memoryPageTitle: string;
  memoryPageIntro: string;
  memoryEmpty: string;
  memoryUnavailable: string;
  activityIntroLive: string;
  activityIntroDemo: string;
  activityEmpty: string;
  activityReverse: string;
  memoryRecallExpanded: string;
  memoryRecallCompact: (count: number) => string;
  upgradeBanner: (amount: string, booksLabel: string) => string;
};

/** Voice + navigation copy keyed to the active persona. */
export function getPersonaCopy(persona: Persona): PersonaCopy {
  if (persona === "zana") {
    return {
      name: "Zana",
      memoryLink: "What Zana remembers →",
      activityLink: "Zana's actions →",
      memoryPageTitle: "What Zana Remembers",
      memoryPageIntro:
        "Zana uses Supermemory Local to recall chasing outcomes, customer payment patterns, and uncomfortable truths from past sessions. Everything here is stored on your machine — inspect and delete any memory at any time.",
      memoryEmpty:
        "Have a conversation with Zana and check back — memories are extracted and indexed after each session.",
      memoryUnavailable:
        "Zana is working without memory — every session starts fresh. Start Supermemory Local to enable persistent recall.",
      activityIntroLive:
        "Everything Zana has done in this session — chases sent, queries, tool calls, and journal entries.",
      activityIntroDemo:
        "Activity from your demo session — sample actions on sample data.",
      activityEmpty:
        "No activity yet. When Zana chases invoices or you approve journal entries, they'll appear here.",
      activityReverse: "↩ Reverse with Zana",
      memoryRecallExpanded: "What Zana remembered",
      memoryRecallCompact: (count) =>
        `Zana recalled ${count} ${count === 1 ? "memory" : "memories"} from past sessions`,
      upgradeBanner: (amount, booksLabel) =>
        `Zana flagged £${amount} in ${booksLabel} — upgrade to Pro to let Zana fix these.`,
    };
  }
  return {
    name: "Siki",
    memoryLink: "What Siki remembers →",
    activityLink: "View audit trail →",
    memoryPageTitle: "What Siki Remembers",
    memoryPageIntro:
      "Siki uses Supermemory Local to recall past conversations, customer payment patterns, and your preferences across sessions. Everything here is stored on your machine — you can inspect and delete any memory at any time.",
    memoryEmpty:
      "Have a conversation with Siki and check back — memories are extracted and indexed after each session.",
    memoryUnavailable:
      "Siki is working without memory — every session starts fresh. Start Supermemory Local to enable persistent memory and semantic tax RAG.",
    activityIntroLive:
      "Everything Siki has done in this session — queries, tool calls, and journal entries.",
    activityIntroDemo:
      "Activity from your demo session — these are sample actions on sample data.",
    activityEmpty:
      "No activity yet. When you ask Siki questions and approve journal entries, they'll appear here.",
    activityReverse: "↩ Reverse with Siki",
    memoryRecallExpanded: "What Siki remembered",
    memoryRecallCompact: (count) =>
      `Recalled ${count} ${count === 1 ? "memory" : "memories"} from past sessions`,
    upgradeBanner: (amount, booksLabel) =>
      `Siki found £${amount} in ${booksLabel} — upgrade to Pro to let Siki fix these.`,
  };
}

/** Tailwind class bundles — keeps persona chrome consistent across /books. */
export function getPersonaTheme(persona: Persona) {
  if (persona === "zana") {
    return {
      btnPrimary: "bg-rose-600 text-white hover:bg-rose-700",
      userBubble: "bg-stone-800 text-white rounded-tr-sm",
      focusInput: "focus:ring-rose-500 focus:border-rose-500",
      hintText: "text-rose-500",
      hintTextStrong: "text-rose-600 hover:text-rose-800",
      hintBg: "bg-rose-50 border-rose-200",
      hintTextOnBg: "text-rose-900",
      insightBox: "text-rose-800 bg-rose-50",
      insightIcon: "text-rose-400",
      link: "text-rose-600 hover:text-rose-700",
      toastBorder: "border-rose-200",
      toastIconBg: "bg-rose-50",
      sampleHover: "group-hover:text-rose-500",
      modeHintBar: "bg-rose-50 border-rose-100 text-stone-700",
      findingsTitle: "What Zana Flagged",
      findingsExpand: "text-rose-600 hover:text-rose-700",
      statusPulse: "bg-rose-500",
      statusDot: "bg-rose-500",
      toggleActive: "bg-rose-600 text-white shadow-sm",
      toggleActiveSub: "text-rose-100",
      proactiveLabel: "Zana noticed",
    };
  }
  return {
    btnPrimary: "bg-sky-600 text-white hover:bg-sky-700",
    userBubble: "bg-sky-600 text-white rounded-tr-sm",
    focusInput: "focus:ring-sky-500 focus:border-sky-500",
    hintText: "text-sky-500",
    hintTextStrong: "text-sky-600 hover:text-sky-800",
    hintBg: "bg-sky-50 border-sky-200",
    hintTextOnBg: "text-sky-900",
    insightBox: "text-sky-700 bg-sky-50",
    insightIcon: "text-sky-400",
    link: "text-sky-600 hover:text-sky-700",
    toastBorder: "border-sky-200",
    toastIconBg: "bg-sky-50",
    sampleHover: "group-hover:text-sky-500",
    modeHintBar: "bg-stone-50 border-stone-100 text-stone-600",
    findingsTitle: "What Siki Found",
    findingsExpand: "text-sky-600 hover:text-sky-700",
    statusPulse: "bg-sky-500",
    statusDot: "bg-sky-400",
    toggleActive: "bg-orange-400 text-white shadow-sm",
    toggleActiveSub: "text-orange-100",
    proactiveLabel: "Siki noticed",
  };
}

/** Persona-specific primary action label on finding cards. */
export function findingActionLabel(
  persona: Persona,
  label: string,
  kind: FindingKind
): string {
  if (persona === "zana") {
    if (label === "Chase now" || kind === "overdue_invoice") return "Draft chase";
    if (label === "Explain") return "Investigate";
    if (label === "Fix now") return "Fix this";
    return label;
  }
  if (label === "Chase now") return "Explain this";
  if (label === "Fix now") return "Explain flag";
  return label;
}

/** One-line empty-state gloss when the audit is clean. */
export function cleanFindingsCopy(persona: Persona): string {
  return persona === "zana"
    ? "Nothing overdue right now — but I'll flag it the moment something slips."
    : "Your books look clean — here's what to explore next.";
}

export type AnalysisCardType =
  | "sector_benchmark"
  | "customer_scorecard"
  | "trend_analysis"
  | "receivables_aging";

type AnalysisCardMeta = {
  title: string;
  badgeClass: string;
  headerBorder: string;
  debtorsHeading: string;
  fireWarning: string;
  portfolioSubtitle: (redCount: number, fireCount: number) => string;
};

const ANALYSIS_CARD_SIKI: Record<
  AnalysisCardType,
  Pick<AnalysisCardMeta, "title" | "badgeClass">
> = {
  sector_benchmark: {
    title: "Siki's sector benchmark",
    badgeClass: "bg-sky-100 text-sky-700",
  },
  customer_scorecard: {
    title: "Siki's customer scorecard",
    badgeClass: "bg-violet-100 text-violet-700",
  },
  trend_analysis: {
    title: "Siki's trend analysis",
    badgeClass: "bg-indigo-100 text-indigo-700",
  },
  receivables_aging: {
    title: "Siki's aged receivables",
    badgeClass: "bg-emerald-100 text-emerald-700",
  },
};

const ANALYSIS_CARD_ZANA: Record<
  AnalysisCardType,
  Pick<AnalysisCardMeta, "title" | "badgeClass">
> = {
  sector_benchmark: {
    title: "Industry check",
    badgeClass: "bg-stone-200 text-stone-700",
  },
  customer_scorecard: {
    title: "Zana's customer hit list",
    badgeClass: "bg-rose-100 text-rose-700",
  },
  trend_analysis: {
    title: "Zana's trend watch",
    badgeClass: "bg-rose-100 text-rose-700",
  },
  receivables_aging: {
    title: "Zana's overdue snapshot",
    badgeClass: "bg-rose-100 text-rose-700",
  },
};

/** Persona-aware labels for inline chat analysis cards. */
export function getAnalysisCardMeta(
  persona: Persona,
  type: AnalysisCardType,
): AnalysisCardMeta {
  const base = persona === "zana" ? ANALYSIS_CARD_ZANA[type] : ANALYSIS_CARD_SIKI[type];
  const chaseCard =
    type === "customer_scorecard" || type === "receivables_aging";
  return {
    ...base,
    headerBorder:
      persona === "zana" && chaseCard
        ? "border-rose-100 bg-rose-50/40"
        : "border-stone-100 bg-stone-50/50",
    debtorsHeading:
      persona === "zana"
        ? "Who to chase first (largest first)"
        : "Who owes you (largest first)",
    fireWarning:
      persona === "zana"
        ? "Drop them — cost exceeds 10% of revenue"
        : "Firing candidate — cost exceeds 10% of revenue",
    portfolioSubtitle: (redCount, fireCount) =>
      persona === "zana"
        ? `${redCount} problem accounts · ${fireCount} to cut loose`
        : `${redCount} red · ${fireCount} firing candidates`,
  };
}

/** Headline + tagline for the auto-chase confirmation banner. */
export function getAutoChaseCopy(
  persona: Persona,
  invoiceNumber?: string,
): { headline: string; tagline: string } {
  if (persona === "zana") {
    return {
      headline: invoiceNumber
        ? `Chase sequence armed · ${invoiceNumber}`
        : "Chase sequence armed",
      tagline:
        "I'll escalate until they pay — review every step in Activity.",
    };
  }
  return {
    headline: "Follow-ups scheduled",
    tagline: "Logged to your audit trail — see Activity for details.",
  };
}

/** Full-screen modal when a chased invoice gets paid. */
export function getRecoveredCelebrationCopy(persona: Persona): {
  headline: string;
  subline: string;
  button: string;
  panelClass: string;
  amountClass: string;
  buttonClass: string;
} {
  if (persona === "zana") {
    return {
      headline: "recovered since your last visit",
      subline: "They paid. I stopped the chase sequence automatically.",
      button: "Nice →",
      panelClass: "bg-white",
      amountClass: "text-rose-700",
      buttonClass: "bg-rose-600 text-white hover:bg-rose-700",
    };
  }
  return {
    headline: "recovered since your last visit 🎉",
    subline: "A chased invoice got paid. Siki's follow-ups stopped automatically.",
    button: "Brilliant →",
    panelClass: "bg-white",
    amountClass: "text-emerald-700",
    buttonClass: "bg-emerald-600 text-white hover:bg-emerald-700",
  };
}

/** NegotiationEmailCard — chase drafts are Zana-native; Siki stays softer. */
export function getNegotiationCardCopy(persona: Persona): {
  headerTitle: string;
  psychologyToggle: string;
  copyButton: string;
  mailtoButton: string;
  noEmailHint: string;
  headerBorder: string;
  headerBadgeClass: string;
  psychologyLinkClass: string;
  psychologyPanelClass: string;
  mailtoClass: string;
  footerClass: string;
} {
  if (persona === "zana") {
    return {
      headerTitle: "Zana's chase draft",
      psychologyToggle: "Why this lands",
      copyButton: "Copy email",
      mailtoButton: "Send from your inbox →",
      noEmailHint: "No email on file — copy and send manually",
      headerBorder: "border-rose-100 bg-rose-50/40",
      headerBadgeClass: "bg-rose-100 text-rose-700",
      psychologyLinkClass: "text-rose-600 hover:text-rose-700",
      psychologyPanelClass: "bg-rose-50/50 border-rose-100",
      mailtoClass: "bg-rose-600 text-white hover:bg-rose-700",
      footerClass: "border-rose-100 bg-rose-50/30",
    };
  }
  return {
    headerTitle: "Siki's reminder draft",
    psychologyToggle: "Why this works",
    copyButton: "Copy email",
    mailtoButton: "Open in email client →",
    noEmailHint: "No email on file — copy and send manually",
    headerBorder: "border-stone-100 bg-stone-50/50",
    headerBadgeClass: "bg-sky-100 text-sky-700",
    psychologyLinkClass: "text-violet-600 hover:text-violet-700",
    psychologyPanelClass: "bg-violet-50/50 border-violet-100",
    mailtoClass: "bg-sky-600 text-white hover:bg-sky-700",
    footerClass: "border-stone-100 bg-stone-50/50",
  };
}

/** JournalEntryCard — approve/post moment voice. */
export function getJournalCardCopy(persona: Persona): {
  headerTitle: string;
  awaitingApproval: string;
  postedLive: string;
  postedDemo: string;
  approveButton: string;
  headerBorder: string;
  approveClass: string;
} {
  if (persona === "zana") {
    return {
      headerTitle: "Journal entry — needs your OK",
      awaitingApproval: "Awaiting approval",
      postedLive: "✓ Posted to Xero",
      postedDemo: "Simulated — demo mode",
      approveButton: "Approve & post",
      headerBorder: "border-stone-200 bg-stone-50",
      approveClass: "bg-rose-600 hover:bg-rose-700",
    };
  }
  return {
    headerTitle: "Proposed journal entry",
    awaitingApproval: "Awaiting approval",
    postedLive: "✓ Posted to Xero",
    postedDemo: "Simulated — demo mode",
    approveButton: "Approve & Post",
    headerBorder: "border-stone-200 bg-stone-50",
    approveClass: "bg-emerald-600 hover:bg-emerald-700",
  };
}

/** ResponseSummary — peak-end card after agent answers. */
export function getResponseSummaryCopy(persona: Persona): {
  label: string;
  atStake: string;
  urgentLine: (count: number) => string;
  panelClass: string;
} {
  if (persona === "zana") {
    return {
      label: "What Zana sees in your books",
      atStake: "slipping away",
      urgentLine: (n) =>
        `${n} need${n === 1 ? "s" : ""} chasing now`,
      panelClass: "border-rose-200/60 bg-gradient-to-br from-rose-50/40 to-white",
    };
  }
  return {
    label: "Books status",
    atStake: "at stake",
    urgentLine: (n) =>
      `${n} need${n === 1 ? "s" : ""} urgent attention`,
    panelClass: "border-stone-200 bg-gradient-to-br from-stone-50 to-white",
  };
}

export type LandingPersonaPath = {
  persona: Persona;
  name: string;
  role: string;
  headline: string;
  description: string;
  bullets: string[];
  cta: string;
  demoHref: string;
  connectHref: string;
  cardClass: string;
  badgeClass: string;
  btnClass: string;
  quote: string;
};

/** Dual entry paths on the landing page — Siki explain vs Zana chase. */
export function getLandingPersonaPaths(): LandingPersonaPath[] {
  return [
    {
      persona: "siki",
      name: "Siki",
      role: "The Explainer",
      headline: "Explain my books",
      description:
        "Plain-English P&L, tax estimates, sector benchmarks, and a calm read on what's normal for your industry.",
      bullets: [
        "P&L and balance sheet in plain English",
        "Tax flags and sector benchmarks",
        "Customer scorecards and trend analysis",
      ],
      cta: "Start with Siki",
      demoHref: "/books?persona=siki",
      connectHref: "/books?persona=siki&connect=1",
      cardClass: "border-sky-200 hover:border-sky-300 hover:shadow-lg hover:shadow-sky-100/50",
      badgeClass: "bg-sky-100 text-sky-700",
      btnClass: "bg-sky-600 hover:bg-sky-700 text-white shadow-sky-600/20",
      quote: "You're owed £4,200 — here's who, for how long, and what's normal for your sector.",
    },
    {
      persona: "zana",
      name: "Zana",
      role: "The Enforcer",
      headline: "Chase what's owed",
      description:
        "Aged receivables, negotiation-tactic chase emails, auto-escalation until they pay — with statutory interest built in.",
      bullets: [
        "Aged receivables — who to chase first",
        "Draft emails with negotiation psychology",
        "One-click auto-chase escalation ladder",
      ],
      cta: "Start with Zana",
      demoHref: "/books?persona=zana",
      connectHref: "/books?persona=zana&connect=1",
      cardClass: "border-rose-200 hover:border-rose-300 hover:shadow-lg hover:shadow-rose-100/50",
      badgeClass: "bg-rose-100 text-rose-700",
      btnClass: "bg-rose-600 hover:bg-rose-700 text-white shadow-rose-600/20",
      quote: "45 days late. Here's the email. You're also owed £70 compensation — I added it.",
    },
  ];
}

/** Neutral Sikizana voice for public aggregate pages (impact charts). */
export function getTrendBuildingCopy(snapshotCount: number): {
  title: string;
  body: string;
} {
  if (snapshotCount === 0) {
    return {
      title: "Trend building",
      body: "Daily snapshots start when you connect Xero or open your books. Check back after a few days to see movement.",
    };
  }
  if (snapshotCount === 1) {
    return {
      title: "First snapshot captured",
      body: "One data point so far — trends appear after your next daily snapshot or when you chase, post, or reconnect.",
    };
  }
  return {
    title: "Trend building",
    body: "Not enough history yet for a chart — keep using Sikizana and snapshots will fill in.",
  };
}

/** Post-OAuth connect overlay on /books. */
export function getConnectMomentCopy(
  persona: Persona,
  isDemo: boolean,
): {
  analyzingTitle: string;
  analyzingSub: string;
  revealMoneySub: string;
  revealIssuesTitle: string;
  revealCleanTitle: string;
  revealCleanSub: string;
  showMe: string;
  ariaLabel: string;
} {
  if (persona === "zana") {
    return {
      analyzingTitle: "Connected ✓ Scanning who owes you…",
      analyzingSub: "Pulling overdue invoices, debtors, and chase targets",
      revealMoneySub: isDemo
        ? "found in sample overdue invoices"
        : "overdue — ready to chase",
      revealIssuesTitle: isDemo
        ? "Targets in the sample books"
        : "Here's who to chase first",
      revealCleanTitle: isDemo
        ? "Sample books are clean ✓"
        : "Nothing overdue right now ✓",
      revealCleanSub: "I'll flag it the moment something slips.",
      showMe: "Let's go →",
      ariaLabel: "Analysing your books for overdue invoices",
    };
  }
  return {
    analyzingTitle: "Connected ✓ Give me a moment with your books…",
    analyzingSub: "Scanning invoices, bank transactions, and your P&L",
    revealMoneySub: isDemo
      ? "found in sample overdue invoices"
      : "found in overdue invoices",
    revealIssuesTitle: isDemo
      ? "Here's what I found in the sample books"
      : "Here's what I found in your books",
    revealCleanTitle: isDemo
      ? "The sample books look clean ✓"
      : "Your books look clean ✓",
    revealCleanSub: "Nothing overdue, nothing unreconciled.",
    showMe: "Show me →",
    ariaLabel: "Analysing your books",
  };
}

export type ActivityAction =
  | "journal_posted"
  | "journal_reversed"
  | "query_asked"
  | "tool_called"
  | "chase_sent"
  | "chase_recovered"
  | "chase_exhausted";

/** Persona-aware badge label for /activity event rows. */
export function getActivityEventStyle(
  persona: Persona,
  action: ActivityAction,
  description: string,
): { label: string; badge: string; icon: string } {
  const sikiDefaults: Record<ActivityAction, { label: string; badge: string; icon: string }> = {
    journal_posted: { label: "Journal Posted", badge: "bg-sky-100 text-sky-700", icon: "📝" },
    journal_reversed: { label: "Journal Reversed", badge: "bg-amber-100 text-amber-700", icon: "↩" },
    query_asked: { label: "Query", badge: "bg-stone-100 text-stone-600", icon: "💬" },
    tool_called: { label: "Tool Call", badge: "bg-violet-100 text-violet-700", icon: "🔧" },
    chase_sent: { label: "Chase Email Sent", badge: "bg-amber-100 text-amber-700", icon: "✉️" },
    chase_recovered: { label: "Invoice Paid", badge: "bg-emerald-100 text-emerald-700", icon: "💰" },
    chase_exhausted: { label: "Chase Ladder Finished", badge: "bg-rose-100 text-rose-700", icon: "⚠️" },
  };

  if (persona !== "zana") {
    return sikiDefaults[action];
  }

  const roseChase = "bg-rose-100 text-rose-700";
  const stageMatch = description.match(/Stage (\d+) chase for ([^\s→]+)/);
  const paidMatch = description.match(/^([^\s—]+)/);

  switch (action) {
    case "chase_sent":
      return {
        label: stageMatch
          ? `Zana sent stage ${stageMatch[1]} · ${stageMatch[2]}`
          : "Zana sent a chase",
        badge: roseChase,
        icon: "✉️",
      };
    case "chase_recovered":
      return {
        label: paidMatch ? `Zana got paid · ${paidMatch[1]}` : "Zana got paid",
        badge: "bg-emerald-100 text-emerald-700",
        icon: "💰",
      };
    case "chase_exhausted":
      return {
        label: paidMatch
          ? `Zana finished ladder · ${paidMatch[1]}`
          : "Zana finished the ladder",
        badge: "bg-rose-100 text-rose-800",
        icon: "⚠️",
      };
    case "journal_posted":
      return { label: "Zana posted journal", badge: roseChase, icon: "📝" };
    case "journal_reversed":
      return { label: "Zana reversed entry", badge: "bg-amber-100 text-amber-700", icon: "↩" };
    case "query_asked":
      return { label: "Zana query", badge: "bg-stone-100 text-stone-600", icon: "💬" };
    case "tool_called":
      return { label: "Zana tool call", badge: "bg-violet-100 text-violet-700", icon: "🔧" };
    default:
      return sikiDefaults[action];
  }
}

/** Short pricing-page try links aligned with landing paths. */
export function getPricingTryLinks(): {
  sikiDemo: string;
  zanaDemo: string;
  sikiConnect: string;
  zanaConnect: string;
} {
  return {
    sikiDemo: "/books?persona=siki",
    zanaDemo: "/books?persona=zana",
    sikiConnect: "/books?persona=siki&connect=1",
    zanaConnect: "/books?persona=zana&connect=1",
  };
}
