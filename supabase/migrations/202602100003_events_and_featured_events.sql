create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  provider_event_id text not null,
  sport_slug text not null,
  league text not null,
  start_time timestamptz not null,
  home text,
  away text,
  status text not null default 'scheduled',
  participants jsonb,
  metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_event_id)
);

create index if not exists events_sport_start_idx
  on public.events (sport_slug, start_time);

create index if not exists events_league_start_idx
  on public.events (league, start_time);

create table if not exists public.featured_events (
  id uuid primary key default gen_random_uuid(),
  featured_date date not null,
  sport_slug text not null,
  league text,
  event_id uuid not null references public.events(id) on delete cascade,
  bucket text not null check (bucket in ('today', 'tomorrow', 'week_rest')),
  created_at timestamptz not null default now(),
  unique (featured_date, event_id)
);

create index if not exists featured_events_date_bucket_idx
  on public.featured_events (featured_date, bucket, sport_slug);

alter table public.events enable row level security;
alter table public.featured_events enable row level security;

drop policy if exists events_authenticated_read on public.events;
create policy events_authenticated_read
on public.events
for select
to authenticated
using (true);

drop policy if exists events_admin_write on public.events;
create policy events_admin_write
on public.events
for all
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

drop policy if exists featured_events_authenticated_read on public.featured_events;
create policy featured_events_authenticated_read
on public.featured_events
for select
to authenticated
using (true);

drop policy if exists featured_events_admin_write on public.featured_events;
create policy featured_events_admin_write
on public.featured_events
for all
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

create or replace function public.touch_events_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_events_updated_at on public.events;
create trigger trg_events_updated_at
before update on public.events
for each row
execute function public.touch_events_updated_at();
