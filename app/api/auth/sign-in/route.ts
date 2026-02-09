import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

interface AuthPayload {
  email?: string;
  password?: string;
}

function normalizePayload(payload: AuthPayload): { email: string; password: string } {
  return {
    email: (payload.email ?? "").trim().toLowerCase(),
    password: payload.password ?? "",
  };
}

function normalizeErrorMessage(message: string): string {
  if (message.toLowerCase().includes("invalid login credentials")) {
    return "Invalid email or password.";
  }
  return message;
}

export async function POST(request: Request) {
  let payload: AuthPayload;
  try {
    payload = (await request.json()) as AuthPayload;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request payload." }, { status: 400 });
  }

  const credentials = normalizePayload(payload);
  if (!credentials.email || !credentials.password) {
    return NextResponse.json(
      { ok: false, error: "Email and password are required." },
      { status: 400 },
    );
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword(credentials);

    if (error) {
      return NextResponse.json(
        { ok: false, error: normalizeErrorMessage(error.message) },
        { status: 401 },
      );
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: (error as Error).message || "Sign in failed." },
      { status: 500 },
    );
  }
}
