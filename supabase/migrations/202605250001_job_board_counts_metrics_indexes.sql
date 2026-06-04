create index if not exists idx_job_board_counts_result_candidates_filters
  on public.job_board_counts (
    result_id,
    site_key,
    internal_large,
    internal_small,
    prefecture
  )
  where candidates_count is not null;

create index if not exists idx_job_board_counts_result_jobs_filters
  on public.job_board_counts (
    result_id,
    site_key,
    internal_large,
    internal_small,
    prefecture
  )
  where jobs_count is not null;
