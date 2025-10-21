// web/src/app/api/mails/send/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
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

function personalize(
  raw: string,
  vars: { name?: string | null; email?: string | null }
) {
  const name = (vars.name ?? "").trim() || "ご担当者";
  const email = (vars.email ?? "").trim();
  return String(raw ?? "")
    .replace(/\{\{\s*NAME\s*\}\}/g, name)
    .replace(/\{\{\s*EMAIL\s*\}\}/g, email);
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
      .select("id, tenant_id, subject, body_text, from_email, status")
      .eq("id", mailId)
      .maybeSingle();
    if (me) return NextResponse.json({ error: me.message }, { status: 400 });
    if (!mail || (mail as any).tenant_id !== tenantId) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }

    const subjectRaw = String((mail as any).subject ?? "");
    const bodyTextRaw = String((mail as any).body_text ?? "");

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

    // 既送信/予約済を除外（scheduled/queued/sent は重複させない）
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

    // delay / 予約ISO
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

    // ---------- DB 書き込みは ServiceRole で確実に ----------
    const admin = supabaseAdmin();

    if (scheduledISO) {
      // mail_deliveries（予約）
      const rows = targets.map((t) => ({
        tenant_id: tenantId,
        mail_id: mailId,
        recipient_id: t.id,
        status: "scheduled" as const,
        scheduled_at: scheduledISO,
      }));
      await admin.from("mail_deliveries").insert(rows);

      // mail_schedules（一覧用）
      const { data: exists } = await admin
        .from("mail_schedules")
        .select("id")
        .eq("mail_id", mailId)
        .eq("scheduled_at", scheduledISO)
        .maybeSingle();
      if (!exists) {
        await admin.from("mail_schedules").insert({
          tenant_id: tenantId,
          mail_id: mailId,
          scheduled_at: scheduledISO,
          status: "scheduled",
        });
      }

      await admin
        .from("mails")
        .update({ status: "scheduled" })
        .eq("id", mailId);
    } else {
      // mail_deliveries（即時）
      const nowIso = new Date().toISOString();
      const rows = targets.map((t) => ({
        tenant_id: tenantId,
        mail_id: mailId,
        recipient_id: t.id,
        status: "queued" as const,
        queued_at: nowIso,
        scheduled_at: null as any,
      }));
      await admin.from("mail_deliveries").insert(rows);
      await admin.from("mails").update({ status: "queued" }).eq("id", mailId);
    }

    // 送信用のベース Footer（テキスト）
    // cfg.brandCompany 等が未登録でも空行を詰めるため filter(Boolean)
    const footerLines = [
      "――――――――――――――――――――",
      cfg.brandCompany || undefined,
      cfg.brandAddress || undefined,
      cfg.brandSupport ? `お問い合わせ: ${cfg.brandSupport}` : undefined,
      // 配信停止URLは受信者ごとに異なるので各ジョブで差し込む
    ].filter(Boolean) as string[];

    // 実送ジョブを投入（宛先ごとに件名/本文を個別化）
    let queued = 0;
    for (const r of targets) {
      const subject = personalize(subjectRaw, { name: r.name, email: r.email });
      const unsubUrl = r.unsubscribe_token
        ? `${(process.env.APP_URL || "http://localhost:3000").replace(
            /\/+$/,
            ""
          )}/api/unsubscribe?token=${encodeURIComponent(r.unsubscribe_token)}`
        : null;

      const bodyMain = personalize(bodyTextRaw, {
        name: r.name,
        email: r.email,
      });
      const footer = [
        "",
        "",
        ...footerLines,
        unsubUrl ? `配信停止: ${unsubUrl}` : "",
      ]
        .filter(Boolean)
        .join("\n");

      const text = `${bodyMain}${footer ? `\n${footer}` : ""}`;

      const job: DirectEmailJob = {
        kind: "direct_email",
        to: r.email as string,
        subject,
        // ★プレーンメールは完全プレーン：HTMLを付けない
        html: undefined as any,
        text,
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
