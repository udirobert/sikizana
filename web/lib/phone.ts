/**
 * Kenya phone number validation and normalisation.
 * Single source of truth for the same regex used in the backend.
 */

export const KE_PHONE_REGEX = /^(?:\+?254|0)?[17]\d{8}$/;

export function isValidKenyanPhone(raw: string): boolean {
  const normalised = raw.replace(/[\s\-]/g, "");
  return KE_PHONE_REGEX.test(normalised);
}

/** Format a Kenyan phone for display: 0712 345 678. Returns original if not valid. */
export function formatKenyanPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("254")) {
    return `0${digits.slice(3, 6)} ${digits.slice(6, 9)} ${digits.slice(9)}`;
  }
  if (digits.length === 10 && digits.startsWith("07")) {
    return `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`;
  }
  return raw;
}

/** Mask a phone for display: 0712***567. Returns last 3 digits. */
export function maskPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 6) return raw;
  const start = digits.slice(0, 4);
  const end = digits.slice(-3);
  const stars = "*".repeat(Math.max(0, digits.length - 7));
  return `${start}${stars}${end}`;
}
