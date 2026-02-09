function pad2(value: number): string {
  return value.toString().padStart(2, "0");
}

/**
 * Deterministic number formatter to avoid locale-based hydration mismatches.
 */
export function formatCredits(value: number): string {
  const sign = value < 0 ? "-" : "";
  const digits = Math.abs(Math.trunc(value)).toString();
  const withSeparators = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${sign}${withSeparators}`;
}

/**
 * Stable UTC datetime formatting for client-rendered content.
 */
export function formatUtcDateTime(value: Date): string {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${pad2(value.getUTCDate())} ${months[value.getUTCMonth()]} ${value.getUTCFullYear()} ${pad2(value.getUTCHours())}:${pad2(value.getUTCMinutes())} UTC`;
}
