// web/src/app/api/form-outreach/runs/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { opsQueue } from "@/server/queue";

type Flow = "crawl" | "send" | "followup";

export async function POST(req: Request) {
  try {
    const { flow } = (await req.json().catch(() => ({}))) as { flow?: Flow };
    if (!flow || !["crawl", "send", "followup"].includes(flow))
      return NextResponse.json({ error: "invalid flow" }, { status: 400 });

    const sb = await supabaseServer();
    const { data: u } = await sb.auth.getUser();
    if (!u?.user)
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const { data: prof } = await sb
      .from("profiles")
      .select("tenant_id")
      .eq("id", u.user.id)
      .maybeSingle();
    const tenantId = (prof?.tenant_id as string | undefined) ?? undefined;
    if (!tenantId)
      return NextResponse.json({ error: "no tenant" }, { status: 400 });

    // ラン作成
    const { data: ins, error } = await sb
      .from("form_outreach_runs")
      .insert({ tenant_id: tenantId, flow, status: "queued" })
      .select("id")
      .single();
    if (error)
      return NextResponse.json({ error: error.message }, { status: 400 });

    // キュー投入（ワーカーは後で実装、今はダミーOK）
    await opsQueue.add(
      "form_outreach_run",
      { kind: "form_outreach_run", tenantId, runId: ins.id, flow },
      { jobId: `form_outreach_run:${tenantId}:${flow}:${ins.id}` }
    );

    return NextResponse.json({ ok: true, runId: ins.id });
  } catch (e: any) {
    console.error("[api.form-outreach.runs POST] error", e);
    return NextResponse.json(
      { error: e?.message || "server error" },
      { status: 500 }
    );
  }
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const flow = url.searchParams.get("flow") as Flow | null;
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
    const tenantId = (prof?.tenant_id as string | undefined) ?? undefined;
    if (!tenantId)
      return NextResponse.json({ error: "no tenant" }, { status: 400 });

    const from = page * limit;
    const to = from + limit - 1;

    let q = sb
      .from("form_outreach_runs")
      .select("id, flow, status, error, started_at, finished_at", {
        count: "exact",
      })
      .eq("tenant_id", tenantId);

    if (flow && ["crawl", "send", "followup"].includes(flow)) {
      q = q.eq("flow", flow);
    }

    const { data, count, error } = await q
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
    console.error("[api.form-outreach.runs GET] error", e);
    return NextResponse.json(
      { error: e?.message || "server error" },
      { status: 500 }
    );
  }
}
