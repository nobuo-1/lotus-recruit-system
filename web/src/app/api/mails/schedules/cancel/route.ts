// web/src/app/api/mails/schedules/cancel/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

async function readId(req: Request) {
  const ct = req.headers.get("content-type") || "";
  if (
    ct.includes("application/x-www-form-urlencoded") ||
    ct.includes("multipart/form-data")
  ) {
    const fd = await req.formData();
    return String(fd.get("id") || fd.get("scheduleId") || "");
  }
  const j = await req.json().catch(() => ({} as any));
  return String(j.id || j.scheduleId || "");
}

export async function POST(req: Request) {
  const sb = await supabaseServer();
  const { data: u } = await sb.auth.getUser();
  if (!u?.user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const scheduleId = await readId(req);
  if (!scheduleId)
    return NextResponse.json({ error: "scheduleId required" }, { status: 400 });

  const { data: prof } = await sb
    .from("profiles")
    .select("tenant_id")
    .eq("id", u.user.id)
    .maybeSingle();
  const tenantId = (prof?.tenant_id as string | undefined) ?? undefined;

  // 対象スケジュール取得
  const { data: sch, error: e1 } = await sb
    .from("mail_schedules")
    .select("id, mail_id, status, schedule_at, tenant_id")
    .eq("id", scheduleId)
    .maybeSingle();
  if (e1 || !sch)
    return NextResponse.json({ error: "not found" }, { status: 404 });
  if (tenantId && sch.tenant_id && sch.tenant_id !== tenantId) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const mailId = String(sch.mail_id);

  // 1) mail_schedules 削除
  await sb.from("mail_schedules").delete().eq("id", scheduleId);

  // 2) mail_deliveries の未送信系も削除
  await sb
    .from("mail_deliveries")
    .delete()
    .eq("mail_id", mailId)
    .in("status", ["scheduled", "queued", "processing"]);

  // 3) mails.status 更新
  let newStatus = "draft";
  {
    const { count: futureCount } = await sb
      .from("mail_schedules")
      .select("id", { count: "exact", head: true })
      .eq("mail_id", mailId)
      .eq("status", "scheduled");
    if ((futureCount ?? 0) > 0) newStatus = "scheduled";

    const { count: queuedCount } = await sb
      .from("mail_deliveries")
      .select("id", { count: "exact", head: true })
      .eq("mail_id", mailId)
      .in("status", ["queued", "processing"]);
    if ((queuedCount ?? 0) > 0) newStatus = "queued";

    const { count: sentCount } = await sb
      .from("mail_deliveries")
      .select("id", { count: "exact", head: true })
      .eq("mail_id", mailId)
      .eq("status", "sent");
    if ((sentCount ?? 0) > 0 && newStatus === "draft") newStatus = "sent";
  }
  await sb.from("mails").update({ status: newStatus }).eq("id", mailId);

  return NextResponse.redirect(new URL("/mails/schedules?ok=1", req.url), 303);
}

export async function GET(req: Request) {
  return NextResponse.redirect(new URL("/mails/schedules", req.url), 303);
}
