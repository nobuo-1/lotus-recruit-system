// web/src/app/api/job-boards/metrics/route.ts
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

type Body = {
  mode: "weekly" | "monthly";
  metric: "jobs" | "candidates";
  sites?: string[]; // site_key[]
  large?: string[]; // 大分類
  small?: string[]; // 小分類
  age?: string[]; // 年齢帯
  emp?: string[]; // 雇用形態
  sal?: string[]; // 年収帯
  range?: "12w" | "26w" | "52w" | "12m" | "36m";
};

function fromRange(mode: "weekly" | "monthly", r: Body["range"]): string {
  const now = new Date();
  const d = new Date(now);
  switch (r) {
    case "12w":
      d.setDate(d.getDate() - 7 * 12);
      break;
    case "26w":
      d.setDate(d.getDate() - 7 * 26);
      break;
    case "52w":
      d.setDate(d.getDate() - 7 * 52);
      break;
    case "36m":
      d.setMonth(d.getMonth() - 36);
      break;
    case "12m":
    default:
      d.setMonth(d.getMonth() - 12);
      break;
  }
  // 文字列で返す
  return d.toISOString().slice(0, 10);
}

export async function POST(req: Request) {
  const supabase = await supabaseServer();

  const body = (await req.json()) as Body;
  const mode = body.mode ?? "weekly";
  const metric = body.metric ?? "jobs";
  const sites = body.sites ?? [];
  const large = body.large ?? [];
  const small = body.small ?? [];
  const age = body.age ?? [];
  const emp = body.emp ?? [];
  const sal = body.sal ?? [];
  const range = body.range ?? (mode === "weekly" ? "26w" : "12m");

  const from = fromRange(mode, range);

  const view =
    mode === "weekly" ? "v_job_metrics_weekly" : "v_job_metrics_monthly_last";
  const dateCol = mode === "weekly" ? "week_start" : "month_start";

  let query = supabase
    .from(view)
    .select(
      `${dateCol}, site_key, large_category, small_category, age_band, employment_type, salary_band, jobs_count, candidates_count`
    )
    .gte(dateCol, from);

  if (sites.length > 0) query = query.in("site_key", sites);
  if (large.length > 0) query = query.in("large_category", large);
  if (small.length > 0) query = query.in("small_category", small);
  if (age.length > 0) query = query.in("age_band", age);
  if (emp.length > 0) query = query.in("employment_type", emp);
  if (sal.length > 0) query = query.in("salary_band", sal);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // 集計はフロントで重ねる前提だが、日付順にソートして返す
  const rows = (data ?? []).sort((a: any, b: any) =>
    String(a[dateCol]).localeCompare(String(b[dateCol]))
  );

  return NextResponse.json({ mode, metric, dateCol, rows });
}
