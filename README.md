# SportsRank MVP

Minimal full-stack MVP for weekly pick portfolios.

## Weekly model
- One round per week using `opens_at`/`closes_at` (for example Mon 00:00 to Sun 23:59).
- User starts each round with `10,000` credits.
- Unused credits are allowed as cash (full spend is optional unless admin enables `enforce_full_budget`).
- Selection stake rules are configured per round (`stake_step`, `min_stake`, `max_stake`).
- Default configuration uses `stake_step=100`, with min/max suggested from formula (2%-8% of `starting_credits`, rounded to step).
- Each stake must be a multiple of `stake_step` (no one-by-one staking).
- A selection can be edited only while:
  - entry status is `building`
  - `now < round.closes_at`
  - `now < pick.metadata.start_time`

## Stack
- Next.js App Router + TypeScript (strict mode)
- Tailwind + shadcn-style UI primitives
- Framer Motion
- Supabase Auth + Postgres + RLS
- Vitest (domain unit tests)
- PWA shell (manifest + service worker + mobile install support)

## Project structure
```text
app/
  actions/
  analytics/
  admin/
  dashboard/
  history/
  leaderboard/[roundId]/
  login/
  round/[roundId]/
components/
  admin/
  auth/
  layout/
  leaderboard/
  picks/
  ui/
lib/
  auth.ts
  data/
  domain/
  ingestion/
  providers/
  supabase/
  types.ts
docs/
  architecture.md
  data-model.md
  rls.md
supabase/
  migrations/
  seed.sql
tests/domain/
tests/ingestion/
```

## Environment variables
Create `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
# Optional product analytics forwarding
POSTHOG_API_KEY=your_posthog_project_api_key
POSTHOG_HOST=https://us.i.posthog.com
# Tooling-only (odds generator / CI jobs, never in Next.js runtime)
SUPABASE_URL=your_supabase_project_url
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
ODDS_API_KEY=your_the_odds_api_key
SPORTSDATA_API_KEY=your_sportsdata_io_key
SPORTSDATA_BASE_URL=https://api.sportsdata.io/v3
OPENAI_API_KEY=optional_for_featured_selection
```

## Setup
1. Install dependencies:
```bash
npm install
```

2. Apply database schema (Supabase CLI example):
```bash
supabase db push
```

3. (Optional) Seed sports:
```bash
supabase db reset
# or run supabase/seed.sql manually in SQL editor
```

4. Run the app:
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Admin bootstrap
1. Create a user account via `/login`.
2. In Supabase SQL editor, insert that user into `admins`:

```sql
insert into public.admins (user_id)
values ('<your-auth-user-uuid>')
on conflict (user_id) do nothing;
```

3. Reload `/admin/rounds`.

## Admin import/generate
- `/admin/import`
  - Accepts JSON file upload or pasted payload.
  - Validates schema + constraints server-side.
  - Shows preview summary (counts by sport, total picks, min/max odds).
  - Inserts picks/options only when round is `draft`.
  - JSON generator contract:
    - `sport_slug` must match `sports.slug` in DB.
    - Current slugs: `soccer`, `basketball`, `tennis`, `golf`, `motor`, `american-football`, `baseball`, `hockey`, `combat`.
    - `metadata.start_time` must be ISO 8601 UTC (e.g. `2026-02-09T18:00:00.000Z`).
    - Title prefix should be `[DAILY]` or `[WEEK]` for dashboard filtering.

- `/admin/generate`
  - Uses `MockProvider` (deterministic) to fetch events + odds.
  - Transforms provider data into picks payload via pure ingestion functions.
  - Validates + previews before optional insert.
  - Inserts picks/options only when round is `draft`.

- `/analytics`
  - Interactive analytics for personal and global settled performance.
  - Filters by board (`daily|weekly|other`) and sport.
  - Tabs for `Live`, `Por jornada`, and `Histórico`.
  - Live classification shows current/best/worst potential rank bands.
  - Visual breakdowns by sport, weekday, and stake profile.

- `/dashboard`
  - Includes Live Coach scenario simulator (`Conservador | Base | Agresivo`).
  - Stake suggestions are explainable and user-confirmed (never auto-applied).
  - Daily Pulse block with upcoming windows and mission progress.

- `/calendar`
  - Event-centric timeline sourced from `public.events`.
  - Highlights rows selected in `public.featured_events` for the local date.

## Bet UX notes
- Odds are shown in European decimal style on pick UI (`1,85` format).
- Pick drawer shows potential return from selected stake and odds (`floor(stake * odds)`).
- Pick drawer uses stake presets plus `+/-` step controls (default step `100`).
- Dashboard hierarchy stays organized as Sport → Board (Daily/Weekly) → Country → League → Event.

### JSON import schema
```json
{
  "round_id": "uuid",
  "picks": [
    {
      "sport_slug": "soccer",
      "title": "[DAILY] Barcelona vs Real Madrid · moneyline",
      "description": "Main market",
      "order_index": 0,
      "options": [
        { "label": "Barcelona", "odds": 1.9 },
        { "label": "Real Madrid", "odds": 2.2 }
      ],
      "metadata": {
        "league": "LaLiga",
        "event": "Barcelona vs Real Madrid",
        "start_time": "2026-02-09T18:00:00.000Z"
      }
    }
  ]
}
```

Important: odds are never fabricated inside gameplay logic. They must come from admin-imported JSON or a provider pipeline.
`metadata.start_time` is required for import/generation and is used to lock pick editing when events start.
The standalone odds generator defaults now target lighter packs (`daily=20`, `weekly=16`) and can be overridden per run.

## Calendar + featured generation (tooling)
Sync full event calendar, select featured events, and build daily pack from featured odds:

```bash
uv run --project tools/odds_generator \
  python -m tools.odds_generator.generate \
  --round-id <round_uuid> \
  --mode daily \
  --sync-calendar true \
  --build-featured true \
  --generate-featured-picks true \
  --persist-supabase true \
  --outdir ./generated
```

## Scripts
- `npm run dev` - local dev server
- `npm run dev:reset` - clears Next/dev caches then starts dev server
- `npm run build` - production build
- `npm run lint` - lint checks
- `npm run typecheck` - strict TypeScript check
- `npm run test` - domain unit tests

## PWA notes
- Installable on mobile/desktop via browser install prompt.
- Includes offline read-only shell (`public/offline.html`).
- Service worker is registered in production only.

## UI color logic
- Centralized color system: `lib/ui/color-system.ts`
- Core palette:
  - `bone`: `#E3DCD2`
  - `ink`: `#100C0D`
  - `forest`: `#013328`
  - `clay`: `#CC8B65`
- Sport palette:
  - `soccer` (Football): emerald
  - `basketball`: orange
  - `tennis`: cyan/blue
  - `golf`: lime/emerald
  - `motor`: violet/fuchsia
- Board palette:
  - `daily`: emerald family
  - `weekly`: violet family
  - `other`: neutral slate
- Action buttons (semantic):
  - `primary`: forest fill + bone text
  - `secondary`: clay accent
  - `neutral`: warm outline

## Troubleshooting
- If you see a Next dev manifest error like:
  - `Could not find the module ... segment-explorer-node.js#SegmentViewNode`
  - `__webpack_modules__[moduleId] is not a function`
  run:
  ```bash
  npm run dev:reset
  ```

## Domain logic (pure functions)
- `lib/domain/validation.ts`
- `lib/domain/settlement.ts`
- `lib/domain/ranking.ts`

These modules contain the critical rules and are covered by tests under `tests/domain`.

## Ingestion logic (pure functions)
- `lib/ingestion/validation.ts`
- `lib/ingestion/transform.ts`
- `lib/ingestion/plan.ts`
- `lib/providers/mock-provider.ts`

These modules are covered by tests under `tests/ingestion`.

## RLS and schema docs
- `docs/architecture.md`
- `docs/data-model.md`
- `docs/rls.md`

## Git controls
1. Initialize hooks:
```bash
./scripts/setup-git-hooks.sh
```

2. Hook behavior:
- `.githooks/pre-commit` runs `typecheck`, `lint`, and `test` before each commit.

3. Suggested branch flow:
- `main` protected/stable
- feature branches: `feat/<name>` or `fix/<name>`
- merge via PR after CI passes

## Publish to GitHub
If you create the repository in GitHub web first, then run:
```bash
git remote add origin https://github.com/<your-user>/<your-repo>.git
git add .
git commit -m "chore: initial SportsRank MVP"
git push -u origin main
```
