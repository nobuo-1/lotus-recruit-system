create extension if not exists "pgcrypto";

alter table public.recipients
  add column if not exists unsubscribe_token uuid;

update public.recipients
set unsubscribe_token = gen_random_uuid()
where unsubscribe_token is null;

alter table public.recipients
  alter column unsubscribe_token set not null,
  alter column unsubscribe_token set default gen_random_uuid();

notify pgrst, 'reload schema';
