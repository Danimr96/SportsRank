insert into public.sports (slug, name, icon)
values
  ('american-football', 'American Football', 'shield'),
  ('baseball', 'Baseball', 'circle'),
  ('hockey', 'Hockey', 'snowflake'),
  ('combat', 'Combat Sports', 'swords'),
  ('motor', 'Motor Sports', 'flag')
on conflict (slug) do nothing;

create or replace function public.get_global_analytics_selection_rows()
returns table (
  sport_slug text,
  sport_name text,
  board_type text,
  event_start_time timestamptz,
  stake integer,
  payout integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    s.slug as sport_slug,
    s.name as sport_name,
    case
      when upper(p.title) like '[DAILY]%' then 'daily'
      when upper(p.title) like '[WEEK]%' then 'weekly'
      else 'other'
    end as board_type,
    coalesce((p.metadata ->> 'start_time')::timestamptz, e.created_at) as event_start_time,
    es.stake,
    coalesce(
      es.payout,
      case po.result
        when 'win' then floor(es.stake * po.odds)::int
        when 'void' then es.stake
        else 0
      end
    )::int as payout
  from public.entries e
  join public.entry_selections es on es.entry_id = e.id
  join public.picks p on p.id = es.pick_id
  join public.sports s on s.id = p.sport_id
  join public.pick_options po on po.id = es.pick_option_id
  where e.status = 'settled';
$$;

grant execute on function public.get_global_analytics_selection_rows() to authenticated;
