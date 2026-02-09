import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export interface AuthUser {
  id: string;
  email?: string;
}

export async function getUserOrRedirect(): Promise<AuthUser> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return { id: user.id, email: user.email };
}

export async function getOptionalUser(): Promise<AuthUser | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  return { id: user.id, email: user.email };
}
