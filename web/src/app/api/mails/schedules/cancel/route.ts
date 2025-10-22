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

    const isFuture =
      !!sched.schedule_at && Date.parse(sched.schedule_at) > Date.now();
    if (String(sched.status).toLowerCase() !== "scheduled" || !isFuture) {
      return NextResponse.json({ error: "not cancellable" }, { status: 400 });
    }

    // スケジュールをキャンセル
    await sb
      .from("mail_schedules")
      .update({ status: "cancelled" })
      .eq("id", id);

    // 未送信の delivery をキャンセル（念のため queued/processing も抑止）
    await sb
      .from("mail_deliveries")
      .update({ status: "cancelled" })
      .eq("mail_id", sched.mail_id)
      .is("sent_at", null)
      .in("status", ["scheduled", "queued", "processing"]);

    // もう予約が残っていなければ mails を draft に寄せる（任意）
    const { count } = await sb
      .from("mail_deliveries")
      .select("id", { head: true, count: "exact" })
      .eq("mail_id", sched.mail_id)
      .in("status", ["scheduled", "queued", "processing"]);

    if (!count) {
      await sb
        .from("mails")
        .update({ status: "draft" })
        .eq("id", sched.mail_id);
    }

    return NextResponse.redirect(new URL("/mails/schedules", req.url), 303);
  } catch (e: any) {
    console.error("POST /api/mails/schedules/cancel", e);
    return NextResponse.json(
      { error: e?.message || "server error" },
      { status: 500 }
    );
  }
}
