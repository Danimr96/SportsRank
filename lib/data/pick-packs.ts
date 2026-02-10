import type { SupabaseClient } from "@supabase/supabase-js";
import type { PickPack } from "@/lib/types";

function mapPickPack(row: any): PickPack {
  return {
    id: row.id,
    round_id: row.round_id,
    pack_type: row.pack_type,
    anchor_date: row.anchor_date,
    seed: row.seed,
    generated_at: row.generated_at,
    payload: row.payload ?? {},
    summary: row.summary ?? {},
  };
}

export async function getPickPackByRoundAndDate(
  client: SupabaseClient,
  input: { roundId: string; packType: "daily" | "weekly"; anchorDate: string },
): Promise<PickPack | null> {
  const { data, error } = await client
    .from("pick_packs")
    .select("id, round_id, pack_type, anchor_date, seed, generated_at, payload, summary")
    .eq("round_id", input.roundId)
    .eq("pack_type", input.packType)
    .eq("anchor_date", input.anchorDate)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ? mapPickPack(data) : null;
}
