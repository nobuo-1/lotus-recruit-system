// web/src/app/api/mails/send/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { emailQueue } from "@/server/queue";
import type { DirectEmailJob } from "@/server/queue";

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

// プレーンテキスト → 軽量HTML（1行目太字）
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

    // メール本体（from_email は参照しない）
    const { data: mail, error: me } = await sb
      .from("mails")
      .select("id, tenant_id, subject, body_text")
      .eq("id", mailId)
      .maybeSingle();
    if (me) {
      return NextResponse.json({ error: me.message }, { status: 500 });
    }
    if (!mail) {
      return NextResponse.json({ error: "mail not found" }, { status: 404 });
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

    // 既登録（scheduled/queued/sent）は除外
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

    // 予約 or 即時
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

    // mail_deliveries へ upsert（scheduled_at が無いDBでも自動フォールバック）
    const rows = targets.map((r: any) => ({
      mail_id: mailId,
      recipient_id: r.id,
      status: scheduledISO ? ("scheduled" as const) : ("queued" as const),
      scheduled_at: scheduledISO ?? null,
      sent_at: null,
    }));

    const tryWithSched = await sb
      .from("mail_deliveries")
      .upsert(rows, { onConflict: "mail_id,recipient_id" })
      .select("id, recipient_id");
    if (tryWithSched.error) {
      if (/scheduled_at/i.test(tryWithSched.error.message || "")) {
        const rowsNoSched = rows.map(({ scheduled_at, ...rest }) => rest);
        const tryNoSched = await sb
          .from("mail_deliveries")
          .upsert(rowsNoSched as any[], {
            onConflict: "mail_id,recipient_id",
          })
          .select("id, recipient_id");
        if (tryNoSched.error) {
          return NextResponse.json(
            { error: tryNoSched.error.message },
            { status: 500 }
          );
        }
      } else {
        return NextResponse.json(
          { error: tryWithSched.error.message },
          { status: 500 }
        );
      }
    }

    // キューへ投入（キャンペーンと同じ DirectEmailJob）
    const subjectRaw = String((mail as any).subject ?? "");
    const textRaw = String((mail as any).body_text ?? "");

    let queued = 0;
    for (const r of targets as any[]) {
      const html = buildLightHtmlFromPlainText(
        personalize(textRaw, { name: r.name, email: r.email }, htmlEscape)
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
        // fromOverride は未指定 → ワーカー既定値を使用
      };

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
