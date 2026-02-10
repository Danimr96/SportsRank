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
    const target = `${url}/auth/v1/health`;
    const healthResponse = await fetch(target, {
      headers: {
        apikey: anonKey,
      },
    });

    const healthText = await healthResponse.text();
    return NextResponse.json(
      {
        ok: healthResponse.ok,
        target,
        status: healthResponse.status,
        body: healthText.slice(0, 500),
      },
      { status: healthResponse.ok ? 200 : 502 },
    );
  } catch (error) {
    const err = error as Error & { cause?: unknown };
    return NextResponse.json(
      {
        ok: false,
        target: `${url}/auth/v1/health`,
        error: err.message || "fetch failed",
        cause:
          typeof err.cause === "object" && err.cause !== null
            ? JSON.stringify(err.cause)
            : err.cause,
      },
      { status: 500 },
    );
  }
}
