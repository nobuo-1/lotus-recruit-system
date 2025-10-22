// web/src/app/api/mails/schedules/[id]/cancel/route.ts
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
    // 予約取得
    const { data: sched, error: se } = await sb
      .from("mail_schedules")
      .select("id, mail_id, tenant_id, schedule_at, status")
      .eq("id", schedId)
      .maybeSingle();
    if (se) return NextResponse.json({ error: se.message }, { status: 400 });
    if (!sched)
      return NextResponse.json({ error: "not found" }, { status: 404 });

    const mailId = sched.mail_id;

    // 予約行を削除
    await sb.from("mail_schedules").delete().eq("id", schedId);

    // 未送信の deliveries を削除（scheduled/queued）
    await sb
      .from("mail_deliveries")
      .delete()
      .eq("mail_id", mailId)
      .in("status", ["scheduled", "queued"]);

    // 残存状況に応じて mails.status を更新
    const { count: remainScheduled } = await sb
      .from("mail_schedules")
      .select("id", { count: "exact", head: true })
      .eq("mail_id", mailId);
    const { count: remainQueued } = await sb
      .from("mail_deliveries")
      .select("id", { count: "exact", head: true })
      .eq("mail_id", mailId)
      .eq("status", "queued");
    const { count: hasSent } = await sb
      .from("mail_deliveries")
      .select("id", { count: "exact", head: true })
      .eq("mail_id", mailId)
      .eq("status", "sent");

    let next = "draft";
    if ((remainScheduled ?? 0) > 0) next = "scheduled";
    else if ((remainQueued ?? 0) > 0) next = "queued";
    else if ((hasSent ?? 0) > 0) next = "sent";

    await sb.from("mails").update({ status: next }).eq("id", mailId);

    return NextResponse.json({ ok: true, mailId, status: next });
  } catch (e: any) {
    console.error("POST /api/mails/schedules/[id]/cancel error", e);
    return NextResponse.json(
      { error: e?.message || "server error" },
      { status: 500 }
    );
  }
}
