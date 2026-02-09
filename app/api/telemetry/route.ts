import { NextResponse } from "next/server";
import type { AppEventInput } from "@/lib/telemetry/types";

interface IncomingEvent extends AppEventInput {
  ts?: string;
  sessionId?: string;
  path?: string;
}

function asDistinctId(input: IncomingEvent): string {
  if (typeof input.sessionId === "string" && input.sessionId.length > 0) {
    return input.sessionId;
  }
  return "anonymous";
}

export async function POST(request: Request) {
  let event: IncomingEvent | null = null;

  try {
    event = (await request.json()) as IncomingEvent;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  if (!event?.name) {
    return NextResponse.json({ ok: false, error: "missing_name" }, { status: 400 });
  }

  const posthogApiKey = process.env["POSTHOG_API_KEY"];
  const posthogHost = process.env["POSTHOG_HOST"] ?? "https://us.i.posthog.com";

  if (posthogApiKey) {
    try {
      await fetch(`${posthogHost}/capture/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          api_key: posthogApiKey,
          event: event.name,
          distinct_id: asDistinctId(event),
          properties: {
            ...event.payload,
            path: event.path ?? null,
            ts: event.ts ?? new Date().toISOString(),
            source: "sportsrank-web",
          },
        }),
      });
    } catch {
      // telemetry forwarding should never block product flow
    }
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
