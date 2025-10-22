// web/src/app/api/campaigns/schedules/cancel/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { emailQueue } from "@/server/queue";

type Payload =
  | { scheduleId: string; campaignId?: string }
  | { id: string; campaignId?: string } // HTML form の name="id"
  | { campaignId: string };

async function readBody(req: Request): Promise<Record<string, any>> {
  const ct = req.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    return (await req.json().catch(() => ({}))) as any;
  }
  if (
    ct.includes("application/x-www-form-urlencoded") ||
    ct.includes("multipart/form-data")
  ) {
    const fd = await req.formData();
    return Object.fromEntries(
      Array.from(fd.entries()).map(([k, v]) => [
        k,
        typeof v === "string" ? v : "",
      ])
    );
  }
  return {};
}

export async function POST(req: Request) {
  try {
    const body = (await readBody(req)) as Payload;

    const sb = await supabaseServer();
    const { data: u } = await sb.auth.getUser();
    if (!u?.user)
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    // tenant
    const { data: prof } = await sb
      .from("profiles")
      .select("tenant_id")
      .eq("id", u.user.id)
      .maybeSingle();
    const tenantId = (prof?.tenant_id as string | undefined) ?? undefined;

    const scheduleId = (body as any).scheduleId || (body as any).id || "";
    let campaignId = (body as any).campaignId || "";

    // スケジュールID→ campaign_id 解決（email_schedules）
    if (scheduleId) {
      const { data: sched, error: se } = await sb
        .from("email_schedules")
        .select("id, campaign_id, tenant_id, scheduled_at, status")
        .eq("id", scheduleId)
        .maybeSingle();
      if (se) return NextResponse.json({ error: se.message }, { status: 400 });
      if (!sched)
        return NextResponse.json(
          { error: "schedule not found" },
          { status: 404 }
        );
      if (
        tenantId &&
        (sched as any).tenant_id &&
        (sched as any).tenant_id !== tenantId
      ) {
        return NextResponse.json({ error: "forbidden" }, { status: 403 });
      }
      campaignId = String(sched.campaign_id);
    }

    if (!campaignId) {
      return NextResponse.json(
        { error: "campaignId or scheduleId required" },
        { status: 400 }
      );
    }

    const nowISO = new Date().toISOString();

    // ---- email_schedules の該当行を削除 ----
    if (scheduleId) {
      await sb.from("email_schedules").delete().eq("id", scheduleId);
    } else {
      // campaignId 指定のみ：未来分を全キャンセル
      await sb
        .from("email_schedules")
        .delete()
        .eq("campaign_id", campaignId)
        .eq("status", "scheduled")
        .gt("scheduled_at", nowISO);
    }

    // ---- deliveries の「予約分」（status=scheduled & 未送信）を削除 ----
    await sb
      .from("deliveries")
      .delete()
      .eq("campaign_id", campaignId)
      .eq("status", "scheduled")
      .is("sent_at", null);

    // ---- BullMQ 遅延ジョブ除去（jobIdが camp:${campaignId}: …）----
    try {
      const delayed = await emailQueue.getJobs(["delayed"]);
      const targets = delayed.filter((j) =>
        (j.id || "").startsWith(`camp:${campaignId}:`)
      );
      await Promise.all(targets.map((j) => j.remove().catch(() => {})));
    } catch (e) {
      console.warn("[campaigns/cancel] queue cleanup skipped:", e);
    }

    // ---- campaigns.status を整える ----
    const { data: future } = await sb
      .from("email_schedules")
      .select("id")
      .eq("status", "scheduled")
      .eq("campaign_id", campaignId)
      .gt("scheduled_at", nowISO);
    const { data: sentAny } = await sb
      .from("deliveries")
      .select("id")
      .eq("campaign_id", campaignId)
      .eq("status", "sent")
      .limit(1);

    const nextStatus =
      (future?.length ?? 0) > 0
        ? "scheduled"
        : (sentAny?.length ?? 0) > 0
        ? "queued"
        : "draft";
    await sb
      .from("campaigns")
      .update({ status: nextStatus })
      .eq("id", campaignId);

    return NextResponse.json({ ok: true, campaignId, status: nextStatus });
  } catch (e: any) {
    console.error("POST /api/campaigns/schedules/cancel error", e);
    return NextResponse.json(
      { error: e?.message || "server error" },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({ error: "method not allowed" }, { status: 405 });
}
