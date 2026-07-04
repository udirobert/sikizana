/**
 * Shared types used across the frontend.
 */

export type Role = "user" | "agent";

export interface Message {
  role: Role;
  content: string;
  isPremium?: boolean;
  /** Set when the agent response was feedback-rated. */
  feedback?: "up" | "down" | null;
  /** Optional structured verdict metadata. */
  receiptId?: string;
  /** Backend-assigned message index, used for feedback correlation. */
  index?: number;
  /** Tool calls made by the agent (for transparency display) */
  toolCalls?: ToolCallEvent[];
}

/** A single tool call made by the agent during reasoning */
export interface ToolCallEvent {
  tool: string;
  label: string;
  summary?: string;
  status: "calling" | "done";
}

/** Events streamed from the agent during a chat */
export type AgentEvent =
  | { type: "tool_call"; tool: string; label: string; args: Record<string, unknown> }
  | { type: "tool_result"; tool: string; label: string; summary: string }
  | { type: "text"; text: string }
  | { type: "done" };

export type Language = "en" | "sw" | "sheng";

export interface WebhookEvent {
  eventType: string;
  entity: string;
  entityId: string;
  tenantId: string;
  message: string;
  timestamp: string;
}
