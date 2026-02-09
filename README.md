# SportsRank MVP

Minimal full-stack MVP for weekly pick portfolios.

## Weekly model
- One round per week using `opens_at`/`closes_at` (for example Mon 00:00 to Sun 23:59).
- User starts each round with `10,000` credits.
- Unused credits are allowed as cash (full spend is optional unless admin enables `enforce_full_budget`).
- Selection stake limits are configured per round (`min_stake`, `max_stake`) and default to `200`-`800`.
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
  - Visual breakdowns by sport, weekday, and stake profile.

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

## Scripts
- `npm run dev` - local dev server
- `npm run dev:reset` - clears Next/dev caches then starts dev server
- `npm run build` - production build
- `npm run lint` - lint checks
- `npm run typecheck` - strict TypeScript check
- `npm run test` - domain unit tests

## UI color logic
- Centralized color system: `lib/ui/color-system.ts`
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
  - `primary`: cyan/blue/emerald gradient
  - `secondary`: violet/fuchsia/rose gradient
  - `success`: emerald/teal/cyan gradient
  - `neutral`: white/slate outlined

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
