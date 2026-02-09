create extension if not exists pgcrypto;

create type public.round_status as enum ('draft', 'open', 'locked', 'settled');
create type public.option_result as enum ('pending', 'win', 'lose', 'void');
create type public.entry_status as enum ('building', 'locked', 'settled');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  created_at timestamptz not null default now(),
  constraint profiles_username_length check (char_length(username) between 3 and 32)
);

create table public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.rounds (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status public.round_status not null default 'draft',
  opens_at timestamptz not null,
  closes_at timestamptz not null,
  starting_credits integer not null default 10000,
  min_stake integer not null default 200,
  max_stake integer not null default 800,
  enforce_full_budget boolean not null default false,
  constraint rounds_starting_credits_positive check (starting_credits > 0),
  constraint rounds_min_stake_positive check (min_stake > 0),
  constraint rounds_max_stake_valid check (max_stake >= min_stake),
  constraint rounds_max_stake_within_credits check (max_stake <= starting_credits),
  constraint rounds_closes_after_opens check (closes_at > opens_at)
);

create table public.sports (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  icon text
);

create table public.picks (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.rounds(id) on delete cascade,
  sport_id uuid not null references public.sports(id),
  title text not null,
  description text,
  order_index integer not null default 0,
  is_required boolean not null default true,
  metadata jsonb
);

create table public.pick_options (
  id uuid primary key default gen_random_uuid(),
  pick_id uuid not null references public.picks(id) on delete cascade,
  label text not null,
  odds numeric(10, 3) not null,
  result public.option_result not null default 'pending',
  constraint pick_options_odds_positive check (odds > 0)
);

create table public.entries (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.rounds(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status public.entry_status not null default 'building',
  credits_start integer not null,
  credits_end integer,
  locked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint entries_unique_user_round unique (round_id, user_id),
  constraint entries_credits_start_positive check (credits_start > 0),
  constraint entries_credits_end_non_negative check (credits_end is null or credits_end >= 0)
);

create table public.entry_selections (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.entries(id) on delete cascade,
  pick_id uuid not null references public.picks(id) on delete cascade,
  pick_option_id uuid not null references public.pick_options(id) on delete cascade,
  stake integer not null,
  payout integer,
  constraint entry_selections_unique_pick_per_entry unique (entry_id, pick_id),
  constraint entry_selections_stake_non_negative check (stake >= 0),
  constraint entry_selections_payout_non_negative check (payout is null or payout >= 0)
);

create index rounds_status_idx on public.rounds(status);
create index rounds_opens_closes_idx on public.rounds(opens_at, closes_at);
create index picks_round_id_idx on public.picks(round_id);
create index pick_options_pick_id_idx on public.pick_options(pick_id);
create index entries_round_id_idx on public.entries(round_id);
create index entries_user_id_idx on public.entries(user_id);
create index entry_selections_entry_id_idx on public.entry_selections(entry_id);

create or replace function public.is_admin(check_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admins where user_id = check_user_id
  );
$$;

grant execute on function public.is_admin(uuid) to anon, authenticated;

insert into public.sports (slug, name, icon)
values
  ('soccer', 'Soccer', 'ball'),
  ('basketball', 'Basketball', 'activity'),
  ('tennis', 'Tennis', 'circle'),
  ('golf', 'Golf', 'flag')
on conflict (slug) do nothing;

alter table public.profiles enable row level security;
alter table public.admins enable row level security;
alter table public.rounds enable row level security;
alter table public.sports enable row level security;
alter table public.picks enable row level security;
alter table public.pick_options enable row level security;
alter table public.entries enable row level security;
alter table public.entry_selections enable row level security;

create policy profiles_public_read
on public.profiles
for select
using (true);

create policy profiles_owner_write
on public.profiles
for all
to authenticated
using (auth.uid() = id or public.is_admin(auth.uid()))
with check (auth.uid() = id or public.is_admin(auth.uid()));

create policy admins_self_read
on public.admins
for select
to authenticated
using (auth.uid() = user_id or public.is_admin(auth.uid()));

create policy admins_admin_write
on public.admins
for all
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

create policy rounds_public_read
on public.rounds
for select
using (true);

create policy rounds_admin_write
on public.rounds
for all
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

create policy sports_public_read
on public.sports
for select
using (true);

create policy sports_admin_write
on public.sports
for all
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

create policy picks_public_read
on public.picks
for select
using (true);

create policy picks_admin_write
on public.picks
for all
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

create policy pick_options_public_read
on public.pick_options
for select
using (true);

create policy pick_options_admin_write
on public.pick_options
for all
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

create policy entries_owner_or_admin_read
on public.entries
for select
to authenticated
using (user_id = auth.uid() or public.is_admin(auth.uid()));

create policy entries_owner_insert
on public.entries
for insert
to authenticated
with check (user_id = auth.uid() or public.is_admin(auth.uid()));

create policy entries_owner_or_admin_update
on public.entries
for update
to authenticated
using (
  public.is_admin(auth.uid())
  or (user_id = auth.uid() and status in ('building', 'locked'))
)
with check (
  public.is_admin(auth.uid())
  or (user_id = auth.uid() and status in ('building', 'locked'))
);

create policy entries_owner_or_admin_delete
on public.entries
for delete
to authenticated
using (user_id = auth.uid() or public.is_admin(auth.uid()));

create policy entry_selections_owner_or_admin_read
on public.entry_selections
for select
to authenticated
using (
  public.is_admin(auth.uid())
  or exists (
    select 1
    from public.entries e
    where e.id = entry_id
      and e.user_id = auth.uid()
  )
);

create policy entry_selections_owner_or_admin_insert
on public.entry_selections
for insert
to authenticated
with check (
  public.is_admin(auth.uid())
  or exists (
    select 1
    from public.entries e
    join public.rounds r on r.id = e.round_id
    join public.picks p on p.id = pick_id and p.round_id = e.round_id
    join public.pick_options po on po.id = pick_option_id and po.pick_id = p.id
    where e.id = entry_id
      and e.user_id = auth.uid()
      and e.status = 'building'
      and r.status = 'open'
      and r.closes_at > now()
      and (p.metadata->>'start_time')::timestamptz > now()
  )
);

create policy entry_selections_owner_or_admin_update
on public.entry_selections
for update
to authenticated
using (
  public.is_admin(auth.uid())
  or exists (
    select 1
    from public.entries e
    join public.rounds r on r.id = e.round_id
    join public.picks p on p.id = public.entry_selections.pick_id and p.round_id = e.round_id
    where e.id = entry_id
      and e.user_id = auth.uid()
      and e.status = 'building'
      and r.status = 'open'
      and r.closes_at > now()
      and (p.metadata->>'start_time')::timestamptz > now()
  )
)
with check (
  public.is_admin(auth.uid())
  or exists (
    select 1
    from public.entries e
    join public.rounds r on r.id = e.round_id
    join public.picks p on p.id = pick_id and p.round_id = e.round_id
    join public.pick_options po on po.id = pick_option_id and po.pick_id = p.id
    where e.id = entry_id
      and e.user_id = auth.uid()
      and e.status = 'building'
      and r.status = 'open'
      and r.closes_at > now()
      and (p.metadata->>'start_time')::timestamptz > now()
  )
);

create policy entry_selections_owner_or_admin_delete
on public.entry_selections
for delete
to authenticated
using (
  public.is_admin(auth.uid())
  or exists (
    select 1
    from public.entries e
    join public.rounds r on r.id = e.round_id
    join public.picks p on p.id = public.entry_selections.pick_id and p.round_id = e.round_id
    where e.id = entry_id
      and e.user_id = auth.uid()
      and e.status = 'building'
      and r.status = 'open'
      and r.closes_at > now()
      and (p.metadata->>'start_time')::timestamptz > now()
  )
);
