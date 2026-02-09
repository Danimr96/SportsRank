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
 * Formats decimal odds using European style decimal separator.
 * Example: 1.85 -> "1,85"
 */
export function formatOddsEuropean(value: number): string {
  const fixed = (Math.round(value * 100) / 100).toFixed(2);
  return fixed.replace(".", ",");
}

/**
 * Returns normalized probability (0-100) from decimal odds against all options in a market.
 * Example for two-way market odds [1.85, 1.95]:
 * raw implied sums > 100, normalized probabilities sum to 100.
 */
export function normalizedProbabilityFromOdds(
  odds: number,
  marketOdds: number[],
): number {
  if (!Number.isFinite(odds) || odds <= 0) {
    return 0;
  }

  const validOdds = marketOdds.filter((value) => Number.isFinite(value) && value > 0);
  if (validOdds.length === 0) {
    return 0;
  }

  const denominator = validOdds.reduce((sum, value) => sum + 1 / value, 0);
  if (denominator <= 0) {
    return 0;
  }

  return (1 / odds / denominator) * 100;
}

/**
 * Stable percentage formatter with Spanish decimal separator.
 * Example: 51.28 -> "51,3%"
 */
export function formatPercentSpanish(value: number): string {
  const safe = Number.isFinite(value) ? value : 0;
  return `${safe.toFixed(1).replace(".", ",")}%`;
}

/**
 * Stable UTC datetime formatting for client-rendered content.
 */
export function formatUtcDateTime(value: Date): string {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${pad2(value.getUTCDate())} ${months[value.getUTCMonth()]} ${value.getUTCFullYear()} ${pad2(value.getUTCHours())}:${pad2(value.getUTCMinutes())} UTC`;
}
