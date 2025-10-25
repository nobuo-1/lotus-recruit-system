import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

type Mode = "weekly" | "monthly";
type Metric = "jobs" | "candidates";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const mode: Mode = body?.mode ?? "weekly";
    const metric: Metric = body?.metric ?? "jobs";
    const sites: string[] = Array.isArray(body?.sites) ? body.sites : [];
    const large: string[] = Array.isArray(body?.large) ? body.large : [];
    const small: string[] = Array.isArray(body?.small) ? body.small : [];
    const age: string[] = Array.isArray(body?.age) ? body.age : [];
    const emp: string[] = Array.isArray(body?.emp) ? body.emp : [];
    const sal: string[] = Array.isArray(body?.sal) ? body.sal : [];
    const range: string = body?.range ?? (mode === "weekly" ? "26w" : "12m");

    const sb = await supabaseServer();
    const { data: u } = await sb.auth.getUser();
    if (!u?.user)
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    // 期間境界
    let from: string;
    const now = new Date();
    if (mode === "weekly") {
      const weeks = Number(String(range).replace("w", "")) || 26;
      const d = new Date(now);
      d.setDate(d.getDate() - weeks * 7);
      from = d.toISOString();
    } else {
      const months = Number(String(range).replace("m", "")) || 12;
      const d = new Date(now);
      d.setMonth(d.getMonth() - months);
      from = d.toISOString();
    }

    // まずマテビューがあるかを確認
    const viewName =
      mode === "weekly" ? "job_metrics_weekly" : "job_metrics_monthly";
    let useMaterialized = true;
    {
      const { error } = await sb
        .from(viewName)
        .select("count", { count: "exact", head: true });
      if (error) useMaterialized = false;
    }

    const metricCol = metric === "jobs" ? "jobs_count" : "candidates_count";

    if (useMaterialized) {
      // ▼ マテビューから取得（列名は前提定義に合わせる）
      let q = sb
        .from(viewName)
        .select(
          `${
            mode === "weekly" ? "week_start" : "month_start"
          }, site_key, large_category, small_category, age_band, employment_type, salary_band, jobs_count, candidates_count`
        )
        .gte(mode === "weekly" ? "week_start" : "month_start", from);

      if (sites.length) q = q.in("site_key", sites);
      if (large.length) q = q.in("large_category", large);
      if (small.length) q = q.in("small_category", small);
      // age/emp/sal は存在する想定（存在しなくても supabase は無視できないので、try-catch）
      try {
        if (age.length) q = q.in("age_band", age);
      } catch {}
      try {
        if (emp.length) q = q.in("employment_type", emp);
      } catch {}
      try {
        if (sal.length) q = q.in("salary_band", sal);
      } catch {}

      const { data, error } = await q.limit(50000);
      if (error) throw error;
      return NextResponse.json({ rows: data ?? [] });
    }

    // ▼ フォールバック: job_board_results + job_board_counts を集計
    //   ※ 年齢/雇用/年収は列が無い想定なので無視し、site/large/small のみで集計
    const resultsTable = "job_board_results";
    // site_key or site のどちらがあるか判定
    let siteCol = "site_key";
    {
      const { data, error } = await sb.rpc("introspect_column_exists", {
        p_table: resultsTable,
        p_column: "site_key",
      } as any);
      if (error || !Array.isArray(data) || data[0]?.exists === false)
        siteCol = "site";
    }
    // PostgREST: 複雑な join 集計は SQL Function を使う
    const { data, error } = await sb.rpc("job_boards_metrics_fallback", {
      p_from: from,
      p_mode: mode,
      p_metric: metricCol,
      p_site_col: siteCol,
      p_sites: sites,
      p_large: large,
      p_small: small,
    } as any);

    if (error) throw error;
    return NextResponse.json({ rows: data ?? [] });
  } catch (e: any) {
    return NextResponse.json(
      { rows: [], error: String(e?.message || e) },
      { status: 200 }
    );
  }
}
