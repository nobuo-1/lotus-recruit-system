// web/src/app/api/campaigns/schedules/cancel/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

function wantsHtml(req: Request) {
  const accept = req.headers.get("accept") || "";
  return accept.includes("text/html");
}

export async function POST(req: Request) {
  try {
    const sb = await supabaseServer();
    const { data: u } = await sb.auth.getUser();
    if (!u?.user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    // id / scheduleId / campaignId を受ける
    let scheduleId: string | null = null;
    let campaignId: string | null = null;

    const ct = req.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      const j = await req.json().catch(() => ({}));
      scheduleId = j?.id || j?.scheduleId || null;
      campaignId = j?.campaignId || null;
    } else {
      const fd = await req.formData();
      scheduleId =
        (fd.get("id") as string) || (fd.get("scheduleId") as string) || null;
      campaignId = (fd.get("campaignId") as string) || null;
    }

    if (!scheduleId && !campaignId) {
      return NextResponse.json(
        { error: "campaignId or scheduleId required" },
        { status: 400 }
      );
    }

    // email_schedules から対象特定（campaign 側）
    let schedule: any = null;
    if (scheduleId) {
      const { data: s, error: se } = await sb
        .from("email_schedules")
        .select("id, campaign_id, scheduled_at, status")
        .eq("id", scheduleId)
        .maybeSingle();
      if (se) return NextResponse.json({ error: se.message }, { status: 500 });
      schedule = s;
    } else if (campaignId) {
      const { data: s, error: se } = await sb
        .from("email_schedules")
        .select("id, campaign_id, scheduled_at, status")
        .eq("campaign_id", campaignId)
        .eq("status", "scheduled")
        .order("scheduled_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (se) return NextResponse.json({ error: se.message }, { status: 500 });
      schedule = s;
    }

    if (!schedule) {
      if (wantsHtml(req)) {
        return NextResponse.redirect(new URL("/email/schedules", req.url));
      }
      return NextResponse.json({ ok: true, skipped: true });
    }

    const isFuture =
      schedule.scheduled_at &&
      !Number.isNaN(Date.parse(schedule.scheduled_at)) &&
      Date.parse(schedule.scheduled_at) > Date.now();

    if (String(schedule.status).toLowerCase() !== "scheduled" || !isFuture) {
      if (wantsHtml(req)) {
        return NextResponse.redirect(new URL("/email/schedules", req.url));
      }
      return NextResponse.json({ ok: true, skipped: true });
    }

    const targetCampaignId = String(schedule.campaign_id);

    // deliveries（未送信）削除
    await sb
      .from("deliveries")
      .delete()
      .eq("campaign_id", targetCampaignId)
      .in("status", ["scheduled", "queued"]);

    // email_schedules 行削除
    await sb.from("email_schedules").delete().eq("id", schedule.id);

    // campaigns の status 調整
    const nowISO = new Date().toISOString();
    const { count: futureCount } = await sb
      .from("email_schedules")
      .select("*", { count: "exact", head: true })
      .eq("campaign_id", targetCampaignId)
      .eq("status", "scheduled")
      .gte("scheduled_at", nowISO);

    const hasFuture = (futureCount ?? 0) > 0;

    const { count: sentCount } = await sb
      .from("deliveries")
      .select("*", { count: "exact", head: true })
      .eq("campaign_id", targetCampaignId)
      .eq("status", "sent");

    const newStatus = hasFuture
      ? "scheduled"
      : (sentCount ?? 0) > 0
      ? "queued"
      : "draft";

    await sb
      .from("campaigns")
      .update({ status: newStatus })
      .eq("id", targetCampaignId);

    if (wantsHtml(req)) {
      return NextResponse.redirect(new URL("/email/schedules", req.url));
    }
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "server error" },
      { status: 500 }
    );
  }
}
