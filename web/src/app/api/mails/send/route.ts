// web/src/app/api/mails/send/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { emailQueue } from "@/server/queue";
import type { DirectEmailJob } from "@/server/queue";

/* ================= ユーティリティ ================= */
type Body = {
  mailId?: string;
  recipientIds?: string[];
  scheduleAt?: string | null;
};

function chunk<T>(arr: T[], size: number): T[][] {
  const a = [...arr];
  const out: T[][] = [];
  while (a.length) out.push(a.splice(0, size));
  return out;
}

const appUrl = (process.env.APP_URL || "http://localhost:3000").replace(
  /\/+$/,
  ""
);

function htmlEscape(s: string) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
function identity(s: string) {
  return String(s);
}
function personalize(
  input: string,
  vars: { name?: string | null; email?: string | null },
  encode: (s: string) => string
) {
  const name = (vars.name ?? "").trim() || "ご担当者";
  const email = (vars.email ?? "").trim();
  return input
    .replaceAll(/\{\{\s*NAME\s*\}\}/g, encode(name))
    .replaceAll(/\{\{\s*EMAIL\s*\}\}/g, encode(email));
}

/** 1行目だけ太字化した軽量HTMLをプレーンテキストから生成 */
function buildLightHtmlFromPlainText(raw: string) {
  const t = (raw ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (!t) return "";
  const idx = t.indexOf("\n");
  if (idx === -1) {
    return `<strong style="font-weight:700;color:#0b1220;">${htmlEscape(
      t
    )}</strong>`;
  }
  const first = t.slice(0, idx);
  const rest = t.slice(idx + 1);
  return `<strong style="font-weight:700;color:#0b1220;">${htmlEscape(
    first
  )}</strong><br />${htmlEscape(rest).replace(/\n/g, "<br />")}`;
}

/* “カード化”＋開封ピクセル。キャンペーンと同じ見た目に寄せる（簡略版） */
function wrapAsCard(html: string, deliveryId: string) {
  const pixel = `<img src="${appUrl}/api/email/open?id=${encodeURIComponent(
    deliveryId
  )}" alt="" width="1" height="1" style="display:block;max-width:1px;max-height:1px;border:0;outline:none;" />`;
  return `<table role="presentation" width="100%" bgcolor="#f3f4f6" style="background:#f3f4f6 !important;padding:16px 0;">
  <tr><td align="center" bgcolor="#f3f4f6" style="padding:0 12px;">
    <table role="presentation" width="100%" bgcolor="#ffffff" style="max-width:640px;border-radius:14px;background:#ffffff !important;box-shadow:0 4px 16px rgba(0,0,0,.08);border:1px solid #e5e7eb !important;">
      <tr><td bgcolor="#ffffff" style="padding:20px;font:16px/1.7 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111827 !important;">
        ${html}
        ${pixel}
      </td></tr>
    </table>
  </td></tr>
</table>`;
}

/** 安全JSON */
async function safeJson<T = any>(req: Request): Promise<T | {}> {
  try {
    if (!req.headers.get("content-length")) return {};
    return (await req.json()) as T;
  } catch {
    return {};
  }
}

/* ================= ハンドラ ================= */
export async function POST(req: Request) {
  try {
    const body = (await safeJson<Body>(req)) as Body;
    const mailId = String(body.mailId ?? "");
    const ids = Array.isArray(body.recipientIds) ? body.recipientIds : [];
    const scheduleAtISO = body.scheduleAt ?? null;

    if (!mailId || ids.length === 0) {
      return NextResponse.json(
        { error: "mailId と recipientIds は必須です" },
        { status: 400 }
      );
    }

    // RLSありのサーバークライアント
    const sb = await supabaseServer();

    // 認証 & テナント
    const { data: u } = await sb.auth.getUser();
    if (!u?.user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    const { data: prof } = await sb
      .from("profiles")
      .select("tenant_id")
      .eq("id", u.user.id)
      .maybeSingle();
    const tenantId = (prof?.tenant_id as string | undefined) ?? undefined;
    if (!tenantId) {
      return NextResponse.json({ error: "no tenant" }, { status: 400 });
    }

    // メール本体（body_textのみ使用）
    const { data: mail, error: me } = await sb
      .from("mails")
      .select("id, tenant_id, subject, body_text, from_email")
      .eq("id", mailId)
      .maybeSingle();
    if (me || !mail) {
      return NextResponse.json(
        { error: me?.message ?? "mail not found" },
        { status: 404 }
      );
    }
    if ((mail as any).tenant_id && (mail as any).tenant_id !== tenantId) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    // 宛先（opt-out/非アクティブ除外）
    const { data: recs, error: re } = await sb
      .from("recipients")
      .select("id, name, email, consent, is_active, unsubscribe_token")
      .in("id", ids)
      .eq("tenant_id", tenantId);
    if (re) {
      return NextResponse.json({ error: re.message }, { status: 500 });
    }
    const candidates = (recs ?? []).filter(
      (r: any) => r?.email && (r?.is_active ?? true) && r?.consent !== "opt_out"
    );
    if (candidates.length === 0) {
      return NextResponse.json({ error: "no recipients" }, { status: 400 });
    }

    // 二重送信防止：既に scheduled/queued/sent の宛先は除外
    const { data: already } = await sb
      .from("mail_deliveries")
      .select("recipient_id")
      .eq("mail_id", mailId)
      .in("status", ["scheduled", "queued", "sent"]);
    const exclude = new Set((already ?? []).map((d: any) => d.recipient_id));
    const targets = candidates.filter((r: any) => !exclude.has(r.id));
    if (targets.length === 0) {
      return NextResponse.json({ ok: true, queued: 0, skipped: ids.length });
    }

    // 予約/即時の判定
    let delayMs = 0;
    let scheduledISO: string | null = null;
    if (scheduleAtISO) {
      const ts = Date.parse(scheduleAtISO);
      if (Number.isNaN(ts)) {
        return NextResponse.json(
          { error: "scheduleAt が不正です" },
          { status: 400 }
        );
      }
      delayMs = Math.max(0, ts - Date.now());
      scheduledISO = new Date(ts).toISOString();
    }

    // mail_deliveries に記録（scheduled/queued）
    const baseRows = targets.map((r: any) => ({
      mail_id: mailId,
      recipient_id: r.id,
      status: scheduledISO ? ("scheduled" as const) : ("queued" as const),
      // scheduled_at 列が存在するDBなら入る。存在しない場合は後段のフォールバックで無しINSERT。
      scheduled_at: scheduledISO ?? null,
      sent_at: null,
    }));

    // scheduled_at の有無に耐えるフォールバックINSERT
    const tryInsert = async () => {
      const { error: e1 } = await sb.from("mail_deliveries").insert(baseRows);
      if (e1 && /scheduled_at/i.test(e1.message)) {
        const rowsNoSched = baseRows.map((r) => {
          const { scheduled_at, ...rest } = r;
          return rest;
        });
        const { error: e2 } = await sb
          .from("mail_deliveries")
          .insert(rowsNoSched);
        if (e2) throw e2;
      } else if (e1) {
        throw e1;
      }
    };
    await tryInsert();

    // ワーカーに投入（キャンペーンと同じDirectEmailJob）
    const subjectRaw = String((mail as any).subject ?? "");
    const textRaw = String((mail as any).body_text ?? "");
    const fromOverride =
      ((mail as any).from_email as string | null) ?? undefined;

    let queued = 0;
    for (const r of targets as any[]) {
      const deliveryId = ""; // （必要なら mail_deliveries.id をselectで取得して紐付け可能）

      // HTML版（プレーン→軽量HTML化＋1行目太字）
      const html = wrapAsCard(
        buildLightHtmlFromPlainText(
          personalize(textRaw, { name: r.name, email: r.email }, htmlEscape)
        ),
        deliveryId
      );

      const subject = personalize(
        subjectRaw,
        { name: r.name, email: r.email },
        identity
      );
      const text = personalize(
        textRaw,
        { name: r.name, email: r.email },
        identity
      );

      const job: DirectEmailJob = {
        kind: "direct_email",
        to: String(r.email),
        subject,
        html,
        text,
        tenantId,
        unsubscribeToken: (r as any).unsubscribe_token ?? undefined,
        fromOverride, // 未設定ならワーカーの既定を使用
      };

      await emailQueue.add("direct_email", job, {
        jobId: `mail:${mailId}:rcpt:${r.id}:${Date.now()}`,
        delay: delayMs,
        removeOnComplete: 1000,
        removeOnFail: 1000,
      });
      queued++;
    }

    // mails.status を見た目用に更新
    await sb
      .from("mails")
      .update({ status: scheduledISO ? "scheduled" : "queued" })
      .eq("id", mailId);

    return NextResponse.json({
      ok: true,
      queued,
      scheduled_at: scheduledISO ?? null,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "server error" },
      { status: 500 }
    );
  }
}
