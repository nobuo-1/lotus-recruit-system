// web/src/app/api/campaigns/schedules/cancel/route.ts
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
      /* noop */
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

  // 該当 email_schedules を取得（campaign_id）
  const { data: sched, error: se } = await sb
    .from("email_schedules")
    .select("id, campaign_id")
    .eq("id", id)
    .maybeSingle();
  if (se)
    return NextResponse.json({ ok: false, error: se.message }, { status: 500 });

  if (!sched) {
    // 既に消えている場合も一覧へ
    return NextResponse.redirect(new URL("/email/schedules", req.url), 303);
  }

  const campaignId = String((sched as any).campaign_id);

  // 1) email_schedules から削除
  const { error: delSchedErr } = await sb
    .from("email_schedules")
    .delete()
    .eq("id", id);
  if (delSchedErr)
    return NextResponse.json(
      { ok: false, error: delSchedErr.message },
      { status: 500 }
    );

  // 2) deliveries（未送信ぶん）を削除
  const { error: delDelErr } = await sb
    .from("deliveries")
    .delete()
    .eq("campaign_id", campaignId)
    .in("status", ["scheduled", "queued"]);
  if (delDelErr)
    return NextResponse.json(
      { ok: false, error: delDelErr.message },
      { status: 500 }
    );

  // 3) campaigns.status の見直し
  const { data: remain } = await sb
    .from("deliveries")
    .select("status")
    .eq("campaign_id", campaignId);
  const statuses = (remain ?? []).map((r: any) =>
    String(r.status || "").toLowerCase()
  );
  let newStatus = "draft";
  if (statuses.some((s) => s === "queued" || s === "processing"))
    newStatus = "queued";
  else if (statuses.some((s) => s === "scheduled")) newStatus = "scheduled";
  else if (statuses.some((s) => s === "sent")) newStatus = "sent";

  await sb.from("campaigns").update({ status: newStatus }).eq("id", campaignId);

  // 一覧に戻す
  return NextResponse.redirect(new URL("/email/schedules", req.url), 303);
}

export async function GET() {
  return NextResponse.json(
    { ok: false, error: "method not allowed" },
    { status: 405 }
  );
}
