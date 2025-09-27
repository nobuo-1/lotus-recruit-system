-- email_schedules（なければ作成）
create table if not exists public.email_schedules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  scheduled_at timestamptz not null,
  status text not null default 'scheduled', -- scheduled / queued / sent / cancelled など
  created_at timestamptz not null default now()
);

-- インデックス
create index if not exists idx_email_schedules_tenant on public.email_schedules(tenant_id);
create index if not exists idx_email_schedules_campaign on public.email_schedules(campaign_id);
create index if not exists idx_email_schedules_time on public.email_schedules(scheduled_at);

-- RLS
alter table public.email_schedules enable row level security;

-- 自テナントのみ参照
create policy if not exists email_schedules_select_own
on public.email_schedules for select
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.tenant_id = email_schedules.tenant_id
  )
);

-- 自テナントのみ追加
create policy if not exists email_schedules_insert_own
on public.email_schedules for insert
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.tenant_id = email_schedules.tenant_id
  )
);

-- 自テナントのみ更新
create policy if not exists email_schedules_update_own
on public.email_schedules for update
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.tenant_id = email_schedules.tenant_id
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.tenant_id = email_schedules.tenant_id
  )
);

-- deliveries の一意制約（同じキャンペーンに同じ受信者を二重登録しない）
alter table public.deliveries
  add constraint if not exists uniq_deliveries_campaign_recipient
  unique (campaign_id, recipient_id);
