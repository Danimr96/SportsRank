import type { SupabaseClient } from "@supabase/supabase-js";
import type { PickMetadata } from "@/lib/ingestion/types";
import type { PickWithOptions } from "@/lib/types";
import { listRoundPicksWithOptions } from "@/lib/data/rounds";

function unwrapSingle<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }
  return value ?? null;
}

export async function createRound(
  client: SupabaseClient,
  payload: {
    name: string;
    status: "draft" | "open" | "locked" | "settled";
    opens_at: string;
    closes_at: string;
    starting_credits: number;
    min_stake: number;
    max_stake: number;
    enforce_full_budget: boolean;
  },
): Promise<string> {
  const { data, error } = await client
    .from("rounds")
    .insert(payload)
    .select("id")
    .single();

  if (error) {
    throw error;
  }

  return data.id;
}

export async function updateRound(
  client: SupabaseClient,
  roundId: string,
  payload: {
    name: string;
    status: "draft" | "open" | "locked" | "settled";
    opens_at: string;
    closes_at: string;
    starting_credits: number;
    min_stake: number;
    max_stake: number;
    enforce_full_budget: boolean;
  },
): Promise<void> {
  const { error } = await client.from("rounds").update(payload).eq("id", roundId);

  if (error) {
    throw error;
  }
}

export async function createPick(
  client: SupabaseClient,
  payload: {
    round_id: string;
    sport_id: string;
    title: string;
    description: string | null;
    order_index: number;
    is_required: boolean;
    metadata?: Record<string, unknown> | null;
  },
): Promise<void> {
  const { error } = await client.from("picks").insert(payload);

  if (error) {
    throw error;
  }
}

export async function createPickOption(
  client: SupabaseClient,
  payload: {
    pick_id: string;
    label: string;
    odds: number;
    result?: "pending" | "win" | "lose" | "void";
  },
): Promise<void> {
  const { error } = await client.from("pick_options").insert(payload);

  if (error) {
    throw error;
  }
}

export async function insertImportedPicks(
  client: SupabaseClient,
  payload: Array<{
    id: string;
    round_id: string;
    sport_id: string;
    title: string;
    description: string | null;
    order_index: number;
    is_required: boolean;
    metadata: PickMetadata;
  }>,
): Promise<void> {
  if (payload.length === 0) {
    return;
  }

  const { error } = await client.from("picks").insert(payload);

  if (error) {
    throw error;
  }
}

export async function insertImportedPickOptions(
  client: SupabaseClient,
  payload: Array<{
    id: string;
    pick_id: string;
    label: string;
    odds: number;
    result: "pending" | "win" | "lose" | "void";
  }>,
): Promise<void> {
  if (payload.length === 0) {
    return;
  }

  const { error } = await client.from("pick_options").insert(payload);

  if (error) {
    throw error;
  }
}

export async function listSports(
  client: SupabaseClient,
): Promise<Array<{ id: string; slug: string; name: string; icon: string | null }>> {
  const { data, error } = await client
    .from("sports")
    .select("id, slug, name, icon")
    .order("name", { ascending: true });

  if (error) {
    throw error;
  }

  return data ?? [];
}

export async function listRoundPicksForAdmin(
  client: SupabaseClient,
  roundId: string,
): Promise<PickWithOptions[]> {
  return listRoundPicksWithOptions(client, roundId);
}

export async function updatePickOptionResult(
  client: SupabaseClient,
  optionId: string,
  result: "pending" | "win" | "lose" | "void",
): Promise<void> {
  const { error } = await client
    .from("pick_options")
    .update({ result })
    .eq("id", optionId);

  if (error) {
    throw error;
  }
}

export async function listRoundEntriesWithSelections(
  client: SupabaseClient,
  roundId: string,
): Promise<
  Array<{
    id: string;
    status: "building" | "locked" | "settled";
    credits_start: number;
    selections: Array<{
      id: string;
      stake: number;
      odds: number;
      result: "pending" | "win" | "lose" | "void";
    }>;
  }>
> {
  const { data, error } = await client
    .from("entries")
    .select(
      "id, status, credits_start, entry_selections(id, stake, pick_options(odds, result))",
    )
    .eq("round_id", roundId)
    .in("status", ["building", "locked", "settled"]);

  if (error) {
    throw error;
  }

  return (data ?? []).map((entry: any) => ({
    id: entry.id,
    status: entry.status,
    credits_start: entry.credits_start,
    selections: (entry.entry_selections ?? []).map((selection: any) => {
      const option = unwrapSingle(selection.pick_options);
      return {
        id: selection.id,
        stake: selection.stake,
        odds: Number(option?.odds ?? 1),
        result: option?.result ?? "pending",
      };
    }),
  }));
}

export async function updateRoundStatus(
  client: SupabaseClient,
  roundId: string,
  status: "draft" | "open" | "locked" | "settled",
): Promise<void> {
  const { error } = await client.from("rounds").update({ status }).eq("id", roundId);

  if (error) {
    throw error;
  }
}
