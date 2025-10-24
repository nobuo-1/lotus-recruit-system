// web/src/app/api/job-boards/summary/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET() {
  try {
    const sb = await supabaseServer();
    const { data: u } = await sb.auth.getUser();
    if (!u?.user)
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const { data: prof } = await sb
      .from("profiles")
      .select("tenant_id")
      .eq("id", u.user.id)
      .maybeSingle();
    const tenantId = prof?.tenant_id as string | undefined;

    const admin = supabaseAdmin();

    // 30日内の KPI
    const since = new Date();
    since.setDate(since.getDate() - 30);
    const sinceIso = since.toISOString();

    const { data: runs } = await admin
      .from("job_board_runs")
      .select("id, site, status, started_at, finished_at, note")
      .eq("tenant_id", tenantId ?? null)
      .gte("started_at", sinceIso)
      .order("started_at", { ascending: false });

    const runs30 = runs?.length ?? 0;
    const success30 = (runs ?? []).filter(
      (r: any) => r.status === "success"
    ).length;
    const fail30 = (runs ?? []).filter(
      (r: any) => r.status === "failed"
    ).length;
    const base = success30 + fail30;
    const successRate30 =
      base > 0 ? Math.round((success30 / base) * 1000) / 10 : 0;

    // 直近20件
    const { data: latest } = await admin
      .from("job_board_runs")
      .select("id, site, status, started_at, finished_at, note")
      .eq("tenant_id", tenantId ?? null)
      .order("started_at", { ascending: false })
      .limit(20);

    // lastRun/lastFailed/nextSchedule（任意：あれば）
    const lastRunAt = runs && runs[0]?.started_at ? runs[0].started_at : null;

    return NextResponse.json({
      ok: true,
      kpi: {
        runs30,
        success30,
        fail30,
        successRate30,
        lastRunAt,
        lastFailedAt: null,
        nextScheduleAt: null,
      },
      latest: latest ?? [],
    });
  } catch (e: any) {
    console.error("[api.job-boards.summary] error", e);
    return NextResponse.json(
      { error: e?.message || "server error" },
      { status: 500 }
    );
  }
}
