create table if not exists public.job_board_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  site text,
  site_key text,
  status text not null default 'queued',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  error text,
  note text,
  created_at timestamptz not null default now()
);

alter table public.job_board_runs add column if not exists tenant_id uuid;
alter table public.job_board_runs add column if not exists site text;
alter table public.job_board_runs add column if not exists site_key text;
alter table public.job_board_runs add column if not exists status text default 'queued';
alter table public.job_board_runs add column if not exists started_at timestamptz default now();
alter table public.job_board_runs add column if not exists finished_at timestamptz;
alter table public.job_board_runs add column if not exists error text;
alter table public.job_board_runs add column if not exists note text;
alter table public.job_board_runs add column if not exists created_at timestamptz default now();

create index if not exists idx_job_board_runs_tenant_started_at
  on public.job_board_runs (tenant_id, started_at desc);

create table if not exists public.job_board_results (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  run_id uuid,
  captured_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.job_board_results add column if not exists tenant_id uuid;
alter table public.job_board_results add column if not exists run_id uuid;
alter table public.job_board_results add column if not exists captured_at timestamptz default now();
alter table public.job_board_results add column if not exists created_at timestamptz default now();

create index if not exists idx_job_board_results_tenant_captured_at
  on public.job_board_results (tenant_id, captured_at desc);

create table if not exists public.job_board_counts (
  id uuid primary key default gen_random_uuid(),
  result_id uuid not null references public.job_board_results(id) on delete cascade,
  site_key text not null,
  internal_large text,
  internal_small text,
  prefecture text,
  age_band text,
  employment_type text,
  salary_band text,
  jobs_count integer,
  candidates_count integer,
  created_at timestamptz not null default now()
);

alter table public.job_board_counts add column if not exists result_id uuid;
alter table public.job_board_counts add column if not exists site_key text;
alter table public.job_board_counts add column if not exists internal_large text;
alter table public.job_board_counts add column if not exists internal_small text;
alter table public.job_board_counts add column if not exists prefecture text;
alter table public.job_board_counts add column if not exists age_band text;
alter table public.job_board_counts add column if not exists employment_type text;
alter table public.job_board_counts add column if not exists salary_band text;
alter table public.job_board_counts add column if not exists jobs_count integer;
alter table public.job_board_counts add column if not exists candidates_count integer;
alter table public.job_board_counts add column if not exists created_at timestamptz default now();

create index if not exists idx_job_board_counts_result_id
  on public.job_board_counts (result_id);
create index if not exists idx_job_board_counts_prefecture
  on public.job_board_counts (prefecture);

create table if not exists public.job_board_auto_settings (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  enabled boolean not null default true,
  timezone text not null default 'Asia/Tokyo',
  run_time text not null default '09:00',
  completion_emails text[] not null default '{}',
  notify_on_success boolean not null default true,
  notify_on_failure boolean not null default true,
  sites text[] not null default array['mynavi', 'doda', 'type', 'womantype'],
  updated_at timestamptz not null default now()
);

alter table public.job_board_auto_settings add column if not exists enabled boolean default true;
alter table public.job_board_auto_settings add column if not exists timezone text default 'Asia/Tokyo';
alter table public.job_board_auto_settings add column if not exists run_time text default '09:00';
alter table public.job_board_auto_settings add column if not exists completion_emails text[] default '{}';
alter table public.job_board_auto_settings add column if not exists notify_on_success boolean default true;
alter table public.job_board_auto_settings add column if not exists notify_on_failure boolean default true;
alter table public.job_board_auto_settings add column if not exists sites text[] default array['mynavi', 'doda', 'type', 'womantype'];
alter table public.job_board_auto_settings add column if not exists updated_at timestamptz default now();

alter table public.job_board_runs enable row level security;
alter table public.job_board_results enable row level security;
alter table public.job_board_counts enable row level security;
alter table public.job_board_auto_settings enable row level security;

do $$
begin
  create policy p_job_board_runs_all on public.job_board_runs
  for all using (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
exception when duplicate_object then null; end $$;

do $$
begin
  create policy p_job_board_results_all on public.job_board_results
  for all using (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
exception when duplicate_object then null; end $$;

do $$
begin
  create policy p_job_board_counts_all on public.job_board_counts
  for all using (
    exists (
      select 1
      from public.job_board_results r
      where r.id = job_board_counts.result_id
        and r.tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    )
  )
  with check (
    exists (
      select 1
      from public.job_board_results r
      where r.id = job_board_counts.result_id
        and r.tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    )
  );
exception when duplicate_object then null; end $$;

do $$
begin
  create policy p_job_board_auto_settings_all on public.job_board_auto_settings
  for all using (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
exception when duplicate_object then null; end $$;
