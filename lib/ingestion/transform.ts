import type { ImportedPicksPayload } from "@/lib/ingestion/types";
import type { ProviderEvent, ProviderEventOdds } from "@/lib/providers/types";

export function transformRawOddsToPicks(input: {
  round_id: string;
  events: ProviderEvent[];
  odds: ProviderEventOdds[];
}): ImportedPicksPayload {
  const eventById = new Map(input.events.map((event) => [event.id, event]));

  const sortedOdds = [...input.odds].sort((a, b) => {
    if (a.event_id === b.event_id) {
      return a.market.localeCompare(b.market);
    }
    return a.event_id.localeCompare(b.event_id);
  });

  const picks: ImportedPicksPayload["picks"] = [];

  for (const eventOdds of sortedOdds) {
    const event = eventById.get(eventOdds.event_id);
    if (!event) {
      continue;
    }

    picks.push({
      sport_slug: event.sport_slug,
      title: `${event.event} · ${eventOdds.market}`,
      description: `Market: ${eventOdds.market}`,
      order_index: picks.length,
      options: eventOdds.options.map((option) => ({
        label: option.label,
        odds: option.odds,
      })),
      metadata: {
        league: event.league,
        event: event.event,
        start_time: event.start_time,
      },
    });
  }

  return {
    round_id: input.round_id,
    picks,
  };
}
