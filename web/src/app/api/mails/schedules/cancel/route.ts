// web/src/app/api/mails/schedules/cancel/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type Payload =
  | { scheduleId: string; mailId?: never }
  | { mailId: string; scheduleId?: never };

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
    const scheduleId =
      typeof body.scheduleId === "string" ? body.scheduleId : null;
    const mailIdBody = typeof body.mailId === "string" ? body.mailId : null;

    const sb = await supabaseServer();
    const { data: u } = await sb.auth.getUser();
    if (!u?.user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    // テナント取得
    const { data: prof } = await sb
      .from("profiles")
      .select("tenant_id")
      .eq("id", u.user.id)
      .maybeSingle();
    const tenantId = (prof?.tenant_id as string | undefined) ?? undefined;

    const admin = supabaseAdmin();

    // キャンセル対象の mail_id を特定
    let mailId = mailIdBody ?? null;
    if (!mailId && scheduleId) {
      const { data: sch, error: se } = await admin
        .from("mail_schedules")
        .select("id, mail_id, tenant_id, status, schedule_at")
        .eq("id", scheduleId)
        .maybeSingle();
      if (se) return NextResponse.json({ error: se.message }, { status: 400 });
      if (!sch)
        return NextResponse.json(
          { error: "schedule not found" },
          { status: 404 }
        );
      if (tenantId && sch.tenant_id && sch.tenant_id !== tenantId)
        return NextResponse.json({ error: "forbidden" }, { status: 403 });
      mailId = sch.mail_id;
    }
    if (!mailId) {
      return NextResponse.json(
        { error: "mailId or scheduleId required" },
        { status: 400 }
      );
    }

    // メールが自テナントか確認
    const { data: mail, error: me } = await admin
      .from("mails")
      .select("id, tenant_id")
      .eq("id", mailId)
      .maybeSingle();
    if (me) return NextResponse.json({ error: me.message }, { status: 400 });
    if (!mail)
      return NextResponse.json({ error: "mail not found" }, { status: 404 });
    if (
      tenantId &&
      (mail as any).tenant_id &&
      (mail as any).tenant_id !== tenantId
    )
      return NextResponse.json({ error: "forbidden" }, { status: 403 });

    // 1) 未来の予約スケジュールを削除
    const now = nowIso();
    if (scheduleId) {
      await admin
        .from("mail_schedules")
        .delete()
        .eq("id", scheduleId)
        .neq("status", "cancelled")
        .gte("schedule_at", now);
    } else {
      // mailId 指定時は、未来の scheduled を全削除
      await admin
        .from("mail_schedules")
        .delete()
        .eq("mail_id", mailId)
        .neq("status", "cancelled")
        .gte("schedule_at", now);
    }

    // 2) 予約に紐づく deliveries（まだ scheduled のもの）を削除
    await admin
      .from("mail_deliveries")
      .delete()
      .eq("mail_id", mailId)
      .eq("status", "scheduled");

    // 3) mails.status を現在の状況に合わせて更新
    //    （未来の予約が残っていれば scheduled。
    //      それ以外で queued/processing/sent が残っていれば queued。
    //      何も無ければ draft）
    const { count: futureCnt } = await admin
      .from("mail_schedules")
      .select("id", { count: "exact", head: true })
      .eq("mail_id", mailId)
      .gte("schedule_at", now)
      .eq("status", "scheduled");

    const { count: activeCnt } = await admin
      .from("mail_deliveries")
      .select("id", { count: "exact", head: true })
      .eq("mail_id", mailId)
      .in("status", ["queued", "processing", "sent"]);

    const newStatus =
      (futureCnt ?? 0) > 0
        ? "scheduled"
        : (activeCnt ?? 0) > 0
        ? "queued"
        : "draft";

    await admin.from("mails").update({ status: newStatus }).eq("id", mailId);

    return NextResponse.json({ ok: true, mailId, newStatus });
  } catch (e: any) {
    console.error("POST /api/mails/schedules/cancel error", e);
    return NextResponse.json(
      { error: e?.message || "server error" },
      { status: 500 }
    );
  }
}
