// web/src/app/api/job-boards/multi-series/route.ts
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const period = (searchParams.get("period") || "week") as
    | "week"
    | "year"
    | "3y";
  const sites = (searchParams.get("sites") || "").split(",").filter(Boolean);
  const large = searchParams.get("large") || "";
  const small = searchParams.get("small") || "";
  const ages = (searchParams.get("ages") || "").split(",").filter(Boolean);
  const emp = (searchParams.get("emp") || "").split(",").filter(Boolean);
  const sal = (searchParams.get("sal") || "").split(",").filter(Boolean);

  if (!sites.length) return NextResponse.json({ series: [] });

  const sb = await supabaseServer();
  const table =
    period === "week" ? "job_metrics_weekly" : "job_metrics_monthly_last";

  // サイトラベル辞書
  const { data: siteRows } = await sb
    .from("job_sites")
    .select("site_key, site_label");

  const series = [];
  for (const sk of sites) {
    let q = sb
      .from(table)
      .select(
        "site_key, site_label, week_start, month_start, large_category, small_category, age_band, employment_type, salary_band, jobs_count, candidates_count"
      )
      .eq("site_key", sk);

    if (large) q = q.eq("large_category", large);
    if (small) q = q.eq("small_category", small);
    if (ages.length) q = q.in("age_band", ages);
    if (emp.length) q = q.in("employment_type", emp);
    if (sal.length) q = q.in("salary_band", sal);

    const { data, error } = await q;
    if (error)
      return NextResponse.json({ error: error.message }, { status: 400 });

    const pts = (data ?? [])
      .map((r: any) => ({
        x: r.week_start || r.month_start,
        jobs: Number(r.jobs_count || 0),
        candidates: Number(r.candidates_count || 0),
      }))
      .sort(
        (a: any, b: any) => new Date(a.x).getTime() - new Date(b.x).getTime()
      );

    series.push({
      site: sk,
      label: siteRows?.find((s) => s.site_key === sk)?.site_label || sk,
      points: pts,
    });
  }

  return NextResponse.json({ series });
}
