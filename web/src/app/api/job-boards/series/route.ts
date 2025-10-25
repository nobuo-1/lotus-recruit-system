// web/src/app/api/job-boards/series/route.ts
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const site = searchParams.get("site") || "";
  const period = (searchParams.get("period") || "month") as
    | "month"
    | "year"
    | "3y";
  const large = searchParams.get("large") || "";
  const small = searchParams.get("small") || "";

  const sb = await supabaseServer();

  const table =
    period === "month"
      ? "job_board_counts_weekly"
      : "job_board_counts_monthly_last";

  // 基本条件
  let q = sb
    .from(table)
    .select(
      "site, week_start, month_start, mapped_large, mapped_small, job_count, candidate_count"
    )
    .eq("site", site);

  if (large) q = q.eq("mapped_large", large);
  if (small) q = q.eq("mapped_small", small);

  // 期間レンジはフロントで切替済み。ここでは全件返してフロント表示に任せてもOK
  const { data, error } = await q;
  if (error)
    return NextResponse.json({ error: error.message }, { status: 400 });

  // 週次 or 月次で x 軸整形
  const points = (data ?? [])
    .map((r: any) => ({
      x: r.week_start || r.month_start,
      jobs: Number(r.job_count || 0),
      candidates: Number(r.candidate_count || 0),
    }))
    // 並び替え
    .sort(
      (a: any, b: any) => new Date(a.x).getTime() - new Date(b.x).getTime()
    );

  return NextResponse.json({ series: { site, points } });
}
