import type { LeaderboardEntry } from "@/lib/types";

export interface RankedLeaderboardEntry extends LeaderboardEntry {
  rank: number;
}

/**
 * Applies leaderboard ordering: credits_end desc, locked_at asc.
 */
export function computeLeaderboard(
  entries: LeaderboardEntry[],
): RankedLeaderboardEntry[] {
  const sorted = [...entries].sort((a, b) => {
    if (b.credits_end !== a.credits_end) {
      return b.credits_end - a.credits_end;
    }

    return (
      new Date(a.locked_at).getTime() - new Date(b.locked_at).getTime()
    );
  });

  return sorted.map((entry, index) => ({
    ...entry,
    rank: index + 1,
  }));
}
