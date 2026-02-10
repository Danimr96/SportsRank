# Odds Generator Utility

Standalone Python utility that builds SportsRank `/admin/import` JSON payloads from The Odds API responses.

It also supports a daily auto-generated sports map:

- Base config: `tools/odds_generator/sports_map.base.yaml` (hand-maintained)
- Auto config: `tools/odds_generator/sports_map.auto.yaml` (generated)
- Runtime merge: base wins on key conflicts, auto only adds new keys

## Requirements

- Python 3.11+
- [uv](https://docs.astral.sh/uv/) recommended
- Env vars in repo root `.env.local` or shell:
  - `ODDS_API_KEY` (required)
  - `ODDS_API_BASE_URL` (optional, default `https://api.the-odds-api.com`)
  - `SPORTSDATA_API_KEY` (required only with `--provider sportsdata`)
  - `SPORTSDATA_BASE_URL` (optional, default `https://api.sportsdata.io/v3`)
  - `SPORTSDATA_SOCCER_COMPETITIONS` (optional CSV, e.g. `UCL,EPL,ESP`, used when soccer map does not pin competitions)
  - `OPENAI_API_KEY` (optional, only required when `--use-openai true`)
  - `SUPABASE_URL` (required when persisting packs)
  - `SUPABASE_SERVICE_ROLE_KEY` (required when persisting packs, **sensitive**)

## Setup (uv)

From repo root:

```bash
uv sync --project tools/odds_generator --extra dev
```

## CLI usage

Daily:

```bash
uv run --project tools/odds_generator \
  python -m tools.odds_generator.generate \
  --provider theodds \
  --round-id 123e4567-e89b-12d3-a456-426614174000 \
  --mode daily \
  --outdir ./generated \
  --persist-supabase true
```

Weekly:

```bash
uv run --project tools/odds_generator \
  python -m tools.odds_generator.generate \
  --provider theodds \
  --round-id 123e4567-e89b-12d3-a456-426614174000 \
  --mode weekly \
  --outdir ./generated \
  --persist-supabase true
```

Both:

```bash
uv run --project tools/odds_generator \
  python -m tools.odds_generator.generate \
  --provider theodds \
  --round-id 123e4567-e89b-12d3-a456-426614174000 \
  --mode both \
  --sports-config tools/odds_generator/sports_map.base.yaml,tools/odds_generator/sports_map.auto.yaml \
  --markets h2h,totals,spreads \
  --regions eu,uk,us \
  --daily-target 20 \
  --weekly-target 16 \
  --outdir ./generated \
  --persist-supabase true \
  --use-openai false
```

Optional:

- `--bookmakers draftkings,fanduel`
- `--persist-supabase false` to skip Supabase writes
- `--supabase-url ...` and `--supabase-service-role-key ...` (env fallback supported)
- `--source live|raw-jornada` (default `live`)
- `--raw-dir ./generated/raw` when using `--source raw-jornada`
- `--provider theodds|sportsdata` (default `theodds`)
- `--sportsdata-sync-days N` for calendar sync window control when using SportsData.
- `--merge-raw-soccer true|false` (default `true` on SportsData runs). When enabled, soccer events/candidates from previous The Odds raw snapshots are merged without duplicates.

## SportsData quick start (quota-friendly)

Use SportsData without changing Next.js:

```bash
uv run --project tools/odds_generator \
  python -m tools.odds_generator.generate \
  --provider sportsdata \
  --round-id 123e4567-e89b-12d3-a456-426614174000 \
  --mode daily \
  --sync-calendar true \
  --build-featured true \
  --generate-featured-picks true \
  --persist-supabase true \
  --outdir ./generated
```

Mixed mode (SportsData + historical The Odds soccer snapshots):

```bash
uv run --project tools/odds_generator \
  python -m tools.odds_generator.generate \
  --provider sportsdata \
  --round-id 123e4567-e89b-12d3-a456-426614174000 \
  --mode daily \
  --sync-calendar true \
  --build-featured true \
  --generate-featured-picks true \
  --merge-raw-soccer true \
  --raw-dir ./generated/raw \
  --persist-supabase true \
  --outdir ./generated
```

Default sports map for SportsData is:
- `tools/odds_generator/config/sportsdata_map.base.yaml`
  - Soccer uses competition-scoped odds endpoints in SportsData v4 (`/soccer/odds/.../{competition}/{date}`).
  - You can pin competitions directly in map via:
    - `provider_sport: soccer:UCL,EPL,ESP`
  - Or by env var:
    - `SPORTSDATA_SOCCER_COMPETITIONS=UCL,EPL,ESP`

Quota behavior:
- Monday syncs full week (Mon..Sun).
- Tue..Sun syncs today + tomorrow only.
- Override with `--sportsdata-sync-days`.

## Calendar + featured pipeline (events-first)

This pipeline separates:
1. Calendar sync (`public.events`) without odds.
2. Featured event selection (`public.featured_events`) for a local date.
3. Picks generation only for featured events with real odds.

Run all three steps together:

```bash
uv run --project tools/odds_generator \
  python -m tools.odds_generator.generate \
  --round-id 123e4567-e89b-12d3-a456-426614174000 \
  --mode daily \
  --sync-calendar true \
  --build-featured true \
  --generate-featured-picks true \
  --featured-config tools/odds_generator/config/featured_quotas.yaml \
  --persist-supabase true \
  --outdir ./generated
```

Step-only examples:

- Sync calendar only:
```bash
uv run --project tools/odds_generator \
  python -m tools.odds_generator.generate \
  --round-id 123e4567-e89b-12d3-a456-426614174000 \
  --sync-calendar true \
  --build-featured false \
  --generate-featured-picks false
```

- Build featured only (from already synced events):
```bash
uv run --project tools/odds_generator \
  python -m tools.odds_generator.generate \
  --round-id 123e4567-e89b-12d3-a456-426614174000 \
  --sync-calendar false \
  --build-featured true \
  --generate-featured-picks false \
  --featured-date 2026-02-10
```

- Generate picks only from existing featured rows:
```bash
uv run --project tools/odds_generator \
  python -m tools.odds_generator.generate \
  --round-id 123e4567-e89b-12d3-a456-426614174000 \
  --sync-calendar false \
  --build-featured false \
  --generate-featured-picks true \
  --max-markets-per-event 2 \
  --persist-supabase true
```

## Build sports map (auto)

```bash
uv run --project tools/odds_generator \
  python -m tools.odds_generator.generate \
  --build-sports-map \
  --base tools/odds_generator/sports_map.base.yaml \
  --out tools/odds_generator/sports_map.auto.yaml \
  --mode both \
  --regions eu,uk,us \
  --markets h2h,totals,spreads \
  --use-openai false
```

`--use-openai true` is optional and only used to justify/select tennis + one extra key. Guardrails still validate keys and fallback to deterministic rules on invalid output.

Auto YAML format:

```yaml
soccer_epl:
  app_slug: soccer
  league: EPL
  allow_daily: true
  allow_weekly: true
```

## Outputs

- `generated/daily_picks_<YYYY-MM-DD>.json`
- `generated/weekly_picks_<YYYY-WW>.json`
- Raw audit files:
  - `generated/raw/daily/<timestamp>_<sport>.json`
  - `generated/raw/weekly/<timestamp>_<sport>.json`

The generator never invents odds. Odds in output always come from The Odds API raw responses.

When persistence is enabled, each generated pack is also upserted into Supabase table
`public.pick_packs` keyed by `(round_id, pack_type, anchor_date)`.

For the featured pipeline, Supabase persistence also writes:
- `public.events` (calendar sync)
- `public.featured_events` (daily playable subset)

## Daily/weekly anchor freeze logic

Timezone for anchor computation: `Europe/Madrid`.

- Daily anchor date = local today.
- Weekly anchor date:
  - Mon/Tue/Wed: local today.
  - Thu/Fri/Sat/Sun: Thursday of the same local week.

Seeds:

- `daily_seed = DAILY|{anchor_date}|{round_id}`
- `weekly_seed = WEEKLY|{anchor_date}|{round_id}`

Deterministic path (`--use-openai false`) guarantees:

- same seed + same API inputs => identical selected candidates
- different seeds => selection ordering can change
- weekly freeze Thu-Sun is achieved by anchor-date seeding (not snapshot reuse)

## OpenAI agent on jornada extractions (quota-friendly)

When The Odds API credits are limited, generate from already extracted raw snapshots:

```bash
uv run --project tools/odds_generator \
  python -m tools.odds_generator.generate \
  --round-id 123e4567-e89b-12d3-a456-426614174000 \
  --mode both \
  --source raw-jornada \
  --raw-dir ./generated/raw \
  --use-openai true \
  --persist-supabase true
```

Behavior:

- Reads all raw extractions in the current local week (Monday 00:00 to now, Europe/Madrid).
- Builds candidates from those snapshots (latest candidate data wins by candidate_id).
- Filters candidates to each mode window (daily next 24h / weekly next 7d).
- Lets OpenAI rank/select if `--use-openai true`, without calling The Odds API again.

Selection is deterministic and distribution-aware (no invented odds, ever):

- Daily rules:
  - Football: league coverage first (La Liga, Premier League, Serie A, Bundesliga), with a hard cap of 5 picks per league.
  - Basketball: NBA capped at 5 picks (Euroleague/other basketball disabled in daily).
  - Tennis: up to 2 ATP matches, up to 2 WTA matches, plus ATP/WTA winner picks (if available).
  - Other sports mix: target 5 picks.
- Weekly rules:
  - Football: Europe-priority coverage and hard cap of 2 picks per league.
  - Basketball: NBA capped at 2 picks, Euroleague capped at 2 picks.
  - Tennis: ATP winner + WTA winner (if available).
  - Other sports mix: target 5 picks.
- If a block has insufficient candidates, quota is reallocated deterministically (football first, then best available respecting caps).
- If a configured sport key is unavailable or fails to fetch, it is skipped with a warning (generation continues).

## Security boundary

`SUPABASE_SERVICE_ROLE_KEY` is privileged and must only be used in:

- this standalone Python utility
- CI/cron jobs

It must never be used in Next.js runtime, client-side code, or public API routes.

Supported app slugs in generator mappings:
- `soccer`
- `basketball`
- `tennis`
- `golf`
- `motor`
- `american-football`
- `baseball`
- `hockey`
- `combat`

## Import into app

1. Open `/admin/import`.
2. Select the generated daily/weekly JSON file.
3. Preview and import into a draft round.

## JSON contract example

```json
{
  "round_id": "123e4567-e89b-12d3-a456-426614174000",
  "picks": [
    {
      "sport_slug": "soccer",
      "title": "[DAILY] Arsenal vs Chelsea - h2h",
      "description": "regions=eu,uk,us | bookmaker=draftkings",
      "order_index": 0,
      "options": [
        {"label": "Arsenal", "odds": 2.12},
        {"label": "Chelsea", "odds": 3.45}
      ],
      "metadata": {
        "league": "EPL",
        "event": "Arsenal vs Chelsea",
        "start_time": "2026-02-09T18:00:00.000Z"
      }
    }
  ]
}
```

## Testing

```bash
uv run --project tools/odds_generator python -m pytest tools/odds_generator/tests
```
