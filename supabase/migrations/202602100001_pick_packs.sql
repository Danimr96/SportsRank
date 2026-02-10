create table if not exists public.pick_packs (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.rounds(id) on delete cascade,
  pack_type text not null check (pack_type in ('daily', 'weekly')),
  anchor_date date not null,
  seed text not null,
  generated_at timestamptz not null default now(),
  payload jsonb not null,
  summary jsonb not null
);

create unique index if not exists pick_packs_unique
  on public.pick_packs(round_id, pack_type, anchor_date);

alter table public.pick_packs enable row level security;

drop policy if exists pick_packs_authenticated_read on public.pick_packs;
create policy pick_packs_authenticated_read
on public.pick_packs
for select
to authenticated
using (true);

drop policy if exists pick_packs_admin_write on public.pick_packs;
create policy pick_packs_admin_write
on public.pick_packs
for all
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));
