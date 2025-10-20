// web/src/app/api/mails/send/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { emailQueue } from "@/server/queue";

type Body = {
  mailId?: string;
  recipientIds?: string[];
  scheduleAt?: string | null;
};

async function safeJson<T = any>(req: Request): Promise<T | {}> {
  try {
    if (!req.headers.get("content-length")) return {};
    return (await req.json()) as T;
  } catch {
    return {};
  }
}

function chunk<T>(arr: T[], size: number): T[][] {
  const a = [...arr];
  const out: T[][] = [];
  while (a.length) out.push(a.splice(0, size));
  return out;
}

// 変数差し込み（{{NAME}}, {{EMAIL}}）— テキスト版のみ
function personalize(
  input: string,
  vars: { name?: string | null; email?: string | null }
) {
  const name = (vars.name ?? "").trim() || "ご担当者";
  const email = (vars.email ?? "").trim();
  return String(input ?? "")
    .replaceAll(/\{\{\s*NAME\s*\}\}/g, name)
    .replaceAll(/\{\{\s*EMAIL\s*\}\}/g, email);
}

/** CORS（必要なら） */
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

export async function POST(req: Request) {
  try {
    const body = (await safeJson<Body>(req)) as Body;
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
    const { data: u } = await sb.auth.getUser();
    if (!u?.user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    // テナント
    const { data: prof } = await sb
      .from("profiles")
      .select("tenant_id")
      .eq("id", u.user.id)
      .maybeSingle();
    const tenantId = (prof?.tenant_id as string | undefined) ?? undefined;
    if (!tenantId) {
      return NextResponse.json({ error: "no tenant" }, { status: 400 });
    }

    // メール本体：プレーンテキストのみ使用（デザイン無し）
    const { data: mail, error: me } = await sb
      .from("mails")
      .select("id, tenant_id, subject, body_text")
      .eq("id", mailId)
      .maybeSingle();
    if (me) return NextResponse.json({ error: me.message }, { status: 500 });
    if (!mail)
      return NextResponse.json({ error: "not found" }, { status: 404 });
    if ((mail as any).tenant_id && (mail as any).tenant_id !== tenantId) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const subjectRaw = String((mail as any).subject ?? "");
    const textRaw = String((mail as any).body_text ?? "");

    // 宛先（opt-out/非アクティブ除外）
    const { data: recs, error: re } = await sb
      .from("recipients")
      .select("id, name, email, is_active, consent, unsubscribe_token")
      .in("id", recipientIds)
      .eq("tenant_id", tenantId);
    if (re) return NextResponse.json({ error: re.message }, { status: 500 });

    const candidates = (recs ?? []).filter(
      (r: any) => r?.email && (r?.is_active ?? true) && r?.consent !== "opt_out"
    );
    if (candidates.length === 0) {
      return NextResponse.json({ error: "no recipients" }, { status: 400 });
    }

    // 既に登録済（scheduled/queued/sent）は除外
    const { data: already } = await sb
      .from("mail_deliveries")
      .select("recipient_id")
      .eq("mail_id", mailId)
      .in("status", ["scheduled", "queued", "sent"]);
    const exclude = new Set((already ?? []).map((d: any) => d.recipient_id));
    const targets = candidates.filter((r: any) => !exclude.has(r.id));
    if (targets.length === 0) {
      return NextResponse.json({
        ok: true,
        queued: 0,
        skipped: recipientIds.length,
      });
    }

    // 予約 or 即時
    let delayMs = 0;
    let scheduled = false;
    if (scheduleAtISO) {
      const ts = Date.parse(scheduleAtISO);
      if (Number.isNaN(ts)) {
        return NextResponse.json(
          { error: "scheduleAt が不正です" },
          { status: 400 }
        );
      }
      delayMs = Math.max(0, ts - Date.now());
      scheduled = delayMs > 0;
    }

    // --- ここがポイント ---
    // 重複は事前除外しているので、DBは通常の INSERT でOK（ON CONFLICTは使わない）
    // ※ スキーマに scheduled_at/sent_at が無くても動くよう、必須列だけ入れる
    const rows = targets.map((r: any) => ({
      mail_id: mailId,
      recipient_id: r.id,
      status: scheduled ? "scheduled" : "queued",
    }));
    for (const part of chunk(rows, 500)) {
      const ins = await sb.from("mail_deliveries").insert(part);
      if (ins.error) {
        return NextResponse.json({ error: ins.error.message }, { status: 500 });
      }
    }

    // キュー投入（テキストのみ / デザイン無し）
    let queued = 0;
    for (const r of targets as any[]) {
      const text = personalize(textRaw, { name: r.name, email: r.email });
      const subject = personalize(subjectRaw, {
        name: r.name,
        email: r.email,
      });

      const job /* : DirectEmailJob */ = {
        kind: "direct_email",
        to: String(r.email),
        subject,
        // ← HTMLは付けない（デザイン無し）
        text,
        tenantId,
        unsubscribeToken: (r as any).unsubscribe_token ?? undefined,
        // fromOverride / brand 情報も付けない（シンプル送信）
      } as any;

      await emailQueue.add("direct_email", job, {
        jobId: `mail:${mailId}:rcpt:${r.id}:${Date.now()}`,
        delay: delayMs,
        removeOnComplete: 1000,
        removeOnFail: 1000,
      });
      queued++;
    }

    // 見た目用にステータス更新
    await sb
      .from("mails")
      .update({ status: scheduled ? "scheduled" : "queued" })
      .eq("id", mailId);

    return NextResponse.json({
      ok: true,
      queued,
      scheduled_at: scheduled ? scheduleAtISO : null,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "server error" },
      { status: 500 }
    );
  }
}
