// web/src/app/api/mails/schedules/cancel/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { emailQueue } from "@/server/queue";

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

    // 予約レコードを取得
    const { data: sch, error: se } = await admin
      .from("mail_schedules")
      .select("id, mail_id, schedule_at, status")
      .eq("id", id)
      .maybeSingle();

    if (se) return NextResponse.json({ error: se.message }, { status: 400 });
    if (!sch) {
      return NextResponse.redirect(new URL("/mails/schedules", req.url), 303);
    }

    const mailId = String((sch as any).mail_id || "");

    // ---- 1) 未送信の deliveries を削除（これでDB的に送れなくなる）----
    if (mailId) {
      const { error: de } = await admin
        .from("mail_deliveries")
        .delete()
        .eq("mail_id", mailId)
        .is("sent_at", null);
      if (de) return NextResponse.json({ error: de.message }, { status: 400 });
    }

    // ---- 2) キューに積まれている該当ジョブを削除（物理的にワーカー実行も防止）----
    if (mailId) {
      const jobs = await emailQueue.getJobs(["delayed", "waiting", "paused"]);
      const prefix = `mail:${mailId}:`;
      await Promise.all(
        jobs
          .filter((j) => String(j.id || "").startsWith(prefix))
          .map((j) => emailQueue.remove(String(j.id)))
      );
    }

    // ---- 3) 予約レコード自体を削除 ----
    {
      const { error: re } = await admin
        .from("mail_schedules")
        .delete()
        .eq("id", id);
      if (re) return NextResponse.json({ error: re.message }, { status: 400 });
    }

    // ---- 4) mails.status を再計算 ----
    if (mailId) {
      const now = new Date().toISOString();

      const { data: restSch } = await admin
        .from("mail_schedules")
        .select("id, schedule_at, status")
        .eq("mail_id", mailId)
        .eq("status", "scheduled")
        .gt("schedule_at", now);

      const { data: restDeliv } = await admin
        .from("mail_deliveries")
        .select("id, status, sent_at")
        .eq("mail_id", mailId);

      let newStatus: "scheduled" | "queued" | "draft" = "draft";
      if ((restSch ?? []).length > 0) newStatus = "scheduled";
      else if ((restDeliv ?? []).some((d: any) => d.sent_at))
        newStatus = "queued";

      await admin.from("mails").update({ status: newStatus }).eq("id", mailId);
    }

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
