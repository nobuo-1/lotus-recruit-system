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
  scheduleAt?: string | null;
};

type MailRow = {
  id: string;
  tenant_id: string;
  subject: string | null;
  body_text: string | null;
  status: string | null;
};

type RcptRow = {
  id: string;
  name: string | null;
  email: string | null;
  unsubscribed_at: string | null;
  unsubscribe_token: string | null;
  is_active: boolean | null;
};

function chunk<T>(arr: T[], size: number): T[][] {
  const a = [...arr];
  const out: T[][] = [];
  while (a.length) out.push(a.splice(0, size));
  return out;
}

function personalize(
  input: string,
  vars: { name?: string | null; email?: string | null }
) {
  const name = (vars.name ?? "").trim() || "ご担当者";
  const email = (vars.email ?? "").trim();
  return input
    .replaceAll(/\{\{\s*NAME\s*\}\}/g, name)
    .replaceAll(/\{\{\s*EMAIL\s*\}\}/g, email);
}

function buildPlainText(
  base: string,
  opts: {
    brandCompany?: string;
    brandAddress?: string;
    brandSupport?: string;
    unsubscribeUrl?: string | null;
    deliveryId?: string;
  }
) {
  const footer = [
    "",
    "",
    "――――",
    `${opts.brandCompany || "弊社"} からのご案内`,
    opts.brandAddress ? `所在地：${opts.brandAddress}` : "",
    opts.brandSupport ? `お問い合わせ：${opts.brandSupport}` : "",
    opts.unsubscribeUrl ? `配信停止：${opts.unsubscribeUrl}` : "",
    opts.deliveryId ? `配信ID：${opts.deliveryId}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  return `${base}${footer}`;
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

    // 認証 & テナント
    const sb = await supabaseServer();
    const { data: u } = await sb.auth.getUser();
    if (!u?.user)
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const { data: prof } = await sb
      .from("profiles")
      .select("tenant_id")
      .eq("id", u.user.id)
      .maybeSingle();
    const tenantId = (prof?.tenant_id as string | undefined) ?? undefined;
    if (!tenantId)
      return NextResponse.json({ error: "no tenant" }, { status: 400 });

    // 送信設定（ユーザー/テナントのメール用設定）
    const cfg = await loadSenderConfig();

    // メール本体（※ from_email は参照しない）
    const { data: mail, error: me } = await sb
      .from("mails")
      .select("id, tenant_id, subject, body_text, status")
      .eq("id", mailId)
      .maybeSingle<MailRow>();
    if (me) return NextResponse.json({ error: me.message }, { status: 400 });
    if (!mail || mail.tenant_id !== tenantId)
      return NextResponse.json({ error: "not found" }, { status: 404 });

    const subjectRaw = String(mail.subject ?? "");
    const textRaw = String(mail.body_text ?? "");

    // 宛先（配信停止/非アクティブ除外）
    const { data: rcpts, error: re } = await sb
      .from("recipients")
      .select("id, name, email, unsubscribed_at, unsubscribe_token, is_active")
      .in("id", recipientIds)
      .eq("tenant_id", tenantId);
    if (re) return NextResponse.json({ error: re.message }, { status: 400 });

    const candidates = (rcpts ?? []).filter(
      (r) => r.email && !r.unsubscribed_at && (r.is_active ?? true)
    ) as RcptRow[];
    if (candidates.length === 0) {
      return NextResponse.json({ error: "no recipients" }, { status: 400 });
    }

    // 既存の送信記録を除外（重複INSERTを避ける）※ upsert はユニーク制約が無いとエラーになるため
    const { data: existing } = await sb
      .from("mail_deliveries")
      .select("recipient_id")
      .eq("mail_id", mailId)
      .in("status", ["scheduled", "queued", "sent"]);
    const already = new Set((existing ?? []).map((d: any) => d.recipient_id));
    const targets = candidates.filter((r) => !already.has(r.id));
    if (targets.length === 0) {
      return NextResponse.json({
        ok: true,
        queued: 0,
        skipped: candidates.length,
      });
    }

    // 予約時刻 → delay
    const now = Date.now();
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
      delay = Math.max(0, ts - now);
      scheduleAt = new Date(ts).toISOString();
    }

    // DB: mail_deliveries へ記録
    if (scheduleAt) {
      for (const part of chunk(
        targets.map((r) => ({
          tenant_id: tenantId,
          mail_id: mailId,
          recipient_id: r.id,
          status: "scheduled" as const,
          queued_at: null,
          scheduled_at: scheduleAt,
          sent_at: null,
        })),
        500
      )) {
        await sb.from("mail_deliveries").insert(part);
      }
      // 表示用：メール予約リスト
      await sb.from("mail_schedules").insert({
        tenant_id: tenantId,
        mail_id: mailId,
        scheduled_at: scheduleAt,
        status: "scheduled",
      });
      await sb.from("mails").update({ status: "scheduled" }).eq("id", mailId);
    } else {
      const nowIso = new Date().toISOString();
      for (const part of chunk(
        targets.map((r) => ({
          tenant_id: tenantId,
          mail_id: mailId,
          recipient_id: r.id,
          status: "queued" as const,
          queued_at: nowIso,
          scheduled_at: null,
          sent_at: null,
        })),
        500
      )) {
        await sb.from("mail_deliveries").insert(part);
      }
      await sb.from("mails").update({ status: "queued" }).eq("id", mailId);
    }

    // 直近で採番された delivery id を控える（置換/フッターに使用）
    const { data: dels, error: de } = await sb
      .from("mail_deliveries")
      .select("id, recipient_id")
      .eq("tenant_id", tenantId)
      .eq("mail_id", mailId)
      .in(
        "recipient_id",
        targets.map((t) => t.id)
      );
    if (de) return NextResponse.json({ error: de.message }, { status: 400 });

    const idMap = new Map<string, string>();
    (dels ?? []).forEach((d: any) =>
      idMap.set(String(d.recipient_id), String(d.id))
    );

    // キュー投入（完全プレーン：text のみ。HTMLは付与しない）
    let queued = 0;
    const appUrl = (process.env.APP_URL || "http://localhost:3000").replace(
      /\/+$/,
      ""
    );

    for (const r of targets) {
      const deliveryId = idMap.get(r.id) ?? "";
      const unsubUrl = r.unsubscribe_token
        ? `${appUrl}/api/unsubscribe?token=${encodeURIComponent(
            r.unsubscribe_token
          )}`
        : null;

      const subj = personalize(subjectRaw, { name: r.name, email: r.email });
      const body = personalize(textRaw, { name: r.name, email: r.email });
      const textFinal = buildPlainText(body, {
        brandCompany: cfg.brandCompany,
        brandAddress: cfg.brandAddress,
        brandSupport: cfg.brandSupport,
        unsubscribeUrl: unsubUrl,
        deliveryId,
      });

      await emailQueue.add(
        `mail:${mailId}:rcpt:${r.id}:${Date.now()}`,
        {
          kind: "direct_email",
          to: String(r.email),
          subject: subj,
          html: undefined, // ← デザイン無し（完全プレーン）
          text: textFinal,
          tenantId,
          unsubscribeToken: r.unsubscribe_token ?? undefined,
          fromOverride: cfg.fromOverride,
          brandCompany: cfg.brandCompany,
          brandAddress: cfg.brandAddress,
          brandSupport: cfg.brandSupport,
          deliveryId,
        },
        {
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
