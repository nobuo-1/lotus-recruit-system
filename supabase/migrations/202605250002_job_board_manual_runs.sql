create table if not exists public.job_board_manual_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  params jsonb not null default '{}'::jsonb,
  results jsonb not null default '[]'::jsonb,
  result_count integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_job_board_manual_runs_tenant_created_at
  on public.job_board_manual_runs (tenant_id, created_at desc);

alter table public.job_board_manual_runs enable row level security;

do $$
begin
  create policy p_job_board_manual_runs_all on public.job_board_manual_runs
  for all using (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
exception when duplicate_object then null; end $$;
