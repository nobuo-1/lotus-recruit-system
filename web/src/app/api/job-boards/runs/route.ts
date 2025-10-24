// web/src/app/api/job-boards/runs/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const limit = Math.min(
      Math.max(parseInt(url.searchParams.get("limit") || "40", 10), 1),
      100
    );
    const page = Math.max(parseInt(url.searchParams.get("page") || "0", 10), 0);

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
    if (!tenantId)
      return NextResponse.json({ error: "no tenant" }, { status: 400 });

    const from = page * limit;
    const to = from + limit - 1;

    const { data, count, error } = await sb
      .from("job_board_runs")
      .select("id, site, status, error, started_at, finished_at", {
        count: "exact",
      })
      .eq("tenant_id", tenantId)
      .order("started_at", { ascending: false })
      .range(from, to);

    if (error)
      return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({
      ok: true,
      items: data ?? [],
      paging: {
        page,
        limit,
        total: count ?? 0,
        hasPrev: page > 0,
        hasNext: count ? from + (data?.length ?? 0) < count : false,
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
