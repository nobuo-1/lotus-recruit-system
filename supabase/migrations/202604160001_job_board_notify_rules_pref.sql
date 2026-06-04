alter table public.job_board_notify_rules
  add column if not exists pref text[] not null default '{}'::text[];
