// web/src/app/api/mails/schedules/cancel/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { emailQueue } from "@/server/queue";

type Payload =
  | { scheduleId: string; mailId?: string }
  | { id: string; mailId?: string } // HTML form の name="id"
  | { mailId: string };

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
    let mailId = (body as any).mailId || "";

    // スケジュールIDから mail_id を引く
    if (scheduleId) {
      const { data: sched, error: se } = await sb
        .from("mail_schedules")
        .select("id, mail_id, tenant_id, schedule_at, status")
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
      mailId = String(sched.mail_id);
    }

    if (!mailId) {
      return NextResponse.json(
        { error: "mailId or scheduleId required" },
        { status: 400 }
      );
    }

    // ---- DB 削除（future 予約）----
    const nowISO = new Date().toISOString();
    // mail_schedules 削除
    if (scheduleId) {
      await sb.from("mail_schedules").delete().eq("id", scheduleId);
    } else {
      // mailId 指定のみの場合は将来分を全キャンセル
      await sb
        .from("mail_schedules")
        .delete()
        .eq("mail_id", mailId)
        .eq("status", "scheduled")
        .gt("schedule_at", nowISO);
    }

    // deliveries の「予約分」を削除（status=scheduled & 未送信）
    await sb
      .from("mail_deliveries")
      .delete()
      .eq("mail_id", mailId)
      .eq("status", "scheduled")
      .is("sent_at", null);

    // ---- BullMQ の遅延ジョブを除去（jobIdが mail:${mailId}: で始まる）----
    try {
      const delayed = await emailQueue.getJobs(["delayed"]);
      const targets = delayed.filter((j) =>
        (j.id || "").startsWith(`mail:${mailId}:`)
      );
      await Promise.all(targets.map((j) => j.remove().catch(() => {})));
    } catch (e) {
      // キュー未設定でも落ちないように握りつぶす
      console.warn("[mails/cancel] queue cleanup skipped:", e);
    }

    // ---- mails.status を整える ----
    const { data: future } = await sb
      .from("mail_schedules")
      .select("id")
      .eq("status", "scheduled")
      .eq("mail_id", mailId)
      .gt("schedule_at", nowISO);
    const { data: sentAny } = await sb
      .from("mail_deliveries")
      .select("id")
      .eq("mail_id", mailId)
      .eq("status", "sent")
      .limit(1);

    const nextStatus =
      (future?.length ?? 0) > 0
        ? "scheduled"
        : (sentAny?.length ?? 0) > 0
        ? "queued"
        : "draft";
    await sb.from("mails").update({ status: nextStatus }).eq("id", mailId);

    return NextResponse.json({ ok: true, mailId, status: nextStatus });
  } catch (e: any) {
    console.error("POST /api/mails/schedules/cancel error", e);
    return NextResponse.json(
      { error: e?.message || "server error" },
      { status: 500 }
    );
  }
}

export async function GET() {
  // 直接アクセス時のエラーを防ぐ（UI遷移で飛ばないよう実装済みだが保険）
  return NextResponse.json({ error: "method not allowed" }, { status: 405 });
}
