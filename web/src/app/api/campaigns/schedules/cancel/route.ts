// web/src/app/api/campaigns/schedules/cancel/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

async function readId(req: Request) {
  const ct = req.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    const j = await req.json().catch(() => ({}));
    return String((j as any)?.id ?? "");
  }
  const fd = await req.formData().catch(() => null);
  return String(fd?.get("id") ?? "");
}

export async function POST(req: Request) {
  try {
    const sb = await supabaseServer();
    const { data: u } = await sb.auth.getUser();
    if (!u?.user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const id = await readId(req);
    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }

    const admin = supabaseAdmin();

    // 予約行を取得（必要最小限）
    const { data: sch, error: se } = await admin
      .from("email_schedules")
      .select("id, campaign_id, scheduled_at, status")
      .eq("id", id)
      .maybeSingle();

    if (se) return NextResponse.json({ error: se.message }, { status: 400 });
    if (!sch) {
      return NextResponse.redirect(new URL("/email/schedules", req.url), 303);
    }

    const campaignId = String((sch as any).campaign_id || "");

    // （重要）未送信 deliveries を一括削除
    if (campaignId) {
      const { error: de } = await admin
        .from("deliveries")
        .delete()
        .eq("campaign_id", campaignId)
        .is("sent_at", null);
      if (de) return NextResponse.json({ error: de.message }, { status: 400 });
    }

    // email_schedules から予約自体を削除
    const { error: re } = await admin
      .from("email_schedules")
      .delete()
      .eq("id", id);
    if (re) return NextResponse.json({ error: re.message }, { status: 400 });

    // campaigns.status を再計算
    if (campaignId) {
      const now = new Date().toISOString();

      const { data: restSch } = await admin
        .from("email_schedules")
        .select("id")
        .eq("campaign_id", campaignId)
        .eq("status", "scheduled")
        .gt("scheduled_at", now);

      const { data: restDeliv } = await admin
        .from("deliveries")
        .select("id,status,sent_at")
        .eq("campaign_id", campaignId);

      let newStatus: "scheduled" | "queued" | "draft" = "draft";
      if ((restSch ?? []).length > 0) newStatus = "scheduled";
      else if (
        (restDeliv ?? []).some(
          (d: any) => (d.status ?? "") !== "scheduled" || d.sent_at
        )
      )
        newStatus = "queued";

      await admin
        .from("campaigns")
        .update({ status: newStatus })
        .eq("id", campaignId);
    }

    return NextResponse.redirect(new URL("/email/schedules", req.url), 303);
  } catch (e: any) {
    console.error("[campaigns.schedules.cancel] error", e);
    return NextResponse.json(
      { error: e?.message || "server error" },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({ error: "method not allowed" }, { status: 405 });
}
export async function HEAD() {
  return new NextResponse(null, { status: 405 });
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
