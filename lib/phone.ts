// Philippine mobile numbers, written the local way: 09XX XXX XXXX. PartyUp
// is PH-only (Bulacan), so numbers are stored as 11 digits, 09XXXXXXXXX,
// which phones in the Philippines dial as-is (the website's SOS Center and
// Trip Monitoring call buttons). Not SMS-verified (zero-cost until December
// 2026), only format-checked. If an SMS provider later needs +63, convert
// then: '+63' + phone.slice(1).

/** "+63 917-123-4567", "639171234567", "9171234567" or "0917…" -> "09171234567" (up to 11 digits) */
export function normalizePhone(input: string) {
  let digits = input.replace(/\D/g, '');
  if (digits.startsWith('63')) digits = `0${digits.slice(2)}`;
  else if (digits.startsWith('9')) digits = `0${digits}`;
  return digits.slice(0, 11);
}

/** "09171234567" -> "0917 123 4567" (also formats a partial number while typing) */
export function formatPhone(phone: string) {
  return [phone.slice(0, 4), phone.slice(4, 7), phone.slice(7, 11)].filter(Boolean).join(' ');
}

export function isValidPhone(phone: string) {
  return /^09\d{9}$/.test(phone);
}

export function hasPhone(phone: string | null | undefined) {
  return !!phone && phone.trim().length > 0;
}

export const PHONE_INVALID_MESSAGE = 'Enter a valid PH mobile number, e.g. 0917 123 4567.';
export const PHONE_REQUIRED_MESSAGE = 'Add your mobile number so the safety team can reach you during a trip.';
