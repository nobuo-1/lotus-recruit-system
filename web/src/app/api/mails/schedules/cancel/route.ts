// web/src/app/api/mails/schedules/cancel/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

async function readIdFromRequest(req: Request) {
  const ct = req.headers.get("content-type") || "";
  if (
    ct.includes("application/x-www-form-urlencoded") ||
    ct.includes("multipart/form-data")
  ) {
    try {
      const fd = await req.formData();
      const v = String(fd.get("id") ?? fd.get("scheduleId") ?? "");
      return v || null;
    } catch {
      /* fallthrough */
    }
  }
  try {
    const j = (await req.json().catch(() => ({}))) as any;
    const v = String(j?.id ?? j?.scheduleId ?? "");
    return v || null;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  const id = await readIdFromRequest(req);
  if (!id) {
    return NextResponse.json(
      { ok: false, error: "id required" },
      { status: 400 }
    );
  }

  const sb = await supabaseServer();
  const { data: u } = await sb.auth.getUser();
  if (!u?.user) {
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401 }
    );
  }

  // 該当スケジュール取得（mail_id）
  const { data: sched, error: se } = await sb
    .from("mail_schedules")
    .select("id, mail_id")
    .eq("id", id)
    .maybeSingle();
  if (se)
    return NextResponse.json({ ok: false, error: se.message }, { status: 500 });

  if (!sched) {
    // 既に消えている場合も一覧へ戻す
    return NextResponse.redirect(new URL("/mails/schedules", req.url), 303);
  }

  const mailId = String((sched as any).mail_id);

  // 1) mail_schedules の該当行を削除
  const { error: delSchedErr } = await sb
    .from("mail_schedules")
    .delete()
    .eq("id", id);
  if (delSchedErr)
    return NextResponse.json(
      { ok: false, error: delSchedErr.message },
      { status: 500 }
    );

  // 2) mail_deliveries（未送信ぶん）を削除
  const { error: delDelErr } = await sb
    .from("mail_deliveries")
    .delete()
    .eq("mail_id", mailId)
    .in("status", ["scheduled", "queued"]);
  if (delDelErr)
    return NextResponse.json(
      { ok: false, error: delDelErr.message },
      { status: 500 }
    );

  // 3) mails.status の見直し
  const { data: remain } = await sb
    .from("mail_deliveries")
    .select("status")
    .eq("mail_id", mailId);
  const statuses = (remain ?? []).map((r: any) =>
    String(r.status || "").toLowerCase()
  );
  let newStatus = "draft";
  if (statuses.some((s) => s === "queued" || s === "processing"))
    newStatus = "queued";
  else if (statuses.some((s) => s === "scheduled")) newStatus = "scheduled";
  else if (statuses.some((s) => s === "sent")) newStatus = "sent";

  await sb.from("mails").update({ status: newStatus }).eq("id", mailId);

  // 一覧に戻す
  return NextResponse.redirect(new URL("/mails/schedules", req.url), 303);
}

export async function GET() {
  return NextResponse.json(
    { ok: false, error: "method not allowed" },
    { status: 405 }
  );
}
