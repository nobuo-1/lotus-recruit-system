// web/src/app/api/mails/send/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export async function POST(req: Request) {
  const sb = await supabaseServer();
  const { data: u } = await sb.auth.getUser();
  if (!u?.user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json();
  const { mailId, recipientIds, scheduleAt } = body || {};
  if (!mailId || !Array.isArray(recipientIds) || recipientIds.length === 0)
    return NextResponse.json({ error: "invalid payload" }, { status: 400 });

  // tenant
  const { data: prof } = await sb
    .from("profiles")
    .select("tenant_id")
    .eq("id", u.user.id)
    .maybeSingle();
  const tenant_id = prof?.tenant_id as string | undefined;
  if (!tenant_id)
    return NextResponse.json({ error: "no tenant" }, { status: 400 });

  if (scheduleAt) {
    // 予約作成
    const { error } = await sb
      .from("mail_schedules")
      .insert({ tenant_id, mail_id: mailId, schedule_at: scheduleAt });
    if (error)
      return NextResponse.json({ error: error.message }, { status: 400 });

    // 状態を scheduled に
    await sb.from("mails").update({ status: "scheduled" }).eq("id", mailId);
    return NextResponse.json({ ok: true, scheduled: true });
  } else {
    // すぐ送る → 実運用ではキューに入れるなど。ここでは delivery を queued で作成
    const rows = recipientIds.map((rid: string) => ({
      mail_id: mailId,
      recipient_id: rid,
      status: "queued",
    }));
    const { error } = await sb.from("mail_deliveries").insert(rows);
    if (error)
      return NextResponse.json({ error: error.message }, { status: 400 });

    await sb.from("mails").update({ status: "sending" }).eq("id", mailId);
    return NextResponse.json({ ok: true });
  }
}
