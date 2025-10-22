// web/src/app/api/campaigns/schedules/cancel/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(req: Request) {
  try {
    const admin = supabaseAdmin();

    let id = "";
    const ct = req.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      const j = await req.json().catch(() => ({} as any));
      id = String(j?.id ?? "");
    } else {
      const fd = await req.formData();
      id = String(fd.get("id") ?? "");
    }
    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }

    // email_schedules から対象を取得（campaign_id と schedule_at が必要）
    const sch = await admin
      .from("email_schedules")
      .select("id, campaign_id, schedule_at")
      .eq("id", id)
      .maybeSingle();

    if (sch.error || !sch.data) {
      return NextResponse.json({ ok: false, removed: 0 });
    }

    const { campaign_id, schedule_at } = sch.data as any;

    // deliveries の“未送信（scheduled）で、同一 campaign & 同一 scheduled_at”を削除
    await admin
      .from("deliveries")
      .delete()
      .eq("campaign_id", campaign_id)
      .eq("status", "scheduled")
      .eq("scheduled_at", schedule_at);

    // email_schedules の行を削除
    await admin.from("email_schedules").delete().eq("id", id);

    // 状況に応じて campaigns.status を更新
    const scheduledLeft = await admin
      .from("deliveries")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", campaign_id)
      .eq("status", "scheduled");

    const sentExists = await admin
      .from("deliveries")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", campaign_id)
      .eq("status", "sent");

    let newStatus = "draft";
    if ((scheduledLeft.count ?? 0) > 0) newStatus = "scheduled";
    else if ((sentExists.count ?? 0) > 0) newStatus = "queued";

    await admin
      .from("campaigns")
      .update({ status: newStatus })
      .eq("id", campaign_id);

    return NextResponse.redirect(new URL("/email/schedules", req.url), 303);
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "server error" },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({ error: "POST only" }, { status: 405 });
}
