"use client";

interface PremiumSendButtonProps {
  active: boolean;
  disabled: boolean;
  onClick: () => void;
  amount: number;
}

/**
 * The premium send button shows the price when inactive (so users know what
 * they get for the star icon) and a check when active.
 */
export function PremiumSendButton({ active, disabled, onClick, amount }: PremiumSendButtonProps) {
  const label = active ? "Paid" : `${amount} KES`;
  const title = active
    ? "Premium Deep Audit is active for this message"
    : `Premium Deep Audit (${amount} KES via M-Pesa)`;

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      className={`relative p-2.5 rounded-xl transition disabled:opacity-40 disabled:cursor-not-allowed ${
        active
          ? "bg-emerald-600 hover:bg-emerald-700 text-white"
          : "bg-amber-500 hover:bg-amber-600 text-white"
      }`}
    >
      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
      </svg>
      <span className="absolute -bottom-1 -right-1 text-[8px] font-bold bg-white text-stone-900 px-1 rounded shadow-sm border border-stone-200">
        {label}
      </span>
    </button>
  );
}
