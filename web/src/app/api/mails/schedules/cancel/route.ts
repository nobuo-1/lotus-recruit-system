// web/src/app/api/mails/schedules/cancel/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export async function POST(req: Request) {
  try {
    const form = await req.formData().catch(() => null);
    const id = String(form?.get("id") ?? "");
    if (!id)
      return NextResponse.json({ error: "id required" }, { status: 400 });

    const sb = await supabaseServer();
    const { data: u } = await sb.auth.getUser();
    if (!u?.user)
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const { data: prof } = await sb
      .from("profiles")
      .select("tenant_id")
      .eq("id", u.user.id)
      .maybeSingle();
    const tenantId = (prof?.tenant_id as string | undefined) ?? undefined;

    const { data: sched, error: se } = await sb
      .from("mail_schedules")
      .select("id, mail_id, schedule_at, status, tenant_id")
      .eq("id", id)
      .maybeSingle();
    if (se) return NextResponse.json({ error: se.message }, { status: 400 });
    if (!sched)
      return NextResponse.json({ error: "not found" }, { status: 404 });
    if (tenantId && sched.tenant_id && sched.tenant_id !== tenantId)
      return NextResponse.json({ error: "forbidden" }, { status: 403 });

    const mailId = sched.mail_id;

    // 1) 未送信の deliveries を削除（履歴は残すため sent_at が入っているものは残す）
    await sb
      .from("mail_deliveries")
      .delete()
      .eq("mail_id", mailId)
      .is("sent_at", null);

    // 2) この予約そのものを削除
    await sb.from("mail_schedules").delete().eq("id", id);

    // 3) 残存状況を見て mails.status を決定
    const nowISO = new Date().toISOString();

    // 未来の予約が残っているか
    const { count: remainFuture } = await sb
      .from("mail_schedules")
      .select("id", { count: "exact", head: true })
      .eq("mail_id", mailId)
      .gte("schedule_at", nowISO);

    // 過去の送信履歴があるか
    const { count: sentHistory } = await sb
      .from("mail_deliveries")
      .select("id", { count: "exact", head: true })
      .eq("mail_id", mailId)
      .not("sent_at", "is", null);

    // 未送信のキューが残っているか（他経路でキュー済みの可能性）
    const { count: remainQueue } = await sb
      .from("mail_deliveries")
      .select("id", { count: "exact", head: true })
      .eq("mail_id", mailId)
      .is("sent_at", null);

    let nextStatus: string = "draft";
    if ((remainFuture ?? 0) > 0) nextStatus = "scheduled";
    else if ((remainQueue ?? 0) > 0 || (sentHistory ?? 0) > 0)
      nextStatus = "queued";
    // （完全に何もなければ draft）

    await sb.from("mails").update({ status: nextStatus }).eq("id", mailId);

    return NextResponse.redirect(new URL("/mails/schedules", req.url), 303);
  } catch (e: any) {
    console.error("POST /api/mails/schedules/cancel error", e);
    return NextResponse.json(
      { error: e?.message || "server error" },
      { status: 500 }
    );
  }
}
