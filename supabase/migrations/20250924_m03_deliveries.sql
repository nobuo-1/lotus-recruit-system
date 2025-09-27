-- deliveries が無くても有っても安全に適用される版
create extension if not exists pgcrypto;

create table if not exists public.deliveries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  recipient_id uuid not null references public.recipients(id) on delete cascade,
  status text not null check (status in ('queued','scheduled','sent','failed','cancelled')),
  scheduled_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

-- 既存テーブルに不足カラムがあれば追加
alter table public.deliveries
  add column if not exists scheduled_at timestamptz,
  add column if not exists sent_at timestamptz;

-- 同一キャンペーン×同一受信者は1行
create unique index if not exists uq_deliveries_campaign_recipient
  on public.deliveries (campaign_id, recipient_id);

alter table public.deliveries enable row level security;

-- RLS
drop policy if exists deliveries_service_all on public.deliveries;
create policy deliveries_service_all
on public.deliveries for all
to service_role
using (true) with check (true);

drop policy if exists deliveries_tenant_select on public.deliveries;
create policy deliveries_tenant_select
on public.deliveries for select
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.tenant_id = deliveries.tenant_id
  )
);

drop policy if exists deliveries_tenant_insert on public.deliveries;
create policy deliveries_tenant_insert
on public.deliveries for insert
to authenticated
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.tenant_id = deliveries.tenant_id
  )
);

drop policy if exists deliveries_tenant_update on public.deliveries;
create policy deliveries_tenant_update
on public.deliveries for update
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.tenant_id = deliveries.tenant_id
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.tenant_id = deliveries.tenant_id
  )
);
