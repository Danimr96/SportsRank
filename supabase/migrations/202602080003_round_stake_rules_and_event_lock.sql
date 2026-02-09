alter table public.rounds
add column if not exists min_stake integer not null default 200,
add column if not exists max_stake integer not null default 800,
add column if not exists enforce_full_budget boolean not null default false;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'rounds_min_stake_positive'
  ) then
    alter table public.rounds
    add constraint rounds_min_stake_positive check (min_stake > 0);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'rounds_max_stake_valid'
  ) then
    alter table public.rounds
    add constraint rounds_max_stake_valid check (max_stake >= min_stake);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'rounds_max_stake_within_credits'
  ) then
    alter table public.rounds
    add constraint rounds_max_stake_within_credits check (max_stake <= starting_credits);
  end if;
end;
$$;

drop policy if exists entry_selections_owner_or_admin_insert on public.entry_selections;
drop policy if exists entry_selections_owner_or_admin_update on public.entry_selections;
drop policy if exists entry_selections_owner_or_admin_delete on public.entry_selections;

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
