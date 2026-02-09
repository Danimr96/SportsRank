"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export interface PasswordAuthResult {
  ok: boolean;
  error?: string;
  needsEmailConfirmation?: boolean;
}

interface PasswordAuthInput {
  email: string;
  password: string;
}

function normalizeCredentials(input: PasswordAuthInput): PasswordAuthInput {
  return {
    email: input.email.trim().toLowerCase(),
    password: input.password,
  };
}

function mapAuthError(error: unknown): string {
  const message = (error as { message?: string })?.message ?? "Authentication failed.";
  if (message.toLowerCase().includes("invalid login credentials")) {
    return "Invalid email or password.";
  }
  return message;
}

export async function signInWithPasswordAction(
  input: PasswordAuthInput,
): Promise<PasswordAuthResult> {
  const supabase = await createClient();
  const credentials = normalizeCredentials(input);

  const { error } = await supabase.auth.signInWithPassword({
    email: credentials.email,
    password: credentials.password,
  });

  if (error) {
    return {
      ok: false,
      error: mapAuthError(error),
    };
  }

  return { ok: true };
}

export async function signUpWithPasswordAction(
  input: PasswordAuthInput,
): Promise<PasswordAuthResult> {
  const supabase = await createClient();
  const credentials = normalizeCredentials(input);

  const { data, error } = await supabase.auth.signUp({
    email: credentials.email,
    password: credentials.password,
  });

  if (error) {
    return {
      ok: false,
      error: mapAuthError(error),
    };
  }

  if (!data.session) {
    return {
      ok: true,
      needsEmailConfirmation: true,
    };
  }

  return { ok: true };
}

export async function signOutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
