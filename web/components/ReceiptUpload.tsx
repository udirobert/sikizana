"use client";

import { useRef, useState } from "react";
import { ApiError, endpoints } from "@/lib/api";

/**
 * ReceiptUpload — multimodal receipt matching UI.
 *
 * Lets the user drag-and-drop or click to upload a receipt photo.
 * Sends it to the backend where vision AI reads the supplier,
 * amount, and date, then matches it to a Xero bank transaction.
 *
 * The result is added to the chat thread as an agent message.
 */
export function ReceiptUpload({
  onResult,
  onError,
}: {
  onResult: (response: string, filename: string) => void;
  /** `status` is the HTTP status when the failure came from the API (e.g. 402 = quota exhausted). */
  onError: (message: string, status?: number) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const handleFile = async (file: File) => {
    if (!file.type.startsWith("image/") && file.type !== "application/pdf") {
      onError("Please upload an image (PNG, JPEG, WebP) or PDF file.");
      return;
    }

    setIsUploading(true);
    try {
      const data = await endpoints.xero.uploadReceipt(file);
      onResult(data.response, data.filename);
    } catch (e) {
      if (e instanceof ApiError) {
        onError(`Upload failed (${e.status}).`, e.status);
      } else {
        onError(e instanceof Error ? e.message : "Unknown error.");
      }
    } finally {
      setIsUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) void handleFile(file);
  };

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,application/pdf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
          e.target.value = ""; // reset so same file can be re-selected
        }}
      />
      <button
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        disabled={isUploading}
        className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all btn-press ${
          isDragging
            ? "bg-sky-100 border-2 border-dashed border-sky-400 text-sky-700"
            : "bg-stone-100 hover:bg-stone-200 border border-stone-200 text-stone-600"
        } ${isUploading ? "opacity-50 cursor-wait" : ""}`}
        title="Upload a receipt photo for AI matching"
      >
        {isUploading ? (
          <>
            <svg
              className="w-4 h-4 animate-spin"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            <span className="t-shimmer">Reading receipt...</span>
          </>
        ) : (
          <>
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
            Upload Receipt
          </>
        )}
      </button>
    </div>
  );
}
