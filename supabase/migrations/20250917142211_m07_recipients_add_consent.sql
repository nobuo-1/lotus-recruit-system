alter table public.recipients
  add column if not exists consent text not null default 'unknown',
  add column if not exists unsubscribed_at timestamptz;

notify pgrst, 'reload schema';
