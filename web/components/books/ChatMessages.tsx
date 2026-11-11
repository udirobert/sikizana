"use client";

import { MarkdownMessage } from "@/components/MarkdownMessage";
import { ToolCallTrace } from "@/components/ToolCallTrace";
import { WhileAgentWorks } from "@/components/WhileAgentWorks";
import { JournalEntryCard, parseJournalEntry } from "@/components/JournalEntryCard";
import { NegotiationEmailCard, parseNegotiationEmail } from "@/components/NegotiationEmailCard";
import { AnalysisCard } from "@/components/AnalysisCard";
import { MemoryRecallTrace } from "@/components/MemoryRecallTrace";
import { FeedbackButtons } from "@/components/FeedbackButtons";
import { ResponseSummary } from "@/components/ResponseSummary";
import { SikiMascot } from "@/components/SikiMascot";
import { ZanaMascot } from "@/components/ZanaMascot";
import type { ContextResult, FindingsResponse } from "@/lib/api";
import type { Message } from "@/lib/types";
import type { getPersonaTheme, Persona } from "@/lib/persona-theme";

export interface ChatMessagesProps {
  messages: Message[];
  persona: Persona;
  theme: ReturnType<typeof getPersonaTheme>;
  threadId: string;
  rememberedMessages: Set<number>;
  isLoading: boolean;
  lastContextResults: ContextResult[];
  lastQuery: string;
  currentTool: string | null;
  thinkingMessage: string;
  findings: FindingsResponse | null;
  onRemember: (index: number, content: string) => void;
  onJournalPosted: () => void;
  onJournalReject: () => void;
  onPersonaChange: (p: Persona) => void;
  onContextResults: (results: ContextResult[]) => void;
}

export function ChatMessages({
  messages,
  persona,
  theme,
  threadId,
  rememberedMessages,
  isLoading,
  lastContextResults,
  lastQuery,
  currentTool,
  thinkingMessage,
  findings,
  onRemember,
  onJournalPosted,
  onJournalReject,
  onPersonaChange,
  onContextResults,
}: ChatMessagesProps) {
  return (
    <>
      {messages.map((msg, i) => {
        // Parse for journal entry card if agent message
        const journal = msg.role === "agent" && msg.content ? parseJournalEntry(msg.content) : null;
        // Parse for negotiation email card if agent message
        const negotiationEmail = msg.role === "agent" && msg.content ? parseNegotiationEmail(msg.content) : null;
        // Analysis cards are now delivered via events, not parsed from text
        const cards = msg.analysisCards || [];
        // The text to display (remove the structured block if we're showing it as a card)
        const displayContent = journal
          ? msg.content.split(/PROPOSED JOURNAL ENTRY/i)[0].trim()
          : negotiationEmail
          ? msg.content.split(/NEGOTIATION EMAIL/i)[0].trim()
          : msg.content;

        return (
          <div
            key={i}
            className={`flex gap-2.5 fade-in-up ${
              msg.role === "user" ? "flex-row-reverse" : "flex-row"
            }`}
          >
            {msg.role === "agent" && (
              <div className="shrink-0">
                {(msg.persona ?? persona) === "siki" ? <SikiMascot size={32} mood="idle" /> : <ZanaMascot size={32} mood="idle" />}
              </div>
            )}
            <div className={`max-w-[80%] flex flex-col gap-1 ${msg.role === "user" ? "items-end" : ""}`}>
              {msg.role === "agent" && msg.memoryRecall && (
                <MemoryRecallTrace data={msg.memoryRecall} persona={msg.persona ?? persona} />
              )}
              {msg.role === "agent" && msg.toolCalls && msg.toolCalls.length > 0 && (
                <ToolCallTrace calls={msg.toolCalls} />
              )}
              <div
                className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                  msg.role === "user"
                    ? theme.userBubble
                    : "bg-stone-100 text-stone-800 rounded-tl-sm"
                }`}
              >
                {msg.role === "agent" ? (
                  displayContent ? (
                    <MarkdownMessage source={displayContent} />
                  ) : msg.toolCalls && msg.toolCalls.length > 0 ? (
                    <span className="text-stone-400 text-xs italic">Analyzing your Xero data...</span>
                  ) : null
                ) : (
                  msg.content
                )}
              </div>
              {msg.role === "user" && (
                <button
                  onClick={() => onRemember(i, msg.content)}
                  disabled={rememberedMessages.has(i)}
                  className={`text-xs font-medium px-2 py-0.5 rounded transition-colors btn-press ${
                    rememberedMessages.has(i)
                      ? "text-emerald-600 bg-emerald-50 cursor-default"
                      : "text-stone-400 hover:text-violet-600 hover:bg-violet-50"
                  }`}
                  title={rememberedMessages.has(i) ? "Saved to memory" : "Remember this for next time"}
                >
                  {rememberedMessages.has(i) ? "Remembered" : "Remember"}
                </button>
              )}
              {journal && (
                <JournalEntryCard
                  description={journal.description}
                  debitAccount={journal.debitAccount}
                  debitAccountName={journal.debitAccountName}
                  creditAccount={journal.creditAccount}
                  creditAccountName={journal.creditAccountName}
                  amount={journal.amount}
                  incomplete={journal.incomplete}
                  threadId={threadId}
                  persona={msg.persona ?? persona}
                  onPosted={(result) => {
                    if (result.posted && result.mode !== "demo") {
                      onJournalPosted();
                    }
                  }}
                  onReject={onJournalReject}
                />
              )}
              {negotiationEmail && (
                <NegotiationEmailCard
                  email={negotiationEmail}
                  persona={msg.persona ?? persona}
                />
              )}
              {cards.map((card, ci) => (
                <AnalysisCard
                  key={ci}
                  data={card}
                  persona={msg.persona ?? persona}
                />
              ))}
              {/* Feedback on completed agent answers (not while streaming) */}
              {msg.role === "agent" && msg.content && threadId &&
                !(isLoading && i === messages.length - 1) && (
                <FeedbackButtons threadId={threadId} messageIndex={i} initial={msg.feedback} />
              )}
              {/* Contextual Zana nudge — only on the last agent message,
                  only in Siki mode, only when not streaming. Detects
                  overdue invoices, tax, or savings opportunities in the
                  response and suggests switching to Zana for the action
                  Zana is better at (chasing, tax bluntness, savings). */}
              {msg.role === "agent" && msg.content &&
                persona === "siki" &&
                !isLoading && i === messages.length - 1 &&
                (() => {
                  const lower = msg.content.toLowerCase();
                  let nudge: string | null = null;
                  if (lower.includes("overdue") || lower.includes("owed") || lower.includes("hasn't paid") || lower.includes("haven't paid"))
                    nudge = "Zana can draft the chasing email for this →";
                  else if (lower.includes("tax") || lower.includes("deduct") || lower.includes("corporation tax"))
                    nudge = "Zana can check if you're overpaying tax →";
                  else if (lower.includes("saving") || lower.includes("expense") || lower.includes("margin") || lower.includes("profit"))
                    nudge = "Zana can find savings in your expenses →";
                  if (!nudge) return null;
                  return (
                    <button
                      onClick={() => onPersonaChange("zana")}
                      className="self-start mt-1 text-xs font-medium text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 px-2.5 py-1.5 rounded-lg btn-press transition-colors fade-in-up flex items-center gap-1.5"
                    >
                      <span className="text-rose-400">⚡</span>
                      {nudge}
                    </button>
                  );
                })()}
              {/* HMRC guidance footnote — persists the context found
                  during the wait under the agent's response. Only on
                  the last agent message, only when not streaming. */}
              {msg.role === "agent" && msg.content &&
                !isLoading && i === messages.length - 1 &&
                lastContextResults.length > 0 && (
                <div className="mt-1 border-t border-stone-200/60 pt-2 fade-in-up">
                  <p className="text-xs text-stone-400 font-medium mb-0.5">
                    📖 Related HMRC guidance
                  </p>
                  {lastContextResults.slice(0, 1).map((r) => (
                    <div key={r.url}>
                      <p className="text-xs text-stone-600 leading-relaxed">
                        {r.summary || r.snippet}
                      </p>
                      <a
                        href={r.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-stone-400 hover:text-violet-600 transition-colors text-[9px] mt-0.5 inline-block"
                      >
                        {r.title.length > 45 ? r.title.slice(0, 45) + "…" : r.title} ↗
                      </a>
                    </div>
                  ))}
                </div>
              )}
              {/* Peak-end summary card — a clean, satisfying close
                  after the agent responds. Shows issues found, money
                  at stake, and urgent count. Only on the last message. */}
              {msg.role === "agent" && msg.content &&
                !isLoading && i === messages.length - 1 && (
                <ResponseSummary
                  findings={findings}
                  isStreaming={isLoading}
                  persona={persona}
                />
              )}
            </div>
          </div>
        );
      })}

      {isLoading && (
        <div className="bg-stone-100 px-4 py-3 rounded-2xl rounded-tl-sm fade-in-up">
          <WhileAgentWorks
            persona={persona}
            userQuery={lastQuery}
            currentTool={currentTool}
            thinkingMessage={thinkingMessage}
            findings={findings}
            onContextResults={onContextResults}
          />
        </div>
      )}
    </>
  );
}
