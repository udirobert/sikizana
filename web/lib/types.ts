/**
 * Shared types used across the frontend.
 */

export type Role = "user" | "agent";

export interface Message {
  role: Role;
  content: string;
  /** Which persona generated this message (for mascot display). */
  persona?: "siki" | "zana";
  /** Set when the agent response was feedback-rated. */
  feedback?: "up" | "down" | null;
  /** Optional structured verdict metadata. */
  receiptId?: string;
  /** Backend-assigned message index, used for feedback correlation. */
  index?: number;
  /** Tool calls made by the agent (for transparency display) */
  toolCalls?: ToolCallEvent[];
  /** Structured analysis cards (benchmarks, scorecards, trends) emitted
   *  by the backend alongside the text response. */
  analysisCards?: AnalysisCardData[];
  /** Facts recalled from Supermemory before the agent responded.
   *  Makes the memory layer visible — shown as a collapsible panel. */
  memoryRecall?: MemoryRecallData;
}

/** A single tool call made by the agent during reasoning */
export interface ToolCallEvent {
  tool: string;
  label: string;
  summary?: string;
  status: "calling" | "done";
}

/** Structured analysis card data emitted by the backend (not via LLM text) */
export type AnalysisCardData = {
  type: "sector_benchmark" | "customer_scorecard" | "trend_analysis";
  [key: string]: unknown;
};

/** Memory recall data emitted when Supermemory returns past context */
export interface MemoryRecallData {
  /** Flat list of all recalled facts (for quick display) */
  facts: string[];
  /** Grouped sources (profile static/dynamic, recalled memories) */
  sources: MemoryRecallSource[];
}

export interface MemoryRecallSource {
  type: "profile" | "recall";
  label: string;
  items: string[];
}

/** Events streamed from the agent during a chat */
export type AgentEvent =
  | { type: "status"; message: string }
  | { type: "memory_recall"; facts: string[]; sources: MemoryRecallSource[] }
  | { type: "tool_call"; tool: string; label: string; args: Record<string, unknown> }
  | { type: "tool_result"; tool: string; label: string; summary: string }
  | { type: "analysis_card"; data: AnalysisCardData }
  | { type: "text"; text: string }
  | { type: "done" };

export interface WebhookEvent {
  eventType: string;
  entity: string;
  entityId: string;
  tenantId: string;
  message: string;
  timestamp: string;
}
