insert into public.sports (slug, name, icon)
values
  ('soccer', 'Soccer', 'ball'),
  ('basketball', 'Basketball', 'activity'),
  ('tennis', 'Tennis', 'circle'),
  ('golf', 'Golf', 'flag'),
  ('motor', 'Motor Sports', 'flag'),
  ('american-football', 'American Football', 'shield'),
  ('baseball', 'Baseball', 'circle'),
  ('hockey', 'Hockey', 'snowflake'),
  ('combat', 'Combat Sports', 'swords')
on conflict (slug) do nothing;
