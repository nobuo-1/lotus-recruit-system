alter table public.scout_client_logins
  add column if not exists login_url text,
  add column if not exists account_label text,
  add column if not exists two_factor_method text not null default 'manual',
  add column if not exists two_factor_contact text,
  add column if not exists two_factor_note text,
  add column if not exists contract_id text,
  add column if not exists plan_id text,
  add column if not exists job_posting_ids text,
  add column if not exists job_posting_names text,
  add column if not exists scout_template_ids text,
  add column if not exists target_search_url text,
  add column if not exists target_conditions text,
  add column if not exists exclusion_rules text,
  add column if not exists daily_send_limit integer,
  add column if not exists operation_window text,
  add column if not exists sender_name text,
  add column if not exists sender_email text,
  add column if not exists reply_to text,
  add column if not exists status text not null default 'needs_check',
  add column if not exists last_verified_at date;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'scout_client_logins_two_factor_method_check'
  ) then
    alter table public.scout_client_logins
      add constraint scout_client_logins_two_factor_method_check
      check (two_factor_method in ('none', 'email', 'sms', 'app', 'manual'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'scout_client_logins_status_check'
  ) then
    alter table public.scout_client_logins
      add constraint scout_client_logins_status_check
      check (status in ('ready', 'needs_check', 'paused'));
  end if;
end$$;

create index if not exists idx_scout_logins_status
  on public.scout_client_logins(tenant_id, status);

create index if not exists idx_scout_logins_site
  on public.scout_client_logins(tenant_id, site_key);

do $$
declare
  rec record;
  meta jsonb;
begin
  for rec in
    select id, login_note
    from public.scout_client_logins
    where login_note is not null
  loop
    begin
      meta := rec.login_note::jsonb;
    exception when others then
      meta := null;
    end;

    if meta is not null and meta->>'__type' = 'scout_login_meta' then
      update public.scout_client_logins
      set
        login_url = coalesce(nullif(meta->>'login_url', ''), login_url),
        account_label = coalesce(nullif(meta->>'account_label', ''), account_label),
        two_factor_method = coalesce(
          case
            when meta->>'two_factor_method' in ('none', 'email', 'sms', 'app', 'manual')
              then meta->>'two_factor_method'
            else null
          end,
          two_factor_method
        ),
        two_factor_contact = coalesce(nullif(meta->>'two_factor_contact', ''), two_factor_contact),
        two_factor_note = coalesce(nullif(meta->>'two_factor_note', ''), two_factor_note),
        contract_id = coalesce(nullif(meta->>'contract_id', ''), contract_id),
        plan_id = coalesce(nullif(meta->>'plan_id', ''), plan_id),
        job_posting_ids = coalesce(nullif(meta->>'job_posting_ids', ''), job_posting_ids),
        job_posting_names = coalesce(nullif(meta->>'job_posting_names', ''), job_posting_names),
        scout_template_ids = coalesce(nullif(meta->>'scout_template_ids', ''), scout_template_ids),
        target_search_url = coalesce(nullif(meta->>'target_search_url', ''), target_search_url),
        target_conditions = coalesce(nullif(meta->>'target_conditions', ''), target_conditions),
        exclusion_rules = coalesce(nullif(meta->>'exclusion_rules', ''), exclusion_rules),
        daily_send_limit = coalesce(
          case
            when meta->>'daily_send_limit' ~ '^[0-9]+$' then (meta->>'daily_send_limit')::integer
            else null
          end,
          daily_send_limit
        ),
        operation_window = coalesce(nullif(meta->>'operation_window', ''), operation_window),
        sender_name = coalesce(nullif(meta->>'sender_name', ''), sender_name),
        sender_email = coalesce(nullif(meta->>'sender_email', ''), sender_email),
        reply_to = coalesce(nullif(meta->>'reply_to', ''), reply_to),
        status = coalesce(
          case
            when meta->>'status' in ('ready', 'needs_check', 'paused')
              then meta->>'status'
            else null
          end,
          status
        ),
        last_verified_at = coalesce(
          case
            when meta->>'last_verified_at' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
              then (meta->>'last_verified_at')::date
            else null
          end,
          last_verified_at
        ),
        login_note = nullif(meta->>'note', ''),
        updated_at = now()
      where id = rec.id;
    end if;
  end loop;
end$$;

notify pgrst, 'reload schema';
