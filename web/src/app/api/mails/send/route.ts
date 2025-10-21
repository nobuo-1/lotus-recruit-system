// web/src/app/api/mails/send/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { emailQueue } from "@/server/queue";
import { loadSenderConfig } from "@/server/senderConfig";

type Payload = {
  mailId: string;
  recipientIds: string[];
  scheduleAt?: string | null; // 予約ISO（mail_schedules は schedule_at カラム）
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

    // メール本体（プレーン：from_email は使わない）
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

    // 送信元/ブランド設定（user/tenant の email_settings → tenants → env フォールバック）
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

    // 既存 delivery を除外（mail_deliveries に tenant_id は無い）
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

    // deliveries へ事前登録
    if (scheduleAt) {
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
        const { error } = await sb.from("mail_deliveries").insert(part);
        if (error)
          return NextResponse.json({ error: error.message }, { status: 400 });
      }
      // 予約テーブル（← recipient_ids は “JS配列” をそのまま渡す）
      {
        const { error } = await sb.from("mail_schedules").insert({
          tenant_id: tenantId ?? null,
          mail_id: mailId,
          schedule_at: scheduleAt, // ← カラム名は schedule_at
          status: "scheduled",
          recipient_ids: targets.map((t: any) => t.id), // ★修正: 配列そのまま
        });
        if (error)
          return NextResponse.json({ error: error.message }, { status: 400 });
      }
      await sb.from("mails").update({ status: "scheduled" }).eq("id", mailId);
    } else {
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
        const { error } = await sb.from("mail_deliveries").insert(part);
        if (error)
          return NextResponse.json({ error: error.message }, { status: 400 });
      }
      await sb.from("mails").update({ status: "queued" }).eq("id", mailId);
    }

    // 件名/本文（プレーンテキスト、{{NAME}}/{{EMAIL}} 差し込み + 目に見えるフッター）
    const subjectRaw = toS((mail as any).subject);
    const bodyTextRaw = toS((mail as any).body_text);

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

      const brandName = cfg.brandCompany ?? "弊社";
      const headerLine = `このメールは ${brandName} から ${String(
        r.email
      )} 宛にお送りしています。`;
      const separator = "------------------------------";

      const unsubUrl = r.unsubscribe_token
        ? `${appUrl}/api/unsubscribe?token=${encodeURIComponent(
            r.unsubscribe_token
          )}`
        : "";

      const metaLines = [
        cfg.brandCompany ? `運営：${cfg.brandCompany}` : "",
        cfg.brandAddress ? `所在地：${cfg.brandAddress}` : "",
        cfg.brandSupport ? `連絡先：${cfg.brandSupport}` : "",
        unsubUrl ? `配信停止：${unsubUrl}` : "",
      ]
        .filter(Boolean)
        .join("\n");

      // ご指定：「このメールは〜」の後に空行と区切りを追加
      const footerBlock = [headerLine, "", separator, metaLines]
        .filter((s) => s !== "")
        .join("\n");

      const text = main ? `${main}\n\n${footerBlock}` : footerBlock;

      const jobId = `mail:${mailId}:rcpt:${r.id}:${Date.now()}`;
      await emailQueue.add(
        "direct_email",
        {
          kind: "direct_email",
          to: String(r.email),
          subject,
          text, // ← プレーンのみ
          html: "", // ← 型要件に合わせて空文字を渡す
          tenantId: tenantId ?? undefined,
          unsubscribeToken: (r as any).unsubscribe_token ?? undefined,
          fromOverride: cfg.fromOverride,
          brandCompany: cfg.brandCompany,
          brandAddress: cfg.brandAddress,
          brandSupport: cfg.brandSupport,
        },
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
    });
  } catch (e: any) {
    console.error("POST /api/mails/send error", e);
    return NextResponse.json(
      { error: e?.message || "server error" },
      { status: 500 }
    );
  }
}
