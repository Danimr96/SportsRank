import type { SupabaseClient } from "@supabase/supabase-js";
import type { LiveLeaderboardEntryInput } from "@/lib/domain/ranking";
import type { OptionResult } from "@/lib/types";
import type { LeaderboardEntry } from "@/lib/types";

function unwrapSingle<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }
  return value ?? null;
}

export async function listSettledLeaderboardEntries(
  client: SupabaseClient,
  roundId: string,
): Promise<LeaderboardEntry[]> {
  const { data, error } = await client
    .from("entries")
    .select("id, user_id, credits_end, locked_at, profiles(username)")
    .eq("round_id", roundId)
    .eq("status", "settled")
    .not("credits_end", "is", null)
    .not("locked_at", "is", null);

  if (error) {
    throw error;
  }

  return (data ?? []).map((row: any) => {
    const profile = unwrapSingle(row.profiles);

    return {
      entry_id: row.id,
      user_id: row.user_id,
      username: profile?.username ?? "anonymous",
      credits_end: row.credits_end,
      locked_at: row.locked_at,
    };
  });
}

interface RawEntryRow {
  id: string;
  user_id: string;
  status: string;
  credits_start: number;
  locked_at: string | null;
  profiles: { username: string } | Array<{ username: string }> | null;
}

interface RawSelectionRow {
  entry_id: string;
  stake: number;
  pick_id: string;
  picks: { sports: { slug: string } | Array<{ slug: string }> | null } | Array<{ sports: { slug: string } | Array<{ slug: string }> | null }> | null;
  pick_options: { odds: number; result: OptionResult } | Array<{ odds: number; result: OptionResult }> | null;
}

interface RawPickOptionRow {
  pick_id: string;
  odds: number;
}

function toInteger(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.trunc(value));
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return Math.max(0, Math.trunc(parsed));
    }
  }

  return 0;
}

function toPositiveNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 0 ? value : 0;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return 0;
}

function toResult(value: unknown): OptionResult {
  if (value === "win" || value === "lose" || value === "void" || value === "pending") {
    return value;
  }
  return "pending";
}

export async function listRoundLeaderboardEntryInputs(
  client: SupabaseClient,
  roundId: string,
): Promise<LiveLeaderboardEntryInput[]> {
  const { data: entryData, error: entryError } = await client
    .from("entries")
    .select("id, user_id, status, credits_start, locked_at, profiles(username)")
    .eq("round_id", roundId)
    .in("status", ["building", "locked", "settled"]);

  if (entryError) {
    throw entryError;
  }

  const entries = (entryData ?? []) as RawEntryRow[];
  if (entries.length === 0) {
    return [];
  }

  const entryIds = entries.map((entry) => entry.id);
  const { data: selectionData, error: selectionError } = await client
    .from("entry_selections")
    .select("entry_id, stake, pick_id, picks(sports(slug)), pick_options(odds, result)")
    .in("entry_id", entryIds);

  if (selectionError) {
    throw selectionError;
  }

  const selections = (selectionData ?? []) as RawSelectionRow[];
  const pickIds = Array.from(new Set(selections.map((selection) => selection.pick_id)));

  const oddsByPickId = new Map<string, number[]>();
  if (pickIds.length > 0) {
    const { data: pickOptionData, error: pickOptionError } = await client
      .from("pick_options")
      .select("pick_id, odds")
      .in("pick_id", pickIds);

    if (pickOptionError) {
      throw pickOptionError;
    }

    for (const optionRow of (pickOptionData ?? []) as RawPickOptionRow[]) {
      const odds = toPositiveNumber(optionRow.odds);
      if (odds <= 0) {
        continue;
      }
      const list = oddsByPickId.get(optionRow.pick_id) ?? [];
      list.push(odds);
      oddsByPickId.set(optionRow.pick_id, list);
    }
  }

  const selectionsByEntryId = new Map<string, LiveLeaderboardEntryInput["selections"]>();

  for (const selection of selections) {
    const pick = unwrapSingle(selection.picks);
    const sport = unwrapSingle(pick?.sports);
    const selectedOption = unwrapSingle(selection.pick_options);

    const odds = toPositiveNumber(selectedOption?.odds);
    if (odds <= 0) {
      continue;
    }

    const marketOdds = oddsByPickId.get(selection.pick_id) ?? [odds];
    const entrySelections = selectionsByEntryId.get(selection.entry_id) ?? [];

    entrySelections.push({
      sportSlug: sport?.slug ?? "unknown",
      stake: toInteger(selection.stake),
      odds,
      result: toResult(selectedOption?.result),
      marketOdds: marketOdds.length > 0 ? marketOdds : [odds],
    });

    selectionsByEntryId.set(selection.entry_id, entrySelections);
  }

  return entries.map((entry) => {
    const profile = unwrapSingle(entry.profiles);

    return {
      entry_id: entry.id,
      user_id: entry.user_id,
      username: profile?.username ?? "anonymous",
      locked_at: entry.locked_at,
      credits_start: toInteger(entry.credits_start),
      selections: selectionsByEntryId.get(entry.id) ?? [],
    };
  });
}
