// web/src/app/api/job-boards/summary/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

function avgSec(durs: number[]) {
  if (!durs.length) return 0;
  const s = durs.reduce((a, b) => a + b, 0);
  return Math.round((s / durs.length) * 100) / 100;
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

    const now = new Date();

    // 直近14日：実行回数 & 平均処理時間
    const since14 = new Date(now);
    since14.setDate(since14.getDate() - 14);
    const { data: last14 } = await sb
      .from("job_board_runs")
      .select("status, started_at, finished_at")
      .eq("tenant_id", tenantId)
      .gte("started_at", since14.toISOString())
      .order("started_at", { ascending: false });

    const runCount14 = (last14 ?? []).length;
    const durations = (last14 ?? [])
      .filter((r: any) => r.finished_at && r.started_at)
      .map(
        (r: any) =>
          (new Date(r.finished_at).getTime() -
            new Date(r.started_at).getTime()) /
          1000
      );

    // 直近30日：成功率
    const since30 = new Date(now);
    since30.setDate(since30.getDate() - 30);
    const { data: last30 } = await sb
      .from("job_board_runs")
      .select("status")
      .eq("tenant_id", tenantId)
      .gte("started_at", since30.toISOString());

    const total30 = (last30 ?? []).length;
    const success30 = (last30 ?? []).filter(
      (r: any) => r.status === "success"
    ).length;
    const successRate30 = total30
      ? Math.round((success30 / total30) * 10000) / 100
      : 0;

    // 現在のキュー数（queued）
    const { count: queuedNow } = await sb
      .from("job_board_runs")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .in("status", ["queued"]);

    // 直近20件
    const { data: last20 } = await sb
      .from("job_board_runs")
      .select("id, site, status, error, started_at, finished_at")
      .eq("tenant_id", tenantId)
      .order("started_at", { ascending: false })
      .limit(20);

    return NextResponse.json({
      ok: true,
      metrics: {
        runCount14,
        successRate30,
        avgDurationSec14: avgSec(durations),
        queuedNow: queuedNow ?? 0,
        last20: last20 ?? [],
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
