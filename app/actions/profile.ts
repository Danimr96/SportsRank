"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getUserOrRedirect } from "@/lib/auth";
import { upsertProfile } from "@/lib/data/users";

export async function saveProfileAction(formData: FormData): Promise<void> {
  const user = await getUserOrRedirect();
  const username = String(formData.get("username") ?? "").trim();

  if (username.length < 3) {
    throw new Error("Username must be at least 3 characters.");
  }

  const supabase = await createClient();
  await upsertProfile(supabase, { id: user.id, username });

  revalidatePath("/dashboard");
  revalidatePath("/history");
}
