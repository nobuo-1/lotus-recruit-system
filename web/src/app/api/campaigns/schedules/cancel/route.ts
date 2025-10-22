// web/src/app/api/campaigns/schedules/cancel/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export async function POST(req: Request) {
  try {
    const form = await req.formData().catch(() => null);
    const id = String(form?.get("id") ?? "");
    if (!id)
      return NextResponse.json({ error: "id required" }, { status: 400 });

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

    // まず deliveries.id としてヒットするか（1件単体キャンセル）
    const { data: delRow } = await sb
      .from("deliveries")
      .select("id, tenant_id, campaign_id, scheduled_at, status")
      .eq("id", id)
      .maybeSingle();

    const now = Date.now();

    if (delRow) {
      if (tenantId && delRow.tenant_id !== tenantId)
        return NextResponse.json({ error: "forbidden" }, { status: 403 });
      const future =
        !!delRow.scheduled_at && Date.parse(delRow.scheduled_at) > now;
      if (String(delRow.status).toLowerCase() !== "scheduled" || !future)
        return NextResponse.json({ error: "not cancellable" }, { status: 400 });

      await sb.from("deliveries").update({ status: "cancelled" }).eq("id", id);
      return NextResponse.redirect(new URL("/email/schedules", req.url), 303);
    }

    // 単体が無ければ id を campaign_id とみなして、未来の scheduled を一括キャンセル
    const { error } = await sb
      .from("deliveries")
      .update({ status: "cancelled" })
      .eq("tenant_id", tenantId ?? null)
      .eq("campaign_id", id)
      .gte("scheduled_at", new Date().toISOString())
      .eq("status", "scheduled");

    if (error)
      return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.redirect(new URL("/email/schedules", req.url), 303);
  } catch (e: any) {
    console.error("POST /api/campaigns/schedules/cancel", e);
    return NextResponse.json(
      { error: e?.message || "server error" },
      { status: 500 }
    );
  }
}
