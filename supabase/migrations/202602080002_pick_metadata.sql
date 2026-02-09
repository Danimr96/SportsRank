alter table public.picks
add column if not exists metadata jsonb;
