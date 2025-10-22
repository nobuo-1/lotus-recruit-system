// web/src/app/api/mails/schedules/cancel/route.ts
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

    // id / scheduleId / mailId どれでも受け付け
    let scheduleId: string | null = null;
    let mailId: string | null = null;

    const ct = req.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      const j = await req.json().catch(() => ({}));
      scheduleId = j?.id || j?.scheduleId || null;
      mailId = j?.mailId || null;
    } else {
      const fd = await req.formData();
      scheduleId =
        (fd.get("id") as string) || (fd.get("scheduleId") as string) || null;
      mailId = (fd.get("mailId") as string) || null;
    }

    if (!scheduleId && !mailId) {
      return NextResponse.json(
        { error: "mailId or scheduleId required" },
        { status: 400 }
      );
    }

    // スケジュール特定
    let schedule: any = null;
    if (scheduleId) {
      const { data: s, error: se } = await sb
        .from("mail_schedules")
        .select("id, mail_id, schedule_at, status, tenant_id")
        .eq("id", scheduleId)
        .maybeSingle();
      if (se) return NextResponse.json({ error: se.message }, { status: 500 });
      schedule = s;
    } else if (mailId) {
      const { data: s, error: se } = await sb
        .from("mail_schedules")
        .select("id, mail_id, schedule_at, status, tenant_id")
        .eq("mail_id", mailId)
        .eq("status", "scheduled")
        .order("schedule_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (se) return NextResponse.json({ error: se.message }, { status: 500 });
      schedule = s;
    }

    if (!schedule) {
      if (wantsHtml(req)) {
        return NextResponse.redirect(new URL("/mails/schedules", req.url));
      }
      return NextResponse.json({ ok: true, skipped: true });
    }

    // 未来・scheduled のみ対象
    const isFuture =
      schedule.schedule_at &&
      !Number.isNaN(Date.parse(schedule.schedule_at)) &&
      Date.parse(schedule.schedule_at) > Date.now();
    if (String(schedule.status).toLowerCase() !== "scheduled" || !isFuture) {
      if (wantsHtml(req)) {
        return NextResponse.redirect(new URL("/mails/schedules", req.url));
      }
      return NextResponse.json({ ok: true, skipped: true });
    }

    const targetMailId = String(schedule.mail_id);

    // deliveries（未送信）削除
    await sb
      .from("mail_deliveries")
      .delete()
      .eq("mail_id", targetMailId)
      .in("status", ["scheduled", "queued"]);

    // スケジュール行削除
    await sb.from("mail_schedules").delete().eq("id", schedule.id);

    // mails の status を整合
    const nowISO = new Date().toISOString();
    const { count: futureCount } = await sb
      .from("mail_schedules")
      .select("*", { count: "exact", head: true })
      .eq("mail_id", targetMailId)
      .eq("status", "scheduled")
      .gte("schedule_at", nowISO);

    const hasFuture = (futureCount ?? 0) > 0;

    const { count: sentCount } = await sb
      .from("mail_deliveries")
      .select("*", { count: "exact", head: true })
      .eq("mail_id", targetMailId)
      .eq("status", "sent");

    const newStatus = hasFuture
      ? "scheduled"
      : (sentCount ?? 0) > 0
      ? "queued"
      : "draft";

    await sb.from("mails").update({ status: newStatus }).eq("id", targetMailId);

    if (wantsHtml(req)) {
      return NextResponse.redirect(new URL("/mails/schedules", req.url));
    }
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "server error" },
      { status: 500 }
    );
  }
}
