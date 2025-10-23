// web/src/app/api/mails/send/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { emailQueue } from "@/server/queue";
import { loadSenderConfig } from "@/server/senderConfig";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type Payload = {
  mailId: string;
  recipientIds: string[];
  scheduleAt?: string | null; // ISO
};

const appUrl = (process.env.APP_URL || "http://localhost:3000").replace(
  /\/+$/,
  ""
);

function chunk<T>(arr: T[], size: number): T[][] {
  const a = [...arr];
  const out: T[][] = [];
  while (a.length) out.push(a.splice(0, size));
  return out;
}
function toS(v: unknown) {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}
function replaceVars(
  input: string,
  vars: { NAME?: string; EMAIL?: string }
): string {
  const name = (vars.NAME ?? "").trim() || "ご担当者";
  const email = (vars.EMAIL ?? "").trim();
  return input
    .replaceAll(/\{\{\s*NAME\s*\}\}/g, name)
    .replaceAll(/\{\{\s*EMAIL\s*\}\}/g, email);
}
function esc(s: string) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
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
export async function GET() {
  return NextResponse.json({ error: "method not allowed" }, { status: 405 });
}
export async function HEAD() {
  return new NextResponse(null, { status: 405 });
}

export async function POST(req: Request) {
  try {
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

    const sb = await supabaseServer();

    // 認証
    const { data: u } = await sb.auth.getUser();
    if (!u?.user)
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    // テナント取得
    const { data: prof } = await sb
      .from("profiles")
      .select("tenant_id")
      .eq("id", u.user.id)
      .maybeSingle();
    const tenantId = (prof?.tenant_id as string | undefined) ?? undefined;

    // メール本体（プレーン）
    const { data: mail, error: me } = await sb
      .from("mails")
      .select("id, tenant_id, subject, body_text, status")
      .eq("id", mailId)
      .maybeSingle();

    if (me) return NextResponse.json({ error: me.message }, { status: 400 });
    if (!mail)
      return NextResponse.json({ error: "not found" }, { status: 404 });
    if (
      tenantId &&
      (mail as any).tenant_id &&
      (mail as any).tenant_id !== tenantId
    ) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    // 送信元/ブランド設定
    const cfg = await loadSenderConfig();

    // 宛先
    const { data: recs, error: re } = await sb
      .from("recipients")
      .select("id, name, email, unsubscribe_token, unsubscribed_at, is_active")
      .in("id", recipientIds);
    if (re) return NextResponse.json({ error: re.message }, { status: 400 });

    const recipients = (recs ?? []).filter(
      (r: any) => r?.email && !r?.unsubscribed_at && (r?.is_active ?? true)
    );
    if (recipients.length === 0) {
      return NextResponse.json({ error: "no recipients" }, { status: 400 });
    }

    // 既存 delivery を除外
    const { data: existing } = await sb
      .from("mail_deliveries")
      .select("recipient_id")
      .eq("mail_id", mailId);

    const existed = new Set<string>(
      (existing ?? []).map((r: any) => String(r.recipient_id))
    );
    const targets = recipients.filter((r: any) => !existed.has(String(r.id)));
    if (targets.length === 0) {
      return NextResponse.json({
        ok: true,
        queued: 0,
        skipped: recipients.length,
      });
    }

    // 添付の署名URLを生成（全受信者共通）
    const admin = supabaseAdmin();
    const { data: atts } = await admin
      .from("mail_attachments")
      .select("id, file_path, file_name, mime_type")
      .eq("mail_id", mailId);

    let attachList: Array<{ path: string; name: string; mime?: string }> = [];
    if (atts && atts.length) {
      for (const a of atts) {
        const path = String(a.file_path);
        const filename = String(a.file_name || path.split("/").pop() || "file");
        const mime = a.mime_type || undefined;
        const { data: signed, error: se } = await admin.storage
          .from("email_attachments")
          .createSignedUrl(path, 60 * 60 * 24);
        if (!se && signed?.signedUrl) {
          attachList.push({ path: signed.signedUrl, name: filename, mime });
        }
      }
    }

    // 予約 or 即時
    let delay = 0;
    let scheduleAt: string | null = null;
    if (scheduleAtISO) {
      const ts = Date.parse(scheduleAtISO);
      if (Number.isNaN(ts)) {
        return NextResponse.json(
          { error: "scheduleAt が不正です" },
          { status: 400 }
        );
      }
      delay = Math.max(0, ts - Date.now());
      scheduleAt = new Date(ts).toISOString();
    }

    // deliveries 事前登録 + 予約テーブル
    let rowsForQueue: Array<{ recipientId: string; deliveryId?: string }> = [];
    if (scheduleAt) {
      // scheduled で登録
      for (const part of chunk(
        targets.map((r: any) => ({
          mail_id: mailId,
          recipient_id: r.id,
          status: "scheduled" as const,
          sent_at: null,
          error: null,
        })),
        500
      )) {
        const { data: ins, error } = await sb
          .from("mail_deliveries")
          .insert(part)
          .select("recipient_id")
          .returns<{ recipient_id: string }[]>();
        if (error)
          return NextResponse.json({ error: error.message }, { status: 400 });
        rowsForQueue.push(
          ...((ins ?? []).map((d) => ({ recipientId: d.recipient_id })) as any)
        );
      }
      // 予約テーブルに登録（uuid[]）
      {
        const { error } = await sb.from("mail_schedules").insert({
          tenant_id: tenantId ?? null,
          mail_id: mailId,
          schedule_at: scheduleAt,
          status: "scheduled",
          recipient_ids: targets.map((t: any) => t.id),
        });
        if (error)
          return NextResponse.json({ error: error.message }, { status: 400 });
      }
      await sb.from("mails").update({ status: "scheduled" }).eq("id", mailId);
    } else {
      // queued で登録
      for (const part of chunk(
        targets.map((r: any) => ({
          mail_id: mailId,
          recipient_id: r.id,
          status: "queued" as const,
          sent_at: null,
          error: null,
        })),
        500
      )) {
        const { data: ins, error } = await sb
          .from("mail_deliveries")
          .insert(part)
          .select("recipient_id")
          .returns<{ recipient_id: string }[]>();
        if (error)
          return NextResponse.json({ error: error.message }, { status: 400 });
        rowsForQueue.push(
          ...((ins ?? []).map((d) => ({ recipientId: d.recipient_id })) as any)
        );
      }
      await sb.from("mails").update({ status: "queued" }).eq("id", mailId);
    }

    // 件名/本文（プレーンテキスト、{{NAME}}/{{EMAIL}} 差し込み）
    const subjectRaw = toS((mail as any).subject);
    const bodyTextRaw = toS((mail as any).body_text);

    // CC（差出人設定）
    const ccEmail = cfg.fromOverride || undefined;

    let queued = 0;
    for (const r of targets as any[]) {
      const subject = replaceVars(subjectRaw, {
        NAME: r.name ?? "",
        EMAIL: r.email ?? "",
      });
      const main = replaceVars(bodyTextRaw, {
        NAME: r.name ?? "",
        EMAIL: r.email ?? "",
      });

      const unsubUrl = r.unsubscribe_token
        ? `${appUrl}/api/unsubscribe?token=${encodeURIComponent(
            r.unsubscribe_token
          )}`
        : "";

      // ===== フッター（シンプル版 / 送信者・所在地・連絡先・配信停止） =====
      const textLines = [
        cfg.brandCompany ? `送信者：${cfg.brandCompany}` : "",
        cfg.brandAddress ? `所在地：${cfg.brandAddress}` : "",
        cfg.brandSupport ? `連絡先：${cfg.brandSupport}` : "",
        unsubUrl ? `配信停止：${unsubUrl}` : "",
      ].filter(Boolean);

      const text = [main, "", ...textLines].join("\n").trim();

      // HTML は最小限（装飾/色なし、「こちら」リンクのみ）
      const htmlMain = esc(main).replace(/\n/g, "<br />");
      const htmlFooter =
        [
          cfg.brandCompany ? `送信者：${esc(cfg.brandCompany)}` : "",
          cfg.brandAddress ? `所在地：${esc(cfg.brandAddress)}` : "",
          cfg.brandSupport
            ? `連絡先：<a href="mailto:${esc(cfg.brandSupport)}">${esc(
                cfg.brandSupport
              )}</a>`
            : "",
          unsubUrl
            ? `配信停止は <a href="${unsubUrl}" target="_blank">こちら</a>`
            : "",
        ]
          .filter(Boolean)
          .map((l) => `<div>${l}</div>`)
          .join("") || "";

      const html = `${htmlMain}${
        htmlFooter ? `<div style="margin-top:12px;">${htmlFooter}</div>` : ""
      }`;

      // キュー投入（ワーカー側でキャンセル済みチェック有り）
      const jobId = `mail:${mailId}:rcpt:${r.id}:${Date.now()}`;
      await emailQueue.add(
        "direct_email",
        {
          kind: "direct_email",
          to: String(r.email),
          subject,
          text, // プレーン：装飾なし
          html, // 最小限
          cc: ccEmail,
          tenantId: tenantId ?? undefined,
          unsubscribeToken: (r as any).unsubscribe_token ?? undefined,
          fromOverride: cfg.fromOverride,
          brandCompany: cfg.brandCompany,
          brandAddress: cfg.brandAddress,
          brandSupport: cfg.brandSupport,
          attachments: attachList, // 署名URL
          // プレーンメールの配信ガード用（ワーカー→メーラーにも渡る）
          mailDeliveryId: (rowsForQueue.find((x) => x.recipientId === r.id)
            ?.deliveryId || "") as any,
        } as any,
        {
          jobId,
          delay,
          removeOnComplete: 1000,
          removeOnFail: 1000,
        }
      );

      queued++;
    }

    return NextResponse.json({
      ok: true,
      queued,
      scheduled: scheduleAt ?? null,
      redirectTo: scheduleAt ? "/mails/schedules" : "/mails",
    });
  } catch (e: any) {
    console.error("POST /api/mails/send error", e);
    return NextResponse.json(
      { error: e?.message || "server error" },
      { status: 500 }
    );
  }
}
