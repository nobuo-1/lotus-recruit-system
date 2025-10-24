// web/src/app/api/job-boards/summary/runs/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const limit = Math.min(
      parseInt(url.searchParams.get("limit") || "40", 10),
      100
    );
    const page = Math.max(parseInt(url.searchParams.get("page") || "0", 10), 0);
    const offset = page * limit;

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

    const { data: items } = await admin
      .from("job_board_runs")
      .select("id, site, status, started_at, finished_at, note")
      .eq("tenant_id", tenantId ?? null)
      .order("started_at", { ascending: false })
      .range(offset, offset + limit - 1);

    const { count } = await admin
      .from("job_board_runs")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId ?? null);

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
