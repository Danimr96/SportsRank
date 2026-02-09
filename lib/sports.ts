import type { Sport } from "@/lib/types";

const FOOTBALL_SLUG = "soccer";

/**
 * Returns the UI label used for a sport.
 * We keep DB slugs unchanged and only remap the user-facing label.
 */
export function getSportDisplayName(sport: Pick<Sport, "slug" | "name">): string {
  if (sport.slug === FOOTBALL_SLUG || sport.name.toLowerCase() === "soccer") {
    return "Football";
  }

  return sport.name;
}

/**
 * Stable ordering for sport sections.
 * Football always comes first, then alphabetical by label.
 */
export function compareSportGroups(
  left: Pick<Sport, "slug" | "name">,
  right: Pick<Sport, "slug" | "name">,
): number {
  const leftPriority = left.slug === FOOTBALL_SLUG ? 0 : 1;
  const rightPriority = right.slug === FOOTBALL_SLUG ? 0 : 1;

  if (leftPriority !== rightPriority) {
    return leftPriority - rightPriority;
  }

  return getSportDisplayName(left).localeCompare(getSportDisplayName(right));
}
