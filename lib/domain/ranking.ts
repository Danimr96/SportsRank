import type { LeaderboardEntry } from "@/lib/types";
import type { OptionResult } from "@/lib/types";

export interface RankedLeaderboardEntry extends LeaderboardEntry {
  rank: number;
}

export interface LiveLeaderboardSelectionInput {
  sportSlug: string;
  stake: number;
  odds: number;
  result: OptionResult;
  marketOdds: number[];
}

export interface LiveLeaderboardEntryInput {
  entry_id: string;
  user_id: string;
  username: string;
  locked_at: string | null;
  credits_start: number;
  selections: LiveLeaderboardSelectionInput[];
}

export interface LiveLeaderboardRow {
  rank: number;
  entry_id: string;
  user_id: string;
  username: string;
  locked_at: string | null;
  currentScore: number;
  minScore: number;
  maxScore: number;
  selectionsCount: number;
}

export interface LiveLeaderboardRange {
  currentRank: number | null;
  bestRank: number | null;
  worstRank: number | null;
}

export interface LiveLeaderboardResult {
  rows: LiveLeaderboardRow[];
  myRange: LiveLeaderboardRange;
  mode: "credits" | "net";
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

function normalizedProbabilityNoMargin(odds: number, marketOdds: number[]): number {
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

  return (1 / odds) / denominator;
}

function projectionForSelection(selection: LiveLeaderboardSelectionInput): {
  minPayout: number;
  maxPayout: number;
  currentPayout: number;
} {
  const stake = Number.isFinite(selection.stake) ? Math.max(0, Math.trunc(selection.stake)) : 0;
  const odds = Number.isFinite(selection.odds) && selection.odds > 0 ? selection.odds : 0;
  const maxPayout = Math.floor(stake * odds);

  if (selection.result === "win") {
    return { minPayout: maxPayout, maxPayout, currentPayout: maxPayout };
  }

  if (selection.result === "lose") {
    return { minPayout: 0, maxPayout: 0, currentPayout: 0 };
  }

  if (selection.result === "void") {
    return { minPayout: stake, maxPayout: stake, currentPayout: stake };
  }

  const probability = normalizedProbabilityNoMargin(
    odds,
    selection.marketOdds.length > 0 ? selection.marketOdds : [odds],
  );
  const currentPayout = Math.round(maxPayout * probability);

  return { minPayout: 0, maxPayout, currentPayout };
}

function lockedAtSortValue(lockedAt: string | null): number {
  if (!lockedAt) {
    return Number.MAX_SAFE_INTEGER;
  }
  const value = new Date(lockedAt).getTime();
  return Number.isNaN(value) ? Number.MAX_SAFE_INTEGER : value;
}

function byScoreDesc(
  left: { score: number; lockedAt: string | null; username: string },
  right: { score: number; lockedAt: string | null; username: string },
): number {
  if (right.score !== left.score) {
    return right.score - left.score;
  }

  const lockedDiff = lockedAtSortValue(left.lockedAt) - lockedAtSortValue(right.lockedAt);
  if (lockedDiff !== 0) {
    return lockedDiff;
  }

  return left.username.localeCompare(right.username);
}

function rankForScenario(
  rows: LiveLeaderboardRow[],
  userId: string,
  myScoreKey: "minScore" | "maxScore",
  othersScoreKey: "minScore" | "maxScore",
): number | null {
  const scored = rows.map((row) => ({
    entryId: row.entry_id,
    userId: row.user_id,
    username: row.username,
    lockedAt: row.locked_at,
    score: row.user_id === userId ? row[myScoreKey] : row[othersScoreKey],
  }));

  scored.sort(byScoreDesc);
  const index = scored.findIndex((row) => row.userId === userId);
  return index >= 0 ? index + 1 : null;
}

export function computeLiveLeaderboard(
  entries: LiveLeaderboardEntryInput[],
  options: { currentUserId: string; sportSlug?: string | "all" },
): LiveLeaderboardResult {
  const sportSlug = options.sportSlug ?? "all";
  const isAllSports = sportSlug === "all";
  const mode: LiveLeaderboardResult["mode"] = isAllSports ? "credits" : "net";

  const rows: LiveLeaderboardRow[] = entries.map((entry) => {
    const relevantSelections = entry.selections.filter((selection) =>
      isAllSports ? true : selection.sportSlug === sportSlug,
    );

    const totalStake = relevantSelections.reduce((sum, selection) => {
      const stake = Number.isFinite(selection.stake) ? Math.max(0, Math.trunc(selection.stake)) : 0;
      return sum + stake;
    }, 0);

    const projection = relevantSelections.reduce(
      (sum, selection) => {
        const current = projectionForSelection(selection);
        return {
          minPayout: sum.minPayout + current.minPayout,
          maxPayout: sum.maxPayout + current.maxPayout,
          currentPayout: sum.currentPayout + current.currentPayout,
        };
      },
      { minPayout: 0, maxPayout: 0, currentPayout: 0 },
    );

    const cash = Math.max(0, Math.trunc(entry.credits_start) - totalStake);
    const currentScore = isAllSports
      ? cash + projection.currentPayout
      : projection.currentPayout - totalStake;
    const minScore = isAllSports ? cash + projection.minPayout : projection.minPayout - totalStake;
    const maxScore = isAllSports ? cash + projection.maxPayout : projection.maxPayout - totalStake;

    return {
      rank: 0,
      entry_id: entry.entry_id,
      user_id: entry.user_id,
      username: entry.username,
      locked_at: entry.locked_at,
      currentScore,
      minScore,
      maxScore,
      selectionsCount: relevantSelections.length,
    };
  });

  rows.sort((left, right) =>
    byScoreDesc(
      { score: left.currentScore, lockedAt: left.locked_at, username: left.username },
      { score: right.currentScore, lockedAt: right.locked_at, username: right.username },
    ),
  );

  rows.forEach((row, index) => {
    row.rank = index + 1;
  });

  const currentRow = rows.find((row) => row.user_id === options.currentUserId);

  return {
    rows,
    mode,
    myRange: {
      currentRank: currentRow?.rank ?? null,
      bestRank: rankForScenario(rows, options.currentUserId, "maxScore", "minScore"),
      worstRank: rankForScenario(rows, options.currentUserId, "minScore", "maxScore"),
    },
  };
}
