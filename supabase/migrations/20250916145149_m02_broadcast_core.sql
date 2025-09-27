create or replace function public.current_tenant_id()
returns uuid
language sql stable
as $$
  select tenant_id from public.profiles where id = auth.uid();
$$;
grant execute on function public.current_tenant_id() to anon, authenticated, service_role;


-- RLSを有効化（何度実行しても安全）
alter table public.recipients enable row level security;
alter table public.campaigns enable row level security;
-- campaign_recipients がまだ無い環境用（必要なければこのCREATEは残してOK）
create table if not exists public.campaign_recipients (
  id bigserial primary key,
  tenant_id uuid not null,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  recipient_id uuid not null references public.recipients(id) on delete cascade,
  status text not null default 'queued',
  last_error text,
  sent_at timestamptz,
  open_at timestamptz,
  click_at timestamptz,
  unsubscribe_token uuid,
  created_at timestamptz not null default now()
);
alter table public.campaign_recipients enable row level security;

-- 受信者: SELECT
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='recipients' and policyname='select_recipients'
  ) then
    create policy select_recipients on public.recipients
      for select using (tenant_id = public.current_tenant_id() or auth.role() = 'service_role');
  end if;
end$$;

-- 受信者: ALL（INSERT/UPDATE/DELETEも許可）
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='recipients' and policyname='write_recipients'
  ) then
    create policy write_recipients on public.recipients
      for all using (tenant_id = public.current_tenant_id() or auth.role() = 'service_role')
      with check (tenant_id = public.current_tenant_id() or auth.role() = 'service_role');
  end if;
end$$;

-- キャンペーン: SELECT
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='campaigns' and policyname='select_campaigns'
  ) then
    create policy select_campaigns on public.campaigns
      for select using (tenant_id = public.current_tenant_id() or auth.role() = 'service_role');
  end if;
end$$;

-- キャンペーン: ALL
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='campaigns' and policyname='write_campaigns'
  ) then
    create policy write_campaigns on public.campaigns
      for all using (tenant_id = public.current_tenant_id() or auth.role() = 'service_role')
      with check (tenant_id = public.current_tenant_id() or auth.role() = 'service_role');
  end if;
end$$;

-- 配信対象テーブル: SELECT
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='campaign_recipients' and policyname='select_cr'
  ) then
    create policy select_cr on public.campaign_recipients
      for select using (tenant_id = public.current_tenant_id() or auth.role() = 'service_role');
  end if;
end$$;

-- 配信対象テーブル: ALL
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='campaign_recipients' and policyname='write_cr'
  ) then
    create policy write_cr on public.campaign_recipients
      for all using (tenant_id = public.current_tenant_id() or auth.role() = 'service_role')
      with check (tenant_id = public.current_tenant_id() or auth.role() = 'service_role');
  end if;
end$$;
