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
}

export type Language = "en" | "sw" | "sheng";

export interface WebhookEvent {
  eventType: string;
  entity: string;
  entityId: string;
  tenantId: string;
  message: string;
  timestamp: string;
}
