// web/src/app/api/job-boards/table/route.ts
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

  if (!sites.length) return NextResponse.json({ rows: [] });

  const sb = await supabaseServer();
  const table =
    period === "week" ? "job_metrics_weekly" : "job_metrics_monthly_last";
  let q = sb
    .from(table)
    .select(
      "site_label, week_start, month_start, large_category, small_category, age_band, employment_type, salary_band, jobs_count, candidates_count"
    )
    .in("site_key", sites);

  if (large) q = q.eq("large_category", large);
  if (small) q = q.eq("small_category", small);
  if (ages.length) q = q.in("age_band", ages);
  if (emp.length) q = q.in("employment_type", emp);
  if (sal.length) q = q.in("salary_band", sal);

  const { data, error } = await q;
  if (error) return NextResponse.json({ rows: [] });

  const rows = (data ?? [])
    .map((r: any) => ({
      x: r.week_start || r.month_start,
      site_label: r.site_label,
      large_category: r.large_category,
      small_category: r.small_category,
      age_band: r.age_band,
      employment_type: r.employment_type,
      salary_band: r.salary_band,
      jobs_count: r.jobs_count,
      candidates_count: r.candidates_count,
    }))
    .sort(
      (a: any, b: any) => new Date(a.x).getTime() - new Date(b.x).getTime()
    );

  return NextResponse.json({ rows });
}
