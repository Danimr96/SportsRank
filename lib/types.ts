export type RoundStatus = "draft" | "open" | "locked" | "settled";
export type OptionResult = "pending" | "win" | "lose" | "void";
export type EntryStatus = "building" | "locked" | "settled";
export type CalendarEventStatus = "scheduled" | "live" | "final";
export type FeaturedBucket = "today" | "tomorrow" | "week_rest";

export interface Round {
  id: string;
  name: string;
  status: RoundStatus;
  opens_at: string;
  closes_at: string;
  starting_credits: number;
  stake_step: number;
  min_stake: number;
  max_stake: number;
  enforce_full_budget: boolean;
}

export interface Sport {
  id: string;
  slug: string;
  name: string;
  icon: string | null;
}

export interface PickOption {
  id: string;
  pick_id: string;
  label: string;
  odds: number;
  result: OptionResult;
}

export interface Pick {
  id: string;
  round_id: string;
  sport_id: string;
  title: string;
  description: string | null;
  order_index: number;
  is_required: boolean;
  metadata: Record<string, unknown> | null;
}

export interface PickWithOptions extends Pick {
  sport: Sport;
  options: PickOption[];
}

export interface Entry {
  id: string;
  round_id: string;
  user_id: string;
  status: EntryStatus;
  credits_start: number;
  credits_end: number | null;
  locked_at: string | null;
  created_at: string;
}

export interface EntrySelection {
  id: string;
  entry_id: string;
  pick_id: string;
  pick_option_id: string;
  stake: number;
  payout: number | null;
}

export interface Profile {
  id: string;
  username: string;
  created_at: string;
}

export interface LeaderboardEntry {
  entry_id: string;
  user_id: string;
  username: string;
  credits_end: number;
  locked_at: string;
}

export interface CalendarEvent {
  id: string;
  provider: string;
  provider_event_id: string;
  sport_slug: string;
  league: string;
  start_time: string;
  home: string | null;
  away: string | null;
  status: string;
  participants: unknown;
  metadata: Record<string, unknown> | null;
}

export interface FeaturedEvent {
  id: string;
  featured_date: string;
  sport_slug: string;
  league: string | null;
  event_id: string;
  bucket: FeaturedBucket;
  created_at: string;
}

export interface PickPack {
  id: string;
  round_id: string;
  pack_type: "daily" | "weekly";
  anchor_date: string;
  seed: string;
  generated_at: string;
  payload: Record<string, unknown>;
  summary: Record<string, unknown>;
}
