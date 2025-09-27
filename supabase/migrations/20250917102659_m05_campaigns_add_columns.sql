alter table public.campaigns
  add column if not exists name       text,
  add column if not exists subject    text,
  add column if not exists from_email text,
  add column if not exists body_html  text,
  add column if not exists status     text default 'draft',
  add column if not exists scheduled_at timestamptz;

notify pgrst, 'reload schema';
