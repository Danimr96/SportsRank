export interface ProviderEvent {
  id: string;
  sport_slug: string;
  league: string;
  event: string;
  start_time: string;
}

export interface ProviderMarketOption {
  label: string;
  odds: number;
}

export interface ProviderEventOdds {
  event_id: string;
  market: string;
  options: ProviderMarketOption[];
}

export interface OddsProvider {
  fetchUpcomingEvents(
    sports: string[],
    start: string,
    end: string,
  ): Promise<ProviderEvent[]>;

  fetchOddsForEvents(
    eventIds: string[],
    markets: string[],
  ): Promise<ProviderEventOdds[]>;
}
