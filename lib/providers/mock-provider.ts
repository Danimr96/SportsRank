import type {
  OddsProvider,
  ProviderEvent,
  ProviderEventOdds,
} from "@/lib/providers/types";

const DEFAULT_LEAGUE_BY_SPORT: Record<string, string> = {
  soccer: "UEFA",
  basketball: "NBA",
  tennis: "ATP",
  "american-football": "NFL",
};

function deterministicHash(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }

  return hash;
}

function toOdds(seed: string, min: number, max: number): number {
  const hash = deterministicHash(seed);
  const span = max - min;
  const value = min + (hash % 1000) / 1000 * span;
  return Math.round(value * 100) / 100;
}

function buildOptions(eventId: string, market: string) {
  if (market === "totals") {
    return [
      { label: "Over", odds: toOdds(`${eventId}-${market}-over`, 1.4, 3.4) },
      { label: "Under", odds: toOdds(`${eventId}-${market}-under`, 1.4, 3.4) },
    ];
  }

  if (market === "spread") {
    return [
      { label: "Home -1.5", odds: toOdds(`${eventId}-${market}-home`, 1.5, 3.1) },
      { label: "Away +1.5", odds: toOdds(`${eventId}-${market}-away`, 1.5, 3.1) },
    ];
  }

  return [
    { label: "Home", odds: toOdds(`${eventId}-${market}-home`, 1.3, 2.8) },
    { label: "Away", odds: toOdds(`${eventId}-${market}-away`, 1.3, 2.8) },
  ];
}

export class MockProvider implements OddsProvider {
  async fetchUpcomingEvents(
    sports: string[],
    start: string,
    end: string,
  ): Promise<ProviderEvent[]> {
    const startTime = new Date(start).getTime();
    const endTime = new Date(end).getTime();

    if (Number.isNaN(startTime) || Number.isNaN(endTime) || endTime <= startTime) {
      return [];
    }

    const events: ProviderEvent[] = [];

    sports.forEach((sport, sportIndex) => {
      const league = DEFAULT_LEAGUE_BY_SPORT[sport] ?? "International";

      for (let eventOffset = 0; eventOffset < 4; eventOffset += 1) {
        const startAt = new Date(startTime + (sportIndex * 4 + eventOffset) * 2 * 3600 * 1000);

        if (startAt.getTime() > endTime) {
          continue;
        }

        events.push({
          id: `${sport}-${sportIndex + 1}-${eventOffset + 1}`,
          sport_slug: sport,
          league,
          event: `${sport.toUpperCase()} Match ${eventOffset + 1}`,
          start_time: startAt.toISOString(),
        });
      }
    });

    return events;
  }

  async fetchOddsForEvents(
    eventIds: string[],
    markets: string[],
  ): Promise<ProviderEventOdds[]> {
    const normalizedMarkets = markets.length > 0 ? markets : ["moneyline"];

    const odds: ProviderEventOdds[] = [];

    for (const eventId of eventIds) {
      for (const market of normalizedMarkets) {
        odds.push({
          event_id: eventId,
          market,
          options: buildOptions(eventId, market),
        });
      }
    }

    return odds;
  }
}
