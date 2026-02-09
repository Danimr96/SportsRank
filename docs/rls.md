# RLS policy summary

## Public read
- `rounds`, `sports`, `picks`, `pick_options`: `select using (true)`.
- `profiles`: `select using (true)` (for leaderboard usernames).

## User-owned writes
- `entries`
  - User can create/read/update/delete own entries.
  - User updates are constrained to own rows; admin bypass exists.

- `entry_selections`
  - User can read/write own entry selections only when:
    - entry belongs to `auth.uid()`
    - entry status is `building`
    - round status is `open`
    - round has not closed
    - `pick.metadata.start_time` is in the future
    - selected pick/option pair belongs to the same round

## Admin-only writes
- `rounds`, `sports`, `picks`, `pick_options`, `admins`
  - Write policies require `is_admin(auth.uid())`.
  - This includes `/admin/import` and `/admin/generate` insert flows.

- Admin bypass on `entries` and `entry_selections`
  - Allows settlement updates after lock.

## Admin detection
- `is_admin(uuid)` is a `security definer` function that checks `admins` table.
- Policies call this function for centralized authorization logic.

## Analytics access
- Global analytics in `/analytics` reads from `get_global_analytics_selection_rows()`.
- The function is `security definer` and returns only aggregate-safe selection metrics (no private profile fields).
- `authenticated` users have execute permission on the function.
