// web/src/app/api/job-boards/metrics/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export async function POST(req: NextRequest) {
  const p = await req.json();
  const supabase = await supabaseServer();
  const { data: u } = await supabase.auth.getUser();
  if (!u?.user)
    return NextResponse.json({ error: "auth required" }, { status: 401 });

  const metric: "jobs" | "candidates" =
    p.metric === "candidates" ? "candidates" : "jobs";
  const sites: string[] = p.sites ?? [];
  const large: string[] = p.large ?? [];
  const small: string[] = p.small ?? [];
  const age: string[] = p.age ?? [];
  const emp: string[] = p.emp ?? [];
  const sal: string[] = p.sal ?? [];
  const mode: "weekly" | "monthly" =
    p.mode === "monthly" ? "monthly" : "weekly";
  const range: string = p.range || (mode === "weekly" ? "26w" : "12m");

  // SQL（site_key/site/site_id のいずれでも動く COALESCE）
  // results: captured_at, site_key or site or site_id
  // counts: jobs_count, candidates_count + 軸
  const sql = `
    with results as (
      select
        id as result_id,
        captured_at::date as captured_at,
        coalesce((job_board_results.site_key)::text, (job_board_results.site)::text, (job_board_results.site_id)::text) as site_key
      from job_board_results
      where tenant_id = :tenant
    ),
    counts as (
      select
        c.result_id,
        r.captured_at,
        r.site_key,
        coalesce(c.internal_large, c.large_category, '') as large_category,
        coalesce(c.internal_small, c.small_category, '') as small_category,
        coalesce(c.age_band, '') as age_band,
        coalesce(c.employment_type, '') as employment_type,
        coalesce(c.salary_band, '') as salary_band,
        coalesce(c.jobs_count,0) as jobs_count,
        coalesce(c.candidates_count,0) as candidates_count
      from job_board_counts c
      join results r on r.result_id = c.result_id
    ),
    filtered as (
      select * from counts
      where (:sites_isnull or site_key = any(:sites))
        and (:large_isnull or large_category = any(:large))
        and (:small_isnull or small_category = any(:small))
        and (:age_isnull or age_band = any(:age))
        and (:emp_isnull or employment_type = any(:emp))
        and (:sal_isnull or salary_band = any(:sal))
    ),
    bucketted as (
      select
        case
          when :mode = 'weekly'  then date_trunc('week', captured_at)
          else date_trunc('month', captured_at)
        end as bucket,
        site_key,
        sum(jobs_count) as jobs_count,
        sum(candidates_count) as candidates_count
      from filtered
      group by 1,2
    ),
    ranged as (
      select * from bucketted
      where bucket >= (case
        when :mode = 'weekly' then date_trunc('week', now()) - (
          case :range
            when '12w' then interval '11 weeks'
            when '26w' then interval '25 weeks'
            when '52w' then interval '51 weeks'
            else interval '25 weeks'
          end
        )
        else date_trunc('month', now()) - (
          case :range
            when '12m' then interval '11 months'
            when '36m' then interval '35 months'
            else interval '11 months'
          end
        )
      end)
    )
    select
      bucket::date as ${mode === "weekly" ? "week_start" : "month_start"},
      site_key,
      sum(jobs_count) as jobs_count,
      sum(candidates_count) as candidates_count
    from ranged
    group by 1,2
    order by 1 asc, 2 asc
  `;

  const { data, error } = await supabase.rpc("exec_sql_json", {
    q: sql,
    params: {
      tenant: u.user.id,
      mode,
      range,
      sites,
      sites_isnull: sites.length === 0,
      large,
      large_isnull: large.length === 0,
      small,
      small_isnull: small.length === 0,
      age,
      age_isnull: age.length === 0,
      emp,
      emp_isnull: emp.length === 0,
      sal,
      sal_isnull: sal.length === 0,
    },
  });
  // ↑ NOTE: 汎用 RPC exec_sql_json（jsonで返す単純な関数）が無ければ
  // Supabase Edge Functions か REST に置き換えてください。
  // もし未導入なら以下のフォールバック
  if (error || !Array.isArray(data)) {
    // フォールバック：ビューがあれば直接 select
    const { data: rows, error: e2 } = await supabase
      .from("job_metrics_weekly") // 既存環境のメトリクスビュー名に合わせてください
      .select("*")
      .limit(0); // 存在確認のみ
    if (e2) {
      // どうしても無い場合は空
      return NextResponse.json({ rows: [] });
    }
  }

  return NextResponse.json({ rows: (data as any[]) ?? [] });
}
