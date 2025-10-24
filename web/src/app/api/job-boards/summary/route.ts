// web/src/app/api/job-boards/summary/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

function dayKey(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.toISOString();
}

export async function GET() {
  try {
    const sb = await supabaseServer();
    const { data: u } = await sb.auth.getUser();
    if (!u?.user)
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const { data: prof } = await sb
      .from("profiles")
      .select("tenant_id, is_admin")
      .eq("id", u.user.id)
      .maybeSingle();
    const tenantId = prof?.tenant_id as string | undefined;
    if (!tenantId)
      return NextResponse.json({ error: "no tenant" }, { status: 400 });

    // 直近4週のrun状況
    const since = new Date();
    since.setDate(since.getDate() - 28);
    const { data: runs } = await sb
      .from("job_board_runs")
      .select("site,status,started_at,finished_at,error")
      .eq("tenant_id", tenantId)
      .gte("started_at", since.toISOString())
      .order("started_at", { ascending: false });

    // 直近の集計（最新 result_id をサイト毎に拾う）
    const { data: latest } = await sb
      .from("job_board_results")
      .select("id, site, captured_at")
      .eq("tenant_id", tenantId)
      .order("captured_at", { ascending: false });

    const latestBySite = new Map<string, any>();
    for (const r of latest ?? [])
      if (!latestBySite.has(r.site)) latestBySite.set(r.site, r);

    let totals = { jobs: 0, candidates: 0 };
    for (const r of latestBySite.values()) {
      const { data: counts } = await sb
        .from("job_board_counts")
        .select("jobs_count, candidates_count")
        .eq("result_id", r.id);

      (counts ?? []).forEach((c: any) => {
        totals.jobs += Number(c.jobs_count || 0);
        totals.candidates += Number(c.candidates_count || 0);
      });
    }

    // 折れ線用（直近14日の「保存件数」合計）
    const since14 = new Date();
    since14.setDate(since14.getDate() - 13);
    const { data: results14 } = await sb
      .from("job_board_results")
      .select("id, captured_at")
      .eq("tenant_id", tenantId)
      .gte("captured_at", since14.toISOString());

    const counter: Record<string, number> = {};
    for (const r of results14 ?? []) {
      const k = dayKey(new Date(r.captured_at));
      counter[k] = (counter[k] ?? 0) + 1;
    }
    const series: { date: string; count: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const k = dayKey(d);
      series.push({ date: k.slice(0, 10), count: counter[k] ?? 0 });
    }

    return NextResponse.json({
      ok: true,
      metrics: {
        totalJobs: totals.jobs,
        totalCandidates: totals.candidates,
        runs: runs ?? [],
        series,
        isAdmin: !!prof?.is_admin,
      },
    });
  } catch (e: any) {
    console.error("[api.job-boards.summary] error", e);
    return NextResponse.json(
      { error: e?.message || "server error" },
      { status: 500 }
    );
  }
}
