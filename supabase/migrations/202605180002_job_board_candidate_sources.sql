create table if not exists public.job_board_candidate_sources (
  id uuid primary key default gen_random_uuid(),
  site_key text not null,
  internal_large text,
  internal_small text,
  prefecture text,
  url text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_job_board_candidate_sources_lookup
  on public.job_board_candidate_sources (
    site_key,
    internal_large,
    internal_small,
    prefecture,
    enabled
  );

alter table public.job_board_candidate_sources enable row level security;

do $$
begin
  create policy p_job_board_candidate_sources_all on public.job_board_candidate_sources
  for all using (true)
  with check (true);
exception when duplicate_object then null; end $$;
