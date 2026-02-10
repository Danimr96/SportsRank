import type { SupabaseClient } from "@supabase/supabase-js";
import type { CalendarEvent, FeaturedEvent } from "@/lib/types";

function mapEvent(row: any): CalendarEvent {
  return {
    id: row.id,
    provider: row.provider,
    provider_event_id: row.provider_event_id,
    sport_slug: row.sport_slug,
    league: row.league,
    start_time: row.start_time,
    home: row.home ?? null,
    away: row.away ?? null,
    status: row.status,
    participants: row.participants ?? null,
    metadata: row.metadata ?? null,
  };
}

function mapFeaturedEvent(row: any): FeaturedEvent {
  return {
    id: row.id,
    featured_date: row.featured_date,
    sport_slug: row.sport_slug,
    league: row.league ?? null,
    event_id: row.event_id,
    bucket: row.bucket,
    created_at: row.created_at,
  };
}

function parseEventName(rawEvent: string): { home: string | null; away: string | null } {
  const trimmed = rawEvent.trim();
  if (!trimmed) {
    return { home: null, away: null };
  }

  const match = trimmed.match(/\s+vs\.?\s+/i);
  if (!match || typeof match.index !== "number") {
    return { home: trimmed, away: null };
  }

  const home = trimmed.slice(0, match.index).trim();
  const away = trimmed.slice(match.index + match[0].length).trim();
  return {
    home: home.length > 0 ? home : null,
    away: away.length > 0 ? away : null,
  };
}

export async function listUpcomingEvents(
  client: SupabaseClient,
  input: {
    fromIso: string;
    toIso: string;
  },
): Promise<CalendarEvent[]> {
  const { data, error } = await client
    .from("events")
    .select(
      "id, provider, provider_event_id, sport_slug, league, start_time, home, away, status, participants, metadata",
    )
    .gte("start_time", input.fromIso)
    .lte("start_time", input.toIso)
    .order("start_time", { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []).map(mapEvent);
}

export async function listFeaturedEventsForDate(
  client: SupabaseClient,
  featuredDate: string,
): Promise<FeaturedEvent[]> {
  const { data, error } = await client
    .from("featured_events")
    .select("id, featured_date, sport_slug, league, event_id, bucket, created_at")
    .eq("featured_date", featuredDate)
    .order("bucket", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []).map(mapFeaturedEvent);
}

export async function listUpcomingEventsFromRoundPicks(
  client: SupabaseClient,
  input: {
    roundId: string;
    fromIso: string;
    toIso: string;
  },
): Promise<CalendarEvent[]> {
  const { data, error } = await client
    .from("picks")
    .select("id, title, metadata, sports(slug)")
    .eq("round_id", input.roundId)
    .order("order_index", { ascending: true });

  if (error) {
    throw error;
  }

  const fromMs = Date.parse(input.fromIso);
  const toMs = Date.parse(input.toIso);

  const rows = (data ?? []) as any[];
  const events: CalendarEvent[] = [];
  for (const row of rows) {
    const metadata = row.metadata;
    if (!metadata || typeof metadata !== "object") {
      continue;
    }

    const startTime = typeof metadata["start_time"] === "string" ? metadata["start_time"] : null;
    const eventName = typeof metadata["event"] === "string" ? metadata["event"] : null;
    const league = typeof metadata["league"] === "string" ? metadata["league"] : "Unknown League";
    if (!startTime || !eventName) {
      continue;
    }

    const startMs = Date.parse(startTime);
    if (!Number.isFinite(startMs)) {
      continue;
    }
    if (startMs < fromMs || startMs > toMs) {
      continue;
    }

    const sportEntry = Array.isArray(row.sports) ? row.sports[0] : row.sports;
    const sportSlug = typeof sportEntry?.slug === "string" ? sportEntry.slug : "unknown";
    const parsedNames = parseEventName(eventName);
    const providerEventId = `pick:${row.id}`;

    events.push({
      id: providerEventId,
      provider: "round_picks",
      provider_event_id: providerEventId,
      sport_slug: sportSlug,
      league,
      start_time: startTime,
      home: parsedNames.home,
      away: parsedNames.away,
      status: "scheduled",
      participants: [parsedNames.home, parsedNames.away].filter(
        (value): value is string => Boolean(value && value.trim()),
      ),
      metadata: {
        source: "round_picks",
        pick_id: row.id,
        pick_title: row.title,
      },
    });
  }

  const deduped = new Map<string, CalendarEvent>();
  for (const event of events) {
    const key = `${event.sport_slug}|${event.league}|${event.start_time}|${event.home ?? ""}|${event.away ?? ""}`;
    if (!deduped.has(key)) {
      deduped.set(key, event);
    }
  }

  return Array.from(deduped.values()).sort((left, right) =>
    left.start_time.localeCompare(right.start_time),
  );
}
