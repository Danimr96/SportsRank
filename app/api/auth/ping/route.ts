import { NextResponse } from "next/server";

export async function GET() {
  const url = process.env["NEXT_PUBLIC_SUPABASE_URL"];
  const anonKey = process.env["NEXT_PUBLIC_SUPABASE_ANON_KEY"];

  if (!url || !anonKey) {
    return NextResponse.json(
      {
        ok: false,
        hasUrl: Boolean(url),
        hasAnonKey: Boolean(anonKey),
        error: "Missing Supabase env vars in runtime.",
      },
      { status: 500 },
    );
  }

  try {
    const healthResponse = await fetch(`${url}/auth/v1/health`, {
      headers: {
        apikey: anonKey,
      },
    });

    const healthText = await healthResponse.text();
    return NextResponse.json(
      {
        ok: healthResponse.ok,
        status: healthResponse.status,
        body: healthText.slice(0, 500),
      },
      { status: healthResponse.ok ? 200 : 502 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: (error as Error).message || "fetch failed",
      },
      { status: 500 },
    );
  }
}
