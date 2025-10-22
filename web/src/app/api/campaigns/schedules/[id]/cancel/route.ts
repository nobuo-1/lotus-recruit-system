// web/src/app/api/campaigns/schedules/[id]/cancel/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export async function POST(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const sb = await supabaseServer();
    const { data: u } = await sb.auth.getUser();
    if (!u?.user)
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const schedId = params.id;

    // まず campaign_schedules がある前提で取ってみる（無い環境でもOK）
    let campaignId: string | null = null;
    try {
      const { data: cs } = await sb
        .from("campaign_schedules")
        .select("id, campaign_id")
        .eq("id", schedId)
        .maybeSingle();
      if (cs) campaignId = cs.campaign_id;
    } catch {
      /* no-op */
    }

    // もし campaignId が取れなければ、deliveries 側から推測（schedId を campaign_id として来るUIも考慮）
    if (!campaignId) {
      // schedId を campaignId とみなすクライアントもあるため、先にそれで削除
      campaignId = schedId;
    }

    if (!campaignId) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }

    // campaign_schedules がある場合は削除（無ければ無視）
    try {
      await sb
        .from("campaign_schedules")
        .delete()
        .eq("campaign_id", campaignId);
    } catch {
      /* no-op */
    }

    // 予約中の deliveries を削除（scheduled/queued）
    await sb
      .from("deliveries")
      .delete()
      .eq("campaign_id", campaignId)
      .in("status", ["scheduled", "queued"]);

    // 残存状況で campaigns.status を更新
    const { count: remainScheduled } = await sb
      .from("deliveries")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", campaignId)
      .eq("status", "scheduled");
    const { count: remainQueued } = await sb
      .from("deliveries")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", campaignId)
      .eq("status", "queued");
    const { count: hasSent } = await sb
      .from("deliveries")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", campaignId)
      .eq("status", "sent");

    let next = "draft";
    if ((remainScheduled ?? 0) > 0) next = "scheduled";
    else if ((remainQueued ?? 0) > 0) next = "queued";
    else if ((hasSent ?? 0) > 0) next = "sent";

    await sb.from("campaigns").update({ status: next }).eq("id", campaignId);

    return NextResponse.json({ ok: true, campaignId, status: next });
  } catch (e: any) {
    console.error("POST /api/campaigns/schedules/[id]/cancel error", e);
    return NextResponse.json(
      { error: e?.message || "server error" },
      { status: 500 }
    );
  }
}
