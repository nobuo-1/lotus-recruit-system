// web/src/app/api/mails/send/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { emailQueue } from "@/server/queue";

const appUrl = (process.env.APP_URL || "http://localhost:3000").replace(
  /\/+$/,
  ""
);

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

async function loadBrandForCurrentUser() {
  const sb = await supabaseServer();
  const { data: u } = await sb.auth.getUser();
  const user = u?.user;
  if (!user)
    return {
      tenantId: undefined as string | undefined,
      brand: {
        company: undefined as string | undefined,
        address: undefined as string | undefined,
        support: undefined as string | undefined,
        from: undefined as string | undefined,
      },
    };

  const { data: prof } = await sb
    .from("profiles")
    .select("tenant_id")
    .eq("id", user.id)
    .maybeSingle();
  const tenantId = (prof?.tenant_id as string | undefined) ?? undefined;

  let company: string | undefined,
    address: string | undefined,
    support: string | undefined,
    from: string | undefined;

  // 1) email_settings（user優先 → tenant）
  const byUser = await sb
    .from("email_settings")
    .select("company_name,company_address,support_email,from_email")
    .eq("user_id", user.id)
    .maybeSingle();
  if (byUser.data) {
    company = (byUser.data as any).company_name || company;
    address = (byUser.data as any).company_address || address;
    support = (byUser.data as any).support_email || support;
    from = (byUser.data as any).from_email || from;
  }
  if ((!company || !from) && tenantId) {
    const byTenant = await sb
      .from("email_settings")
      .select("company_name,company_address,support_email,from_email")
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (byTenant.data) {
      company ||= (byTenant.data as any).company_name || undefined;
      address ||= (byTenant.data as any).company_address || undefined;
      support ||= (byTenant.data as any).support_email || undefined;
      from ||= (byTenant.data as any).from_email || undefined;
    }
  }

  // 2) tenants を最後のフォールバック
  if (tenantId && (!company || !from)) {
    const { data: t } = await sb
      .from("tenants")
      .select("company_name, company_address, support_email, from_email")
      .eq("id", tenantId)
      .maybeSingle();
    if (t) {
      company ||= (t as any).company_name || undefined;
      address ||= (t as any).company_address || undefined;
      support ||= (t as any).support_email || undefined;
      from ||= (t as any).from_email || undefined;
    }
  }

  return {
    tenantId,
    brand: { company, address, support, from },
  };
}

function buildTextFooter(opts: {
  company?: string;
  address?: string;
  support?: string;
  unsubscribeUrl?: string | null;
}) {
  const L: string[] = [];
  if (opts.company) L.push(`運営：${opts.company}`);
  if (opts.address) L.push(`所在地：${opts.address}`);
  if (opts.support) L.push(`連絡先：${opts.support}`);
  if (opts.unsubscribeUrl) L.push(`配信停止：${opts.unsubscribeUrl}`);
  if (L.length === 0) return "";
  return ["", "――", ...L].join("\n");
}

/** CORS */
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

    const { tenantId, brand } = await loadBrandForCurrentUser();
    if (!tenantId) {
      return NextResponse.json({ error: "no tenant" }, { status: 400 });
    }

    // メール本体：プレーンテキストのみ使用
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

    // 既登録（scheduled/queued/sent）は除外
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

    // スケジュール記録（存在しない列/テーブルでも送信は成功させる）
    if (scheduled) {
      try {
        await sb.from("mail_schedules").insert({
          tenant_id: tenantId,
          mail_id: mailId,
          scheduled_at: new Date(scheduleAtISO as string).toISOString(),
          status: "scheduled",
        } as any);
      } catch {
        // no-op（一覧への反映だけスキップ）
      }
    }

    // mail_deliveries へ記録（通常の insert）
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

    // キュー投入（テキスト＋フッター）
    let queued = 0;
    for (const r of targets as any[]) {
      const unsubUrl = r.unsubscribe_token
        ? `${appUrl}/api/unsubscribe?token=${encodeURIComponent(
            r.unsubscribe_token
          )}`
        : null;

      const textBody = personalize(textRaw, { name: r.name, email: r.email });
      const footer = buildTextFooter({
        company: brand.company,
        address: brand.address,
        support: brand.support,
        unsubscribeUrl: unsubUrl,
      });

      const subject = personalize(subjectRaw, {
        name: r.name,
        email: r.email,
      });

      const job /*: DirectEmailJob*/ = {
        kind: "direct_email",
        to: String(r.email),
        subject,
        text: footer ? `${textBody}\n\n${footer}` : textBody,
        tenantId,
        unsubscribeToken: (r as any).unsubscribe_token ?? undefined,
        fromOverride: brand.from || undefined,
        brandCompany: brand.company || undefined,
        brandAddress: brand.address || undefined,
        brandSupport: brand.support || undefined,
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
