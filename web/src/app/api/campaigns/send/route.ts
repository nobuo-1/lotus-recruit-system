export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { emailQueue } from "@/server/queue";
import type { DirectEmailJob } from "@/server/queue";

type Payload = {
  campaignId: string;
  recipientIds: string[];
  scheduleAt?: string | null; // 未来ISO→予約 / 省略→即時
};

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

/** /email/settings を user→tenant→tenants の順でフェッチ */
async function loadSenderConfigForCurrentUser() {
  const sb = await supabaseServer();
  const { data: u } = await sb.auth.getUser();
  const user = u?.user;
  if (!user) {
    return {
      tenantId: undefined as string | undefined,
      cfg: {} as {
        fromOverride?: string;
        brandCompany?: string;
        brandAddress?: string;
        brandSupport?: string;
      },
    };
  }

  const { data: prof } = await sb
    .from("profiles")
    .select("tenant_id")
    .eq("id", user.id)
    .maybeSingle();
  const tenantId = (prof?.tenant_id as string | undefined) ?? undefined;

  let from_address: string | undefined;
  let brand_company: string | undefined;
  let brand_address: string | undefined;
  let brand_support: string | undefined;

  const byUser = await sb
    .from("email_settings")
    .select("from_address,brand_company,brand_address,brand_support")
    .eq("user_id", user.id)
    .maybeSingle();
  if (byUser.data) {
    ({ from_address, brand_company, brand_address, brand_support } =
      byUser.data as any);
  }

  if ((!from_address || !brand_company) && tenantId) {
    const byTenant = await sb
      .from("email_settings")
      .select("from_address,brand_company,brand_address,brand_support")
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (byTenant.data) {
      from_address = from_address || (byTenant.data as any).from_address;
      brand_company = brand_company || (byTenant.data as any).brand_company;
      brand_address = brand_address || (byTenant.data as any).brand_address;
      brand_support = brand_support || (byTenant.data as any).brand_support;
    }
  }

  if (tenantId) {
    const { data: t } = await sb
      .from("tenants")
      .select("company_name, company_address, support_email, from_email")
      .eq("id", tenantId)
      .maybeSingle();
    if (t) {
      from_address = from_address || (t as any).from_email || undefined;
      brand_company = brand_company || (t as any).company_name || undefined;
      brand_address = brand_address || (t as any).company_address || undefined;
      brand_support = brand_support || (t as any).support_email || undefined;
    }
  }

  return {
    tenantId,
    cfg: {
      fromOverride: from_address || undefined,
      brandCompany: brand_company || undefined,
      brandAddress: brand_address || undefined,
      brandSupport: brand_support || undefined,
    },
  };
}

/** HTML末尾に開封ピクセルを1回だけ注入（最終末尾でOK） */
function injectOpenPixel(html: string, url: string) {
  const pixel = `<img src="${url}" alt="" width="1" height="1" style="display:block;max-width:1px;max-height:1px;border:0;outline:none;" />`;
  return /<\/body\s*>/i.test(html)
    ? html.replace(/<\/body\s*>/i, `${pixel}\n</body>`)
    : `${html}\n${pixel}`;
}

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

// 簡易HTML→プレーンテキスト
function htmlToText(html: string) {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, "\n")
    .replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// 差し込みヘルパー
function escapeHtml(s: string) {
  return String(s)
    .replaceAll(/&/g, "&amp;")
    .replaceAll(/</g, "&lt;")
    .replaceAll(/>/g, "&gt;")
    .replaceAll(/"/g, "&quot;")
    .replaceAll(/'/g, "&#39;");
}
function identity(s: string) {
  return String(s);
}
function decodeHtmlEntities(s: string) {
  return s
    .replaceAll(/&amp;/g, "&")
    .replaceAll(/&lt;/g, "<")
    .replaceAll(/&gt;/g, ">")
    .replaceAll(/&quot;/g, '"')
    .replaceAll(/&#39;/g, "'");
}
function personalizeTemplate(
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

/** ====== 追加: フッターの折りたたみ回避用ユーティリティ ====== */
const FOOTER_MARK = "<!--EMAIL_FOOTER_START-->";

function stripLegacyFooter(html: string) {
  let out = html || "";
  out = out.replace(
    /\{\{\s*UNSUB_URL\s*\}\}|__UNSUB_URL__|%%UNSUB_URL%%/gi,
    ""
  );
  out = out.replace(/<!--EMAIL_FOOTER_START-->[\s\S]*?<\/table>\s*/gi, "");
  out = out.replace(
    /<[^>]+data-email-footer[^>]*>[\s\S]*?<\/td>\s*<\/tr>\s*<\/table>\s*/gi,
    ""
  );
  return out;
}

function footerHtmlCardV2(opts: {
  url: string;
  company?: string;
  address?: string;
  support?: string;
  recipientEmail: string;
  deliveryId: string;
}) {
  const { url, company, address, support, recipientEmail, deliveryId } = opts;
  return `${FOOTER_MARK}
<table role="presentation" width="100%" style="margin-top:24px;">
  <tr>
    <td data-email-footer style="font:14px/1.7 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111827;">
      <table role="presentation" width="100%" style="border-radius:12px;background:#f9fafb;padding:16px;">
        <tr><td>
          ${
            company
              ? `<div style="font-weight:600;font-size:14px;color:#111827;">${escapeHtml(
                  company
                )}</div>`
              : ""
          }
          ${
            address
              ? `<div style="margin-top:4px;">${escapeHtml(address)}</div>`
              : ""
          }
          <div style="margin-top:8px;">このメールは ${
            company ? escapeHtml(company) : "弊社"
          } から <span style="white-space:nowrap">${escapeHtml(
    recipientEmail
  )}</span> 宛にお送りしています。</div>
          ${
            support
              ? `<div style="margin-top:8px;">お問い合わせ: <a href="mailto:${escapeHtml(
                  support
                )}" style="color:#0a66c2;text-decoration:underline;">${escapeHtml(
                  support
                )}</a></div>`
              : ""
          }
          <div style="margin-top:8px;">配信停止: <a href="${url}" target="_blank" rel="noopener" style="color:#0a66c2;text-decoration:underline;">こちら</a></div>
          <div style="margin-top:6px;opacity:.75;font-size:12px;">配信ID: ${escapeHtml(
            deliveryId
          )}</div>
        </td></tr>
      </table>
    </td>
  </tr>
</table>`;
}

function footerTextV2(opts: {
  url: string;
  company?: string;
  address?: string;
  support?: string;
  recipientEmail: string;
  deliveryId: string;
}) {
  const { url, company, address, support, recipientEmail, deliveryId } = opts;
  return [
    company || "",
    address || "",
    `このメールは ${
      company || "弊社"
    } から ${recipientEmail} 宛にお送りしています。`,
    support ? `お問い合わせ: ${support}` : "",
    `配信停止: ${url}`,
    `配信ID: ${deliveryId}`,
  ]
    .filter(Boolean)
    .join("\n");
}

/** HTML末尾に1回だけフッターを挿入 */
function injectFooterOnce(html: string, footer: string) {
  const src = html || "";
  if (src.includes(FOOTER_MARK) || /data-email-footer/.test(src)) return src;
  const bodyClose = /<\/body\s*>/i;
  return bodyClose.test(src)
    ? src.replace(bodyClose, `${footer}\n</body>`)
    : `${src}\n${footer}`;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as Partial<Payload>;
    const campaignId = String(body.campaignId ?? "");
    const recipientIds = Array.isArray(body.recipientIds)
      ? body.recipientIds
      : [];
    const scheduleAtISO = body.scheduleAt ?? null;

    if (!campaignId || recipientIds.length === 0) {
      return NextResponse.json(
        { error: "campaignId と recipientIds は必須です" },
        { status: 400 }
      );
    }

    const sb = await supabaseServer();
    const { data: u } = await sb.auth.getUser();
    if (!u?.user)
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const { tenantId, cfg } = await loadSenderConfigForCurrentUser();
    if (!tenantId)
      return NextResponse.json({ error: "no tenant" }, { status: 400 });

    // キャンペーン
    const admin = supabaseAdmin();
    const { data: camp, error: campErr } = await admin
      .from("campaigns")
      .select("id, tenant_id, subject, body_html, from_email, status")
      .eq("id", campaignId)
      .maybeSingle();
    if (campErr) {
      console.error("[send] campaigns.select error:", campErr);
      return NextResponse.json(
        { error: "db(campaigns): " + campErr.message },
        { status: 500 }
      );
    }
    if (!camp)
      return NextResponse.json({ error: "not found" }, { status: 404 });
    if ((camp as any).tenant_id !== tenantId) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const htmlBodyRaw = ((camp as any).body_html as string | null) ?? "";
    const textBodyFromHtml = htmlBodyRaw ? htmlToText(htmlBodyRaw) : undefined;

    // 受信者
    const { data: recs, error: rErr } = await sb
      .from("recipients")
      .select("id, name, email, unsubscribe_token, unsubscribed_at")
      .in("id", recipientIds)
      .eq("tenant_id", tenantId);
    if (rErr) {
      console.error("[send] recipients.select error:", rErr);
      return NextResponse.json(
        { error: "db(recipients): " + rErr.message },
        { status: 500 }
      );
    }
    const recipients = (recs ?? []).filter(
      (r: any) => r?.email && !r?.unsubscribed_at
    );
    if (recipients.length === 0) {
      return NextResponse.json({ error: "no recipients" }, { status: 400 });
    }

    // 重複防止
    const { data: already } = await sb
      .from("deliveries")
      .select("recipient_id")
      .eq("tenant_id", tenantId)
      .eq("campaign_id", campaignId)
      .in("status", ["scheduled", "queued", "sent"]);
    const exclude = new Set((already ?? []).map((d: any) => d.recipient_id));
    const targets = recipients.filter((r) => !exclude.has(r.id));
    if (targets.length === 0)
      return NextResponse.json({
        ok: true,
        queued: 0,
        skipped: recipientIds.length,
      });

    // 予約 or 即時
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

    // deliveries upsert
    if (scheduleAt) {
      for (const part of chunk(
        targets.map((r) => ({
          tenant_id: tenantId,
          campaign_id: campaignId,
          recipient_id: r.id,
          status: "scheduled" as const,
          scheduled_at: scheduleAt,
        })),
        500
      )) {
        await sb
          .from("deliveries")
          .upsert(part, { onConflict: "campaign_id,recipient_id" });
      }
      await sb
        .from("campaigns")
        .update({ status: "scheduled" })
        .eq("id", campaignId);
    } else {
      for (const part of chunk(
        targets.map((r) => ({
          tenant_id: tenantId,
          campaign_id: campaignId,
          recipient_id: r.id,
          status: "queued" as const,
          scheduled_at: null as any,
        })),
        500
      )) {
        await sb
          .from("deliveries")
          .upsert(part, { onConflict: "campaign_id,recipient_id" });
      }
      await sb
        .from("campaigns")
        .update({ status: "queued" })
        .eq("id", campaignId);
    }

    // delivery_id map（開封ピクセル・表示ID用）
    const { data: dels, error: dErr } = await sb
      .from("deliveries")
      .select("id, recipient_id")
      .eq("tenant_id", tenantId)
      .eq("campaign_id", campaignId)
      .in(
        "recipient_id",
        targets.map((t) => t.id)
      );
    if (dErr) {
      console.error("[send] deliveries.select error:", dErr);
      return NextResponse.json(
        { error: "db(deliveries): " + dErr.message },
        { status: 500 }
      );
    }
    const idMap = new Map<string, string>();
    (dels ?? []).forEach((d) =>
      idMap.set(String(d.recipient_id), String(d.id))
    );

    const fromOverride =
      (cfg.fromOverride as string | undefined) ||
      ((camp as any).from_email as string | undefined) ||
      undefined;

    // キュー投入
    let queued = 0;
    for (const r of targets) {
      const deliveryId = idMap.get(String(r.id)) ?? "";
      const pixelUrl = `${appUrl}/api/email/open?id=${encodeURIComponent(
        deliveryId
      )}`;

      // 件名差し込み
      const subjectRaw = String((camp as any).subject ?? "");
      const subjectPersonalized = personalizeTemplate(
        subjectRaw,
        { name: r.name, email: r.email },
        identity
      );

      // HTML差し込み（“本文→フッター→ピクセル”の順で1回だけ）
      // 1) 差し込み
      const htmlFilled0 = personalizeTemplate(
        htmlBodyRaw ?? "",
        { name: r.name, email: r.email },
        escapeHtml
      );
      // 2) 旧フッター掃除
      const htmlClean = stripLegacyFooter(htmlFilled0);

      // 3) フッター生成（固有情報: recipientEmail + deliveryId を含める → Gmailの繰り返し判定を回避）
      const unsubUrl = r.unsubscribe_token
        ? `${appUrl}/api/unsubscribe?token=${encodeURIComponent(
            r.unsubscribe_token
          )}`
        : null;

      let htmlWithFooter = htmlClean;
      if (unsubUrl) {
        const footerHtml = footerHtmlCardV2({
          url: unsubUrl,
          company: cfg.brandCompany,
          address: cfg.brandAddress,
          support: cfg.brandSupport,
          recipientEmail: String(r.email),
          deliveryId,
        });
        htmlWithFooter = injectFooterOnce(htmlWithFooter, footerHtml);
      }

      // 4) ピクセル最終末尾に注入（1回だけ）
      const htmlFinal = injectOpenPixel(htmlWithFooter, pixelUrl);

      // TEXT差し込み + テキストフッター
      const textFromHtml = htmlToText(htmlClean);
      let textPersonalized = decodeHtmlEntities(textFromHtml);
      if (unsubUrl) {
        const textFooter = footerTextV2({
          url: unsubUrl,
          company: cfg.brandCompany,
          address: cfg.brandAddress,
          support: cfg.brandSupport,
          recipientEmail: String(r.email),
          deliveryId,
        });
        textPersonalized = textPersonalized
          ? `${textPersonalized}\n\n${textFooter}`
          : textFooter;
      }

      const job: DirectEmailJob = {
        kind: "direct_email",
        to: String(r.email),
        subject: subjectPersonalized,
        html: htmlFinal,
        text: textPersonalized,
        tenantId,
        unsubscribeToken: (r as any).unsubscribe_token ?? undefined,
        fromOverride,
        brandCompany: cfg.brandCompany,
        brandAddress: cfg.brandAddress,
        brandSupport: cfg.brandSupport,
      };

      const jobId = `camp:${campaignId}:rcpt:${r.id}:${Date.now()}`;
      await emailQueue.add("direct_email", job, {
        jobId,
        delay,
        removeOnComplete: 1000,
        removeOnFail: 1000,
      });
      queued++;
    }

    return NextResponse.json({
      ok: true,
      queued,
      scheduled: scheduleAt ?? null,
      fromOverride: fromOverride ?? null,
    });
  } catch (e: any) {
    console.error("POST /api/campaigns/send error", e);
    return NextResponse.json(
      { error: e?.message || "server error" },
      { status: 500 }
    );
  }
}
