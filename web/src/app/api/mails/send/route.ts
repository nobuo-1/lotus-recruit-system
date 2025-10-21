// web/src/app/api/mails/send/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { emailQueue, type DirectEmailJob } from "@/server/queue";
import { loadSenderConfig } from "@/server/senderConfig";

/* ============ 型 ============ */
type Payload = {
  mailId: string;
  recipientIds: string[];
  scheduleAt?: string | null; // ISO
};

type RecipientRow = {
  id: string;
  name: string | null;
  email: string | null;
  unsubscribed_at: string | null;
  unsubscribe_token: string | null;
};

function escapeHtml(s: string) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** プレーン本文 → 軽量HTML（行末 <br>、最初の1行だけ太字）*/
function toLightHtmlFromPlain(text: string) {
  const t = (text ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (!t.length) return "";
  const idx = t.indexOf("\n");
  if (idx === -1) {
    return `<strong style="font-weight:700;color:#0b1220;">${escapeHtml(
      t
    )}</strong>`;
  }
  const first = escapeHtml(t.slice(0, idx));
  const rest = escapeHtml(t.slice(idx + 1)).replace(/\n/g, "<br />");
  return `<strong style="font-weight:700;color:#0b1220;">${first}</strong><br />${rest}`;
}

export async function POST(req: Request) {
  try {
    const sb = await supabaseServer();

    // 認証
    const { data: u } = await sb.auth.getUser();
    if (!u?.user)
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    // 入力
    const body = (await req.json().catch(() => ({}))) as Partial<Payload>;
    const mailId = String(body.mailId ?? "");
    const recipientIds = Array.isArray(body.recipientIds)
      ? body.recipientIds
      : [];
    const scheduleAtISO = body.scheduleAt ?? null;

    if (!mailId || recipientIds.length === 0) {
      return NextResponse.json(
        { error: "mailId と recipientIds は必須です" },
        { status: 400 }
      );
    }

    // テナント取得
    const { data: prof } = await sb
      .from("profiles")
      .select("tenant_id")
      .eq("id", u.user.id)
      .maybeSingle();
    const tenantId = (prof?.tenant_id as string | undefined) ?? undefined;
    if (!tenantId)
      return NextResponse.json({ error: "no tenant" }, { status: 400 });

    // メール本体（プレーン）
    const { data: mail, error: me } = await sb
      .from("mails")
      .select("id, tenant_id, subject, body_text, status")
      .eq("id", mailId)
      .maybeSingle();
    if (me) return NextResponse.json({ error: me.message }, { status: 400 });
    if (!mail || (mail as any).tenant_id !== tenantId) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }

    const subject = String((mail as any).subject ?? "");
    const plain = String((mail as any).body_text ?? "");
    const html = toLightHtmlFromPlain(plain);

    // 送信者/ブランド設定（/email/settings）
    const cfg = await loadSenderConfig();

    // 宛先（配信停止者除外）
    const { data: recs, error: re } = await sb
      .from("recipients")
      .select("id, name, email, unsubscribed_at, unsubscribe_token")
      .in("id", recipientIds)
      .eq("tenant_id", tenantId);
    if (re) return NextResponse.json({ error: re.message }, { status: 400 });

    const candidates = (recs ?? [])
      .map((r) => r as RecipientRow)
      .filter((r) => !!r.email && !r.unsubscribed_at);
    if (candidates.length === 0) {
      return NextResponse.json({ error: "no recipients" }, { status: 400 });
    }

    // 既送信/予約済を除外（Unique制約が無くても重複しないように）
    const { data: already } = await sb
      .from("mail_deliveries")
      .select("recipient_id")
      .eq("mail_id", mailId)
      .in("status", ["scheduled", "queued", "sent"]);
    const exclude = new Set(
      (already ?? []).map((d: any) => String(d.recipient_id))
    );
    const targets = candidates.filter((r) => !exclude.has(String(r.id)));
    if (targets.length === 0) {
      return NextResponse.json({
        ok: true,
        queued: 0,
        skipped: candidates.length,
      });
    }

    // 予約時間 → delay算出
    let delay = 0;
    let scheduledISO: string | null = null;
    if (scheduleAtISO) {
      const ts = Date.parse(scheduleAtISO);
      if (!Number.isFinite(ts)) {
        return NextResponse.json(
          { error: "scheduleAt が不正です" },
          { status: 400 }
        );
      }
      delay = Math.max(0, ts - Date.now());
      scheduledISO = new Date(ts).toISOString();
    }

    // mail_deliveries へ登録
    if (scheduledISO) {
      const rows = targets.map((t) => ({
        tenant_id: tenantId,
        mail_id: mailId,
        recipient_id: t.id,
        status: "scheduled" as const,
        scheduled_at: scheduledISO,
      }));
      // Unique制約が無い想定なので insert のみ
      await sb.from("mail_deliveries").insert(rows);

      // mail_schedules に1行（一覧表示用）
      // 二重登録を避ける簡易策：同じ mailId x scheduled_at が無い場合のみ作成
      const { data: exists } = await sb
        .from("mail_schedules")
        .select("id")
        .eq("mail_id", mailId)
        .eq("scheduled_at", scheduledISO)
        .maybeSingle();
      if (!exists) {
        await sb.from("mail_schedules").insert({
          tenant_id: tenantId,
          mail_id: mailId,
          scheduled_at: scheduledISO,
          status: "scheduled",
        });
      }

      await sb.from("mails").update({ status: "scheduled" }).eq("id", mailId);
    } else {
      const rows = targets.map((t) => ({
        tenant_id: tenantId,
        mail_id: mailId,
        recipient_id: t.id,
        status: "queued" as const,
        scheduled_at: null as any,
      }));
      await sb.from("mail_deliveries").insert(rows);
      await sb.from("mails").update({ status: "queued" }).eq("id", mailId);
    }

    // 実際の送信ジョブを投入
    let queued = 0;
    for (const r of targets) {
      const job: DirectEmailJob = {
        kind: "direct_email",
        to: r.email as string,
        subject,
        html, // プレーン→軽量HTML化したもの
        text: plain || undefined,
        tenantId,
        unsubscribeToken: r.unsubscribe_token ?? undefined,

        fromOverride: cfg.fromOverride,
        brandCompany: cfg.brandCompany,
        brandAddress: cfg.brandAddress,
        brandSupport: cfg.brandSupport,
      };

      await emailQueue.add("direct_email", job, {
        jobId: `mail:${mailId}:rcpt:${r.id}:${Date.now()}`,
        delay, // 予約時のみ > 0
        removeOnComplete: 1000,
        removeOnFail: 1000,
      });

      queued++;
    }

    return NextResponse.json({
      ok: true,
      queued,
      scheduled_at: scheduledISO ?? null,
    });
  } catch (e: any) {
    console.error("POST /api/mails/send error", e);
    return NextResponse.json(
      { error: e?.message || "server error" },
      { status: 500 }
    );
  }
}
