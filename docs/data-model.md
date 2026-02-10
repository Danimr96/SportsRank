# Data model

## Core tables
- `rounds`
  - Weekly unit of play.
  - Fields: `name`, `status`, `opens_at`, `closes_at`, `starting_credits`, `stake_step`, `min_stake`, `max_stake`, `enforce_full_budget`.
  - Weekly budget defaults: `starting_credits=10000`, `stake_step=100`.
  - Suggested stake range defaults are formula-based: `min≈2%`, `max≈8%` of `starting_credits`, rounded to `stake_step`.

- `sports`
  - Pick grouping dimension.
  - Fields: `slug`, `name`, `icon`.
  - Current MVP slugs:
    - `soccer`
    - `basketball`
    - `tennis`
    - `golf`
    - `motor`
    - `american-football`
    - `baseball`
    - `hockey`
    - `combat`

- `picks`
  - A decision users must make inside a round.
  - FK: `round_id -> rounds.id`, `sport_id -> sports.id`.
  - Fields: `title`, `description`, `order_index`, `is_required`, `metadata` (`jsonb`).
  - `metadata` is used by import/generation pipelines (league, event, start time).
  - MVP convention: `title` prefixes (`[DAILY]`, `[WEEK]`) power UI filtering.

- `pick_options`
  - Selectable outcomes per pick.
  - FK: `pick_id -> picks.id`.
  - Fields: `label`, `odds`, `result` (`pending|win|lose|void`).

- `entries`
  - User participation record per round.
  - FK: `round_id -> rounds.id`, `user_id -> profiles.id`.
  - Unique: `(round_id, user_id)`.
  - Fields: `status`, `credits_start`, `credits_end`, `locked_at`, `created_at`.

- `entry_selections`
  - Per-pick user choices and stake.
  - FK: `entry_id -> entries.id`, `pick_id -> picks.id`, `pick_option_id -> pick_options.id`.
  - Unique: `(entry_id, pick_id)`.
  - Fields: `stake`, `payout`.

## Calendar + featured distribution
- `events`
  - Canonical calendar feed (no picks/odds required).
  - Source: external provider sync job (`tools/odds_generator --sync-calendar`).
  - Fields:
    - `provider`, `provider_event_id` (unique pair)
    - `sport_slug`, `league`, `start_time`
    - `home`, `away`, `status`
    - `participants` (`jsonb`), `metadata` (`jsonb`)
  - Uniqueness: `(provider, provider_event_id)`.
  - Indexes:
    - `(sport_slug, start_time)`
    - `(league, start_time)`.

- `featured_events`
  - Daily “playable board” selector output.
  - One row per chosen calendar event for a specific local date.
  - Fields:
    - `featured_date` (Europe/Madrid date key)
    - `sport_slug`, `league` (nullable)
    - `event_id -> events.id`
    - `bucket` (`today|tomorrow|week_rest`)
  - Uniqueness: `(featured_date, event_id)`.

- `pick_packs`
  - Generated import payload snapshots persisted by tooling.
  - Fields:
    - `round_id`
    - `pack_type` (`daily|weekly`)
    - `anchor_date`
    - `seed`
    - `payload` (`jsonb`) - import-compatible picks JSON
    - `summary` (`jsonb`) - totals/min-max/counts.
  - Uniqueness: `(round_id, pack_type, anchor_date)`.

## Supporting tables
- `profiles`
  - `id` (same as `auth.users.id`), `username`.

- `admins`
  - List of users with admin privileges.

## Settlement formula
- `win`: `floor(stake * odds)`
- `lose`: `0`
- `void`: `stake`
- `cash_remaining`: `credits_start - sum(stake)` (non-negative)
- `credits_end`: `cash_remaining + sum(selection payouts)`

## Analytics function
- `get_global_analytics_selection_rows()`
  - Security-definer SQL function returning global settled selection rows as aggregate-safe dataset:
    - `sport_slug`
    - `sport_name`
    - `board_type` (derived from pick title prefix)
    - `event_start_time`
    - `stake`
    - `payout`
  - Used by `/analytics` for global trends.
