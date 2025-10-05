// src/app/api/campaigns/[id]/schedule/route.ts
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> } // params は Promise
) {
  try {
    const { id } = await ctx.params;

    const body = await req.json().catch(() => ({} as { when?: string }));
    const when = body?.when;
    if (!when) {
      return NextResponse.json({ error: "when required" }, { status: 400 });
    }

    const dt = new Date(when);
    if (Number.isNaN(dt.getTime())) {
      return NextResponse.json({ error: "invalid datetime" }, { status: 400 });
    }

    const supabase = await supabaseServer();
    const { data: u } = await supabase.auth.getUser();
    if (!u?.user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    // テナントIDを取得
    const { data: prof } = await supabase
      .from("profiles")
      .select("tenant_id")
      .eq("id", u.user.id)
      .maybeSingle();
    const tenantId = (prof?.tenant_id as string | undefined) ?? undefined;

    // キャンペーン更新（見た目用）
    const iso = dt.toISOString();
    const { error } = await supabase
      .from("campaigns")
      .update({ status: "scheduled", scheduled_at: iso })
      .eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // 一覧の「未来予約あり」判定用に email_schedules へ 1 行追加
    if (tenantId) {
      await supabase.from("email_schedules").insert({
        tenant_id: tenantId,
        campaign_id: id,
        scheduled_at: iso,
        status: "scheduled",
      });
    }

    return NextResponse.json({ ok: true, scheduled_at: iso });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: msg ?? "internal error" },
      { status: 500 }
    );
  }
}
