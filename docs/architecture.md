# Architecture

## Goals
- Keep critical business rules pure, explicit, and testable.
- Keep database access thin and isolated.
- Keep UI feature-oriented and minimal.

## Module boundaries
- `/lib/domain`
  - Pure functions only.
  - No Supabase imports.
  - No `Date.now()` side effects unless injected (`validateEntry` accepts `now`).
  - Includes:
    - `validation.ts`
    - `settlement.ts`
    - `ranking.ts`
    - `analytics.ts`

- `/lib/data`
  - Thin query/mutation functions only.
  - No business decisions.
  - Inputs/outputs are typed DTOs used by pages/actions.
  - Includes:
    - `analytics.ts` for settled selection reads (user/global aggregate rows).

- `/lib/ingestion`
  - Pure import/generation pipeline logic (no DB access).
  - Includes:
    - `validation.ts` for JSON schema/constraints checks
    - `transform.ts` for raw provider odds to picks payload conversion
    - `plan.ts` for deterministic DB insert plan creation

- `/lib/providers`
  - Provider contracts and implementations.
  - Current implementation:
    - `mock-provider.ts` (deterministic fixtures + odds)
  - Swap point for real odds API integration.

- `/app/actions`
  - Orchestration layer for authenticated mutations.
  - Calls `/lib/data` for persistence and `/lib/domain` for rules.
  - Revalidates affected routes.

- `/components`
  - Feature groups:
    - `picks/`: weekly portfolio flow (budget summary, sport grouping, daily/week filters, drawer)
    - `leaderboard/`: ranking table
    - `analytics/`: charts + metric cards + filters
    - `admin/`: import/generate preview and controls
    - `layout/`: app header, countdown, dock
    - `ui/`: shared shadcn-style primitives

- `/app`
  - Route-level composition only.
  - Fetches data through `/lib/data`, renders components, and gates auth/admin access.

## Runtime flow
1. User authenticates with Supabase Auth.
2. Dashboard loads current open round and user entry.
3. Pick drawer updates `entry_selections` via `upsertSelectionAction`.
4. Selection updates run `validateSelection`:
   - stake in `[round.min_stake, round.max_stake]`
   - total spent `<= credits_start` (cash allowed)
   - edits blocked after `pick.metadata.start_time`
5. Lock action fetches picks + selections and runs `validateEntry`.
   - total spent `<= credits_start`
   - `enforce_full_budget` optionally requires exact full spend
6. Admin marks option results.
7. Admin can import JSON payloads at `/admin/import`:
   - parse + validate payload
   - preview summary
   - insert draft picks/options
8. Admin can generate draft picks at `/admin/generate`:
   - fetch events + odds from `MockProvider`
   - transform with `transformRawOddsToPicks`
   - validate + preview
   - insert draft picks/options
9. Admin settle action runs `settleEntry` per locked entry and persists payouts + `credits_end`.
10. Leaderboard page fetches settled entries and runs `computeLeaderboard`.
11. Analytics page fetches settled selection rows (user + global aggregate) and computes charts via `computeAnalyticsDashboard`.

## Why this is not a black box
- Validation, payout, and ranking are deterministic pure functions with unit tests.
- Import schema validation, odds transformation, and insert planning are also pure functions with unit tests.
- Actions are small, explicit orchestrators.
- Data layer has no hidden rules.
