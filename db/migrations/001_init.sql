-- 001_init.sql  (v0 初期スキーマ + RLS)
-- 何度流してもエラーにならないよう冪等化

-- 拡張
create extension if not exists pgcrypto;

-- ========== テーブル ==========
create table if not exists public.tenants(
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'active',
  created_at timestamptz default now()
);

create table if not exists public.profiles(
  id uuid primary key references auth.users(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id),
  role text not null check (role in ('admin','agency_owner','agency_operator')),
  created_at timestamptz default now()
);

create table if not exists public.email_templates(
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  name text not null,
  subject text not null,
  html text not null,
  created_at timestamptz default now()
);

create table if not exists public.campaigns(
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  name text not null,
  status text not null default 'draft', -- draft|scheduled|running|paused|done
  scheduled_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists public.campaign_steps(
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  step_no int not null,
  template_id uuid not null references public.email_templates(id),
  wait_hours int default 0
);

create table if not exists public.recipients(
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  email text not null,
  name text,
  region text,
  job_category text,
  consent_status text default 'unknown'
);
create index if not exists idx_recipients_tenant_email on public.recipients(tenant_id, email);

create table if not exists public.deliveries(
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  campaign_id uuid references public.campaigns(id),
  recipient_id uuid references public.recipients(id),
  status text not null default 'queued', -- queued|sent|failed|bounced|opened|clicked|unsubscribed
  error text,
  sent_at timestamptz,
  opened_at timestamptz,
  clicked_at timestamptz
);

create table if not exists public.suppression(
  tenant_id uuid not null references public.tenants(id),
  email text not null,
  reason text not null,
  created_at timestamptz default now(),
  primary key (tenant_id, email)
);

-- ========== RLS有効化 ==========
alter table public.tenants enable row level security;
alter table public.profiles enable row level security;
alter table public.email_templates enable row level security;
alter table public.campaigns enable row level security;
alter table public.campaign_steps enable row level security;
alter table public.recipients enable row level security;
alter table public.deliveries enable row level security;
alter table public.suppression enable row level security;

-- ========== ポリシー（冪等） ==========
-- tenants は全員Select可（名称参照用途）。更新は管理UI経由でService Role想定
do $$
begin
  create policy p_tenants_select on public.tenants for select using (true);
exception when duplicate_object then null; end $$;

-- 汎用: tenant_id が JWT と一致したらALL許可（insert/update/delete も）
do $$
begin
  create policy p_profiles_all on public.profiles
  for all using (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
exception when duplicate_object then null; end $$;

do $$
begin
  create policy p_templates_all on public.email_templates
  for all using (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
exception when duplicate_object then null; end $$;

do $$
begin
  create policy p_campaigns_all on public.campaigns
  for all using (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
exception when duplicate_object then null; end $$;

-- 子テーブル（steps）は親campaignのtenantで判定
do $$
begin
  create policy p_steps_all on public.campaign_steps
  for all using (exists (select 1 from public.campaigns c where c.id = campaign_id
                         and c.tenant_id = (auth.jwt() ->> 'tenant_id')::uuid))
  with check (exists (select 1 from public.campaigns c where c.id = campaign_id
                      and c.tenant_id = (auth.jwt() ->> 'tenant_id')::uuid));
exception when duplicate_object then null; end $$;

do $$
begin
  create policy p_recipients_all on public.recipients
  for all using (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
exception when duplicate_object then null; end $$;

do $$
begin
  create policy p_deliveries_all on public.deliveries
  for all using (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
exception when duplicate_object then null; end $$;

do $$
begin
  create policy p_suppression_all on public.suppression
  for all using (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
exception when duplicate_object then null; end $$;
