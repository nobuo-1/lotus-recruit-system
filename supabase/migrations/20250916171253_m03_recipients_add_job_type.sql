alter table public.recipients
  add column if not exists job_type text,
  add column if not exists region   text;

-- 念のため：PostgREST スキーマ再読込
notify pgrst, 'reload schema';
