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
    const { data, error } = await supabase.auth.signUp(credentials);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      {
        ok: true,
        needsEmailConfirmation: !data.session,
      },
      { status: 200 },
    );
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: (error as Error).message || "Sign up failed." },
      { status: 500 },
    );
  }
}
