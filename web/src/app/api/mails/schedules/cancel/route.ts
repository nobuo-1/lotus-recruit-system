// web/src/app/api/mails/schedules/cancel/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(req: Request) {
  try {
    const admin = supabaseAdmin();

    // form でも JSON でも受ける
    let id = "";
    const ct = req.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      const j = await req.json().catch(() => ({} as any));
      id = String(j?.id ?? "");
    } else {
      const fd = await req.formData();
      id = String(fd.get("id") ?? "");
    }
    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }

    // 対象スケジュール取得（mail_id と recipient_ids が必要）
    const schRes = await admin
      .from("mail_schedules")
      .select("id, mail_id, recipient_ids, schedule_at")
      .eq("id", id)
      .maybeSingle();

    if (schRes.error || !schRes.data) {
      return NextResponse.json({ ok: false, removed: 0 });
    }

    const { mail_id, recipient_ids } = schRes.data as any;
    const ids: string[] = Array.isArray(recipient_ids) ? recipient_ids : [];

    // mail_deliveries の“未送信分（scheduled）”のみ削除
    if (ids.length > 0) {
      await admin
        .from("mail_deliveries")
        .delete()
        .eq("mail_id", mail_id)
        .eq("status", "scheduled")
        .in("recipient_id", ids);
    }

    // スケジュール自体を削除
    await admin.from("mail_schedules").delete().eq("id", id);

    // 状況に応じて mails.status 更新（残ってる scheduled があれば scheduled、送信実績あれば queued、どちらも無ければ draft）
    const scheduledLeft = await admin
      .from("mail_schedules")
      .select("id", { count: "exact", head: true })
      .eq("mail_id", mail_id);
    const sentExists = await admin
      .from("mail_deliveries")
      .select("id", { count: "exact", head: true })
      .eq("mail_id", mail_id)
      .eq("status", "sent");

    let newStatus = "draft";
    if ((scheduledLeft.count ?? 0) > 0) newStatus = "scheduled";
    else if ((sentExists.count ?? 0) > 0) newStatus = "queued";

    await admin.from("mails").update({ status: newStatus }).eq("id", mail_id);

    // リダイレクト（GET遷移でもPOST結果でもOK）
    return NextResponse.redirect(new URL("/mails/schedules", req.url), 303);
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "server error" },
      { status: 500 }
    );
  }
}

export async function GET() {
  // 直接開かれた時はエラー文言を返す
  return NextResponse.json({ error: "POST only" }, { status: 405 });
}
