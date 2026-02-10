import type { SupabaseClient } from "@supabase/supabase-js";
import type { PickWithOptions, Round } from "@/lib/types";

function mapRound(row: any): Round {
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    opens_at: row.opens_at,
    closes_at: row.closes_at,
    starting_credits: row.starting_credits,
    stake_step: row.stake_step,
    min_stake: row.min_stake,
    max_stake: row.max_stake,
    enforce_full_budget: row.enforce_full_budget,
  };
}

function unwrapSingle<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }
  return value ?? null;
}

export async function getCurrentOpenRound(
  client: SupabaseClient,
): Promise<Round | null> {
  const nowIso = new Date().toISOString();

  const { data, error } = await client
    .from("rounds")
    .select(
      "id, name, status, opens_at, closes_at, starting_credits, stake_step, min_stake, max_stake, enforce_full_budget",
    )
    .eq("status", "open")
    .lte("opens_at", nowIso)
    .gt("closes_at", nowIso)
    .order("opens_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ? mapRound(data) : null;
}

export async function getRoundById(
  client: SupabaseClient,
  roundId: string,
): Promise<Round | null> {
  const { data, error } = await client
    .from("rounds")
    .select(
      "id, name, status, opens_at, closes_at, starting_credits, stake_step, min_stake, max_stake, enforce_full_budget",
    )
    .eq("id", roundId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ? mapRound(data) : null;
}

export async function listRounds(client: SupabaseClient): Promise<Round[]> {
  const { data, error } = await client
    .from("rounds")
    .select(
      "id, name, status, opens_at, closes_at, starting_credits, stake_step, min_stake, max_stake, enforce_full_budget",
    )
    .order("opens_at", { ascending: false });

  if (error) {
    throw error;
  }

  return (data ?? []).map(mapRound);
}

export async function listRoundPicksWithOptions(
  client: SupabaseClient,
  roundId: string,
): Promise<PickWithOptions[]> {
  const { data, error } = await client
    .from("picks")
    .select(
      "id, round_id, sport_id, title, description, order_index, is_required, metadata, sports(id, slug, name, icon), pick_options(id, pick_id, label, odds, result)",
    )
    .eq("round_id", roundId)
    .order("order_index", { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []).map((row: any) => {
    const sport = unwrapSingle(row.sports);

    return {
      id: row.id,
      round_id: row.round_id,
      sport_id: row.sport_id,
      title: row.title,
      description: row.description,
      order_index: row.order_index,
      is_required: row.is_required,
      metadata: row.metadata ?? null,
      sport: {
        id: sport?.id ?? "",
        slug: sport?.slug ?? "unknown",
        name: sport?.name ?? "Unknown",
        icon: sport?.icon ?? null,
      },
      options: (row.pick_options ?? []).map((option: any) => ({
        id: option.id,
        pick_id: option.pick_id,
        label: option.label,
        odds: Number(option.odds),
        result: option.result,
      })),
    };
  });
}
