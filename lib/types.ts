export type RoundStatus = "draft" | "open" | "locked" | "settled";
export type OptionResult = "pending" | "win" | "lose" | "void";
export type EntryStatus = "building" | "locked" | "settled";

export interface Round {
  id: string;
  name: string;
  status: RoundStatus;
  opens_at: string;
  closes_at: string;
  starting_credits: number;
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
