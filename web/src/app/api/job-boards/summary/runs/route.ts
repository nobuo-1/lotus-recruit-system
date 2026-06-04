// web/src/app/api/job-boards/summary/runs/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { SHARED_RESEARCH_TENANT_ID } from "@/server/job-boards/sharedResearch";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const limit = Math.min(
      parseInt(url.searchParams.get("limit") || "40", 10),
      100
    );
    const page = Math.max(parseInt(url.searchParams.get("page") || "0", 10), 0);
    const offset = page * limit;

    const admin = supabaseAdmin();

    const { data: items } = await admin
      .from("job_board_runs")
      .select("id, site, status, started_at, finished_at, error, note")
      .eq("tenant_id", SHARED_RESEARCH_TENANT_ID)
      .order("started_at", { ascending: false })
      .range(offset, offset + limit - 1);

    const { count } = await admin
      .from("job_board_runs")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", SHARED_RESEARCH_TENANT_ID);

    const total = count ?? 0;
    return NextResponse.json({
      ok: true,
      items: items ?? [],
      paging: {
        page,
        limit,
        total,
        hasPrev: page > 0,
        hasNext: offset + limit < total,
      },
    });
  } catch (e: any) {
    console.error("[api.job-boards.runs] error", e);
    return NextResponse.json(
      { error: e?.message || "server error" },
      { status: 500 }
    );
  }
}
