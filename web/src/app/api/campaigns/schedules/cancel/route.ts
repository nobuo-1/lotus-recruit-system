// web/src/app/api/campaigns/schedules/cancel/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type Payload = { campaignId: string };

function nowIso() {
  return new Date().toISOString();
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
export async function GET() {
  return NextResponse.json({ error: "method not allowed" }, { status: 405 });
}
export async function HEAD() {
  return new NextResponse(null, { status: 405 });
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as Partial<Payload>;
    const campaignId = String(body.campaignId ?? "");
    if (!campaignId) {
      return NextResponse.json(
        { error: "campaignId is required" },
        { status: 400 }
      );
    }

    const sb = await supabaseServer();
    const { data: u } = await sb.auth.getUser();
    if (!u?.user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    // tenant
    const { data: prof } = await sb
      .from("profiles")
      .select("tenant_id")
      .eq("id", u.user.id)
      .maybeSingle();
    const tenantId = (prof?.tenant_id as string | undefined) ?? undefined;

    const admin = supabaseAdmin();

    // 自テナントのキャンペーンか確認
    const { data: camp, error: ce } = await admin
      .from("campaigns")
      .select("id, tenant_id")
      .eq("id", campaignId)
      .maybeSingle();
    if (ce) return NextResponse.json({ error: ce.message }, { status: 400 });
    if (!camp)
      return NextResponse.json(
        { error: "campaign not found" },
        { status: 404 }
      );
    if (
      tenantId &&
      (camp as any).tenant_id &&
      (camp as any).tenant_id !== tenantId
    )
      return NextResponse.json({ error: "forbidden" }, { status: 403 });

    const now = nowIso();

    // 1) 未来の scheduled deliveries を削除（予約キャンセル）
    await admin
      .from("deliveries")
      .delete()
      .eq("campaign_id", campaignId)
      .eq("status", "scheduled")
      .gte("scheduled_at", now);

    // 2) campaigns.status を現在の状況に合わせて更新
    const { count: futureCnt } = await admin
      .from("deliveries")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", campaignId)
      .eq("status", "scheduled")
      .gte("scheduled_at", now);

    const { count: activeCnt } = await admin
      .from("deliveries")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", campaignId)
      .in("status", ["queued", "processing", "sent"]);

    const newStatus =
      (futureCnt ?? 0) > 0
        ? "scheduled"
        : (activeCnt ?? 0) > 0
        ? "queued"
        : "draft";

    await admin
      .from("campaigns")
      .update({ status: newStatus })
      .eq("id", campaignId);

    return NextResponse.json({ ok: true, campaignId, newStatus });
  } catch (e: any) {
    console.error("POST /api/campaigns/schedules/cancel error", e);
    return NextResponse.json(
      { error: e?.message || "server error" },
      { status: 500 }
    );
  }
}
