import type { SupabaseClient } from "@supabase/supabase-js";
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
