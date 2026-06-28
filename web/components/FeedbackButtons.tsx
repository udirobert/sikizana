"use client";

import { useState } from "react";
import { endpoints } from "@/lib/api";

interface FeedbackButtonsProps {
  threadId: string;
  messageIndex: number;
  onFeedback?: (rating: "up" | "down") => void;
  initial?: "up" | "down" | null;
}

export function FeedbackButtons({
  threadId,
  messageIndex,
  onFeedback,
  initial = null,
}: FeedbackButtonsProps) {
  const [rating, setRating] = useState<"up" | "down" | null>(initial);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (value: "up" | "down") => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await endpoints.feedback({
        thread_id: threadId,
        message_index: messageIndex,
        rating: value,
      });
      setRating(value);
      onFeedback?.(value);
    } catch {
      // Silent: feedback is best-effort.
    } finally {
      setSubmitting(false);
    }
  };

  const buttonBase =
    "p-1.5 rounded-md transition disabled:opacity-40 disabled:cursor-not-allowed";
  const inactive = "text-stone-400 hover:text-stone-600 hover:bg-stone-100";
  const upActive = "bg-emerald-100 text-emerald-700";
  const downActive = "bg-red-100 text-red-700";

  return (
    <div className="flex items-center gap-1 mt-1.5">
      <button
        onClick={() => submit("up")}
        disabled={submitting || rating !== null}
        aria-label="Helpful"
        className={`${buttonBase} ${rating === "up" ? upActive : inactive}`}
      >
        <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
          <path d="M2 10.5a1.5 1.5 0 113 0v6a1.5 1.5 0 01-3 0v-6zM6 10.333v5.43a2 2 0 001.106 1.79l.05.025A4 4 0 008.943 18h5.416a2 2 0 001.962-1.608l1.2-6A2 2 0 0014.56 8H12V4a2 2 0 00-2-2 1 1 0 00-1 1v.667a4 4 0 01-.8 2.4L6.8 7.933a4 4 0 00-.8 2.4z" />
        </svg>
      </button>
      <button
        onClick={() => submit("down")}
        disabled={submitting || rating !== null}
        aria-label="Not helpful"
        className={`${buttonBase} ${rating === "down" ? downActive : inactive}`}
      >
        <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
          <path d="M18 9.5a1.5 1.5 0 11-3 0v-6a1.5 1.5 0 013 0v6zM14 9.667v-5.43a2 2 0 00-1.106-1.79l-.05-.025A4 4 0 0011.057 2H5.64a2 2 0 00-1.962 1.608l-1.2 6A2 2 0 005.44 12H8v4a2 2 0 002 2 1 1 0 001-1v-.667a4 4 0 01.8-2.4l1.4-1.866a4 4 0 00.8-2.4z" />
        </svg>
      </button>
      {rating && (
        <span className="text-[10px] text-stone-500 ml-1">Asante!</span>
      )}
    </div>
  );
}
