import type { SupabaseClient } from "@supabase/supabase-js";
import type { Profile } from "@/lib/types";

export async function getProfileByUserId(
  client: SupabaseClient,
  userId: string,
): Promise<Profile | null> {
  const { data, error } = await client
    .from("profiles")
    .select("id, username, created_at")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data as Profile | null;
}

export async function upsertProfile(
  client: SupabaseClient,
  payload: { id: string; username: string },
): Promise<void> {
  const { error } = await client.from("profiles").upsert(payload, {
    onConflict: "id",
  });

  if (error) {
    throw error;
  }
}

export async function isAdminUser(
  client: SupabaseClient,
  userId: string,
): Promise<boolean> {
  const { data, error } = await client
    .from("admins")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (error && error.code !== "PGRST116") {
    throw error;
  }

  return Boolean(data);
}
