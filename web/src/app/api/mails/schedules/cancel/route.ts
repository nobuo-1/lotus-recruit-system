// web/src/app/api/mails/schedules/cancel/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

async function readId(req: Request) {
  const ct = req.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    const j = await req.json().catch(() => ({}));
    return String((j as any)?.id ?? "");
  }
  const fd = await req.formData().catch(() => null);
  return String(fd?.get("id") ?? "");
}

export async function POST(req: Request) {
  try {
    const sb = await supabaseServer();
    const { data: u } = await sb.auth.getUser();
    if (!u?.user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const id = await readId(req);
    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }

    const admin = supabaseAdmin();

    // 予約行を取得
    const { data: sch, error: se } = await admin
      .from("mail_schedules")
      .select("id, mail_id, recipient_ids, schedule_at, status")
      .eq("id", id)
      .maybeSingle();

    if (se) return NextResponse.json({ error: se.message }, { status: 400 });
    if (!sch) {
      // 既に消えている → 一覧へ戻す
      return NextResponse.redirect(new URL("/mails/schedules", req.url), 303);
    }

    const mailId = String((sch as any).mail_id || "");
    const recIds: string[] = Array.isArray((sch as any).recipient_ids)
      ? ((sch as any).recipient_ids as string[])
      : [];

    // 配信予約(deliveries)を削除（該当受信者のみ）
    if (mailId && recIds.length) {
      const { error: de } = await admin
        .from("mail_deliveries")
        .delete()
        .eq("mail_id", mailId)
        .in("recipient_id", recIds);
      if (de) return NextResponse.json({ error: de.message }, { status: 400 });
    }

    // スケジュール行を削除
    const { error: re } = await admin
      .from("mail_schedules")
      .delete()
      .eq("id", id);
    if (re) return NextResponse.json({ error: re.message }, { status: 400 });

    // mails.status を再計算
    if (mailId) {
      const now = new Date().toISOString();

      // 未来の予約が残っていれば scheduled
      const { data: restSch } = await admin
        .from("mail_schedules")
        .select("id")
        .eq("mail_id", mailId)
        .eq("status", "scheduled")
        .gt("schedule_at", now);

      // キュー済み/送信済みがあれば queued、何も無ければ draft
      const { data: restDeliv } = await admin
        .from("mail_deliveries")
        .select("id,status")
        .eq("mail_id", mailId);

      let newStatus: "scheduled" | "queued" | "draft" = "draft";
      if ((restSch ?? []).length > 0) newStatus = "scheduled";
      else if ((restDeliv ?? []).some((d: any) => d.status !== "scheduled"))
        newStatus = "queued";

      await admin.from("mails").update({ status: newStatus }).eq("id", mailId);
    }

    // 一覧へリダイレクト
    return NextResponse.redirect(new URL("/mails/schedules", req.url), 303);
  } catch (e: any) {
    console.error("[mails.schedules.cancel] error", e);
    return NextResponse.json(
      { error: e?.message || "server error" },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({ error: "method not allowed" }, { status: 405 });
}
export async function HEAD() {
  return new NextResponse(null, { status: 405 });
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
