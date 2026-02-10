alter table public.rounds
add column if not exists stake_step integer not null default 100;

update public.rounds
set stake_step = greatest(1, least(coalesce(stake_step, 100), starting_credits));

with normalized as (
  select
    id,
    stake_step,
    greatest(
      stake_step,
      (round((min_stake::numeric / stake_step::numeric))::int * stake_step)
    ) as min_norm,
    least(
      greatest(stake_step, starting_credits),
      greatest(
        greatest(
          stake_step,
          (round((min_stake::numeric / stake_step::numeric))::int * stake_step)
        ),
        (round((max_stake::numeric / stake_step::numeric))::int * stake_step)
      )
    ) as max_norm
  from public.rounds
)
update public.rounds as rounds
set
  min_stake = normalized.min_norm,
  max_stake = normalized.max_norm
from normalized
where rounds.id = normalized.id;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'rounds_stake_step_positive'
  ) then
    alter table public.rounds
    add constraint rounds_stake_step_positive check (stake_step > 0);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'rounds_stake_step_within_credits'
  ) then
    alter table public.rounds
    add constraint rounds_stake_step_within_credits check (stake_step <= starting_credits);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'rounds_min_stake_step_multiple'
  ) then
    alter table public.rounds
    add constraint rounds_min_stake_step_multiple check (min_stake % stake_step = 0);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'rounds_max_stake_step_multiple'
  ) then
    alter table public.rounds
    add constraint rounds_max_stake_step_multiple check (max_stake % stake_step = 0);
  end if;
end
$$;
