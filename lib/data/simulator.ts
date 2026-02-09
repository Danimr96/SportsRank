import type { SupabaseClient } from "@supabase/supabase-js";
import { listRoundLeaderboardEntryInputs } from "@/lib/data/leaderboard";
import type { LiveLeaderboardEntryInput } from "@/lib/domain/ranking";
import type { LiveSimulationInput, SimulationSelectionInput } from "@/lib/domain/simulator";

export interface CoachSimulationSeed {
  entries: LiveSimulationInput[];
  loadError: string | null;
}

function toSimulationSelection(
  entryId: string,
  selection: LiveLeaderboardEntryInput["selections"][number],
  index: number,
): SimulationSelectionInput {
  return {
    pickId: `${entryId}:selection:${index}`,
    pickTitle: "Imported selection",
    sportSlug: selection.sportSlug,
    stake: selection.stake,
    odds: selection.odds,
    result: selection.result,
    marketOdds: selection.marketOdds,
    editable: false,
  };
}

function toSimulationEntry(entry: LiveLeaderboardEntryInput): LiveSimulationInput {
  return {
    entryId: entry.entry_id,
    userId: entry.user_id,
    username: entry.username,
    lockedAt: entry.locked_at,
    creditsStart: entry.credits_start,
    selections: entry.selections.map((selection, index) =>
      toSimulationSelection(entry.entry_id, selection, index),
    ),
  };
}

/**
 * Best-effort simulation seed loader.
 * Returns empty dataset plus loadError if policies prevent full leaderboard access.
 */
export async function getCoachSimulationSeed(
  client: SupabaseClient,
  roundId: string,
): Promise<CoachSimulationSeed> {
  try {
    const entries = await listRoundLeaderboardEntryInputs(client, roundId);
    return { entries: entries.map(toSimulationEntry), loadError: null };
  } catch (error) {
    return {
      entries: [],
      loadError: (error as Error).message,
    };
  }
}
