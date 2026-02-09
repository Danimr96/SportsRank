import type { SupabaseClient } from "@supabase/supabase-js";
import type { Entry, EntrySelection } from "@/lib/types";

function unwrapSingle<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }
  return value ?? null;
}

function mapEntry(row: any): Entry {
  return {
    id: row.id,
    round_id: row.round_id,
    user_id: row.user_id,
    status: row.status,
    credits_start: row.credits_start,
    credits_end: row.credits_end,
    locked_at: row.locked_at,
    created_at: row.created_at,
  };
}

export async function getEntryByRoundAndUser(
  client: SupabaseClient,
  roundId: string,
  userId: string,
): Promise<Entry | null> {
  const { data, error } = await client
    .from("entries")
    .select(
      "id, round_id, user_id, status, credits_start, credits_end, locked_at, created_at",
    )
    .eq("round_id", roundId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ? mapEntry(data) : null;
}

export async function getEntryById(
  client: SupabaseClient,
  entryId: string,
): Promise<Entry | null> {
  const { data, error } = await client
    .from("entries")
    .select(
      "id, round_id, user_id, status, credits_start, credits_end, locked_at, created_at",
    )
    .eq("id", entryId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ? mapEntry(data) : null;
}

export async function createEntry(
  client: SupabaseClient,
  payload: { round_id: string; user_id: string; credits_start: number },
): Promise<Entry> {
  const { data, error } = await client
    .from("entries")
    .insert({
      round_id: payload.round_id,
      user_id: payload.user_id,
      credits_start: payload.credits_start,
    })
    .select(
      "id, round_id, user_id, status, credits_start, credits_end, locked_at, created_at",
    )
    .single();

  if (error) {
    throw error;
  }

  return mapEntry(data);
}

export async function getOrCreateEntry(
  client: SupabaseClient,
  payload: { round_id: string; user_id: string; credits_start: number },
): Promise<Entry> {
  const existing = await getEntryByRoundAndUser(
    client,
    payload.round_id,
    payload.user_id,
  );

  if (existing) {
    return existing;
  }

  return createEntry(client, payload);
}

export async function listEntrySelections(
  client: SupabaseClient,
  entryId: string,
): Promise<EntrySelection[]> {
  const { data, error } = await client
    .from("entry_selections")
    .select("id, entry_id, pick_id, pick_option_id, stake, payout")
    .eq("entry_id", entryId);

  if (error) {
    throw error;
  }

  return (data ?? []).map((row: any) => ({
    id: row.id,
    entry_id: row.entry_id,
    pick_id: row.pick_id,
    pick_option_id: row.pick_option_id,
    stake: row.stake,
    payout: row.payout,
  }));
}

export async function upsertEntrySelection(
  client: SupabaseClient,
  payload: {
    entry_id: string;
    pick_id: string;
    pick_option_id: string;
    stake: number;
  },
): Promise<void> {
  const { error } = await client.from("entry_selections").upsert(payload, {
    onConflict: "entry_id,pick_id",
  });

  if (error) {
    throw error;
  }
}

export async function lockEntry(
  client: SupabaseClient,
  entryId: string,
): Promise<void> {
  const { error } = await client
    .from("entries")
    .update({ status: "locked", locked_at: new Date().toISOString() })
    .eq("id", entryId)
    .eq("status", "building");

  if (error) {
    throw error;
  }
}

export async function unlockEntry(
  client: SupabaseClient,
  entryId: string,
): Promise<void> {
  const { error } = await client
    .from("entries")
    .update({ status: "building", locked_at: null })
    .eq("id", entryId)
    .eq("status", "locked");

  if (error) {
    throw error;
  }
}

export async function settleEntryRecord(
  client: SupabaseClient,
  payload: { entryId: string; creditsEnd: number },
): Promise<void> {
  const { error } = await client
    .from("entries")
    .update({ status: "settled", credits_end: payload.creditsEnd })
    .eq("id", payload.entryId);

  if (error) {
    throw error;
  }
}

export async function updateSelectionPayout(
  client: SupabaseClient,
  payload: { selectionId: string; payout: number },
): Promise<void> {
  const { error } = await client
    .from("entry_selections")
    .update({ payout: payload.payout })
    .eq("id", payload.selectionId);

  if (error) {
    throw error;
  }
}

export async function listRecentEntriesByUser(
  client: SupabaseClient,
  userId: string,
  limit = 10,
): Promise<
  Array<{
    id: string;
    status: string;
    credits_start: number;
    credits_end: number | null;
    locked_at: string | null;
    created_at: string;
    round_id: string;
    round_name: string;
  }>
> {
  const { data, error } = await client
    .from("entries")
    .select(
      "id, status, credits_start, credits_end, locked_at, created_at, round_id, rounds(name)",
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw error;
  }

  return (data ?? []).map((row: any) => {
    const round = unwrapSingle(row.rounds);

    return {
      id: row.id,
      status: row.status,
      credits_start: row.credits_start,
      credits_end: row.credits_end,
      locked_at: row.locked_at,
      created_at: row.created_at,
      round_id: row.round_id,
      round_name: round?.name ?? "Unknown round",
    };
  });
}
