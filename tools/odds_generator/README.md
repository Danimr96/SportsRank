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
  - `OPENAI_API_KEY` (optional, only required when `--use-openai true`)

## Setup (uv)

From repo root:

```bash
uv sync --project tools/odds_generator --extra dev
```

## CLI usage

```bash
uv run --project tools/odds_generator \
  python -m tools.odds_generator.generate \
  --round-id 123e4567-e89b-12d3-a456-426614174000 \
  --mode both \
  --sports-config tools/odds_generator/sports_map.base.yaml,tools/odds_generator/sports_map.auto.yaml \
  --markets h2h,totals,spreads \
  --regions eu,uk,us \
  --daily-target 25 \
  --weekly-target 50 \
  --outdir ./generated \
  --use-openai false
```

Optional:

- `--bookmakers draftkings,fanduel`

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

Selection is deterministic and distribution-aware:

- Football (`soccer`) is prioritized.
- The selector attempts a balanced multi-sport pack (targeting at least 5 sports and minimum quotas per sport when available).
- If a configured sport key is unavailable or fails to fetch, it is skipped with a warning (generation continues).

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
