insert into public.sports (slug, name, icon)
values
  ('american-football', 'American Football', 'shield'),
  ('baseball', 'Baseball', 'circle'),
  ('hockey', 'Hockey', 'snowflake'),
  ('combat', 'Combat Sports', 'swords'),
  ('motor', 'Motor Sports', 'flag')
on conflict (slug) do nothing;

create or replace function public.get_global_analytics_sport_day()
returns table (
  sport_slug text,
  sport_name text,
  board_type text,
  weekday_index integer,
  weekday_label text,
  total_staked bigint,
  total_payout bigint,
  selections_count bigint,
  entries_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with settled_selections as (
    select
      e.id as entry_id,
      s.slug as sport_slug,
      s.name as sport_name,
      case
        when upper(p.title) like '[DAILY]%' then 'daily'
        when upper(p.title) like '[WEEK]%' then 'weekly'
        else 'other'
      end as board_type,
      coalesce((p.metadata ->> 'start_time')::timestamptz, e.created_at) as event_time,
      es.stake::bigint as stake,
      coalesce(
        es.payout,
        case po.result
          when 'win' then floor(es.stake * po.odds)::int
          when 'void' then es.stake
          else 0
        end
      )::bigint as payout
    from public.entries e
    join public.entry_selections es on es.entry_id = e.id
    join public.picks p on p.id = es.pick_id
    join public.sports s on s.id = p.sport_id
    join public.pick_options po on po.id = es.pick_option_id
    where e.status = 'settled'
  ),
  normalized as (
    select
      entry_id,
      sport_slug,
      sport_name,
      board_type,
      (extract(isodow from event_time)::int - 1) as weekday_index,
      case extract(isodow from event_time)::int
        when 1 then 'Mon'
        when 2 then 'Tue'
        when 3 then 'Wed'
        when 4 then 'Thu'
        when 5 then 'Fri'
        when 6 then 'Sat'
        when 7 then 'Sun'
        else 'N/A'
      end as weekday_label,
      stake,
      payout
    from settled_selections
  )
  select
    sport_slug,
    sport_name,
    board_type,
    weekday_index,
    weekday_label,
    sum(stake) as total_staked,
    sum(payout) as total_payout,
    count(*) as selections_count,
    count(distinct entry_id) as entries_count
  from normalized
  group by
    sport_slug,
    sport_name,
    board_type,
    weekday_index,
    weekday_label
  order by sport_name asc, weekday_index asc, board_type asc;
$$;

grant execute on function public.get_global_analytics_sport_day() to authenticated;
