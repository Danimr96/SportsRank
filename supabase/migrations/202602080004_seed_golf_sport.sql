insert into public.sports (slug, name, icon)
values ('golf', 'Golf', 'flag')
on conflict (slug) do nothing;
