// web/src/app/api/campaigns/send/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { emailQueue } from "@/server/queue";
import type { DirectEmailJob } from "@/server/queue";

/* ================= 共通ユーティリティ ================= */
const appUrl = (process.env.APP_URL || "http://localhost:3000").replace(
  /\/+$/,
  ""
);
const CARD_MARK = "<!--EMAIL_CARD_START-->";

// SVG 1px タイル（暗転を防ぐため背景画像としても敷く）
const WHITE_TILE =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1' height='1'%3E%3Crect width='1' height='1' fill='%23ffffff'/%3E%3C/svg%3E";
const LIGHT_TILE =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1' height='1'%3E%3Crect width='1' height='1' fill='%23f3f4f6'/%3E%3C/svg%3E";

const sWhite =
  `background:#ffffff !important; background-color:#ffffff !important; ` +
  `background-image:url('${WHITE_TILE}') !important; background-repeat:repeat !important;`;
const sLight =
  `background:#f3f4f6 !important; background-color:#f3f4f6 !important; ` +
  `background-image:url('${LIGHT_TILE}') !important; background-repeat:repeat !important;`;

type Payload = {
  campaignId: string;
  recipientIds: string[];
  scheduleAt?: string | null;
};

/** 背景をライト固定（bgcolor + background-color + 背景画像(単色グラデ)） */
function lockLight(hex: string) {
  // 例: "#ffffff" / "#f3f4f6"
  return (
    [
      `background-color:${hex} !important`,
      // Gmail iOS の自動暗転を止めるために背景画像を併用（見た目は完全に同じ）
      `background-image:linear-gradient(${hex}, ${hex}) !important`,
      `background-repeat:repeat !important`,
    ].join(";") + ";"
  );
}

function chunk<T>(arr: T[], size: number): T[][] {
  const a = [...arr];
  const out: T[][] = [];
  while (a.length) out.push(a.splice(0, size));
  return out;
}
function htmlToText(html: string) {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr|table)>/gi, "\n")
    .replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
function escapeHtml(s: string) {
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
function decodeHtmlEntities(s: string) {
  return s
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'");
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

/** “HTMLっぽい”簡易判定 */
function isLikelyHtml(s: string) {
  if (!s) return false;
  return (
    /<\s*(?:!DOCTYPE|html|head|body|p|div|span|table|br|h[1-6]|section|article|img|a)\b/i.test(
      s
    ) || /<\/\s*[a-z][\s\S]*?>/i.test(s)
  );
}
/** リッチHTML判定（該当は無改変） */
function isRichHtml(html: string) {
  return /<(p|h[1-6]|table|thead|tbody|tr|td|th|ul|ol|li|blockquote|strong|b|em|i|section|article|header|footer)\b/i.test(
    html || ""
  );
}

/** テキスト → HTML（1行目のみ太字＋濃色） */
function toHtmlFromPlainTextFirstLineBold(raw: string) {
  const t = (raw ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (!t.length) return "";
  const idx = t.indexOf("\n");
  if (idx === -1)
    return `<strong style="font-weight:700;color:#0b1220;">${escapeHtml(
      t
    )}</strong>`;
  const first = escapeHtml(t.slice(0, idx));
  const rest = escapeHtml(t.slice(idx + 1)).replace(/\n/g, "<br />");
  return `<strong style="font-weight:700;color:#0b1220;">${first}</strong><br />${rest}`;
}

/** 軽量HTML（p/h/strong等なし）のときだけ1ブロック目を太字化 */
function maybeBoldenFirstLineInLightHtml(html: string) {
  const src = html ?? "";
  if (!src.trim()) return src;
  if (isRichHtml(src)) return src;
  const wrap = src.match(/^<\s*(div|span)\b[^>]*>/i);
  let prefix = "",
    body = src,
    suffix = "";
  if (wrap) {
    prefix = wrap[0];
    const closing = src.match(new RegExp(`</\\s*${wrap[1]}\\s*>$`, "i"));
    if (closing) {
      suffix = closing[0];
      body = src.slice(prefix.length, src.length - suffix.length);
    } else body = src.slice(prefix.length);
  }
  const norm = body.replace(/<br\s*\/?>/gi, "<br />");
  const i = norm.indexOf("<br />");
  if (i === -1)
    return `${prefix}<strong style="font-weight:700;color:#0b1220;">${norm}</strong>${suffix}`;
  const first = norm.slice(0, i),
    rest = norm.slice(i + "<br />".length);
  return `${prefix}<strong style="font-weight:700;color:#0b1220;">${first}</strong><br />${rest}${suffix}`;
}
function buildBodyHtmlFromInput(input: string, isHtml: boolean) {
  return isHtml
    ? maybeBoldenFirstLineInLightHtml(input)
    : toHtmlFromPlainTextFirstLineBold(input);
}

/** 旧フッター除去 */
function stripLegacyFooter(html: string) {
  if (!html) return "";
  let out = html;
  out = out.replace(
    /\{\{\s*UNSUB_URL\s*\}\}|__UNSUB_URL__|%%UNSUB_URL%%/gi,
    ""
  );
  out = out.replace(/<!--EMAIL_FOOTER_START-->[\s\S]*?<\/table>\s*/gi, "");
  out = out.replace(
    /<[^>]+data-email-footer[^>]*>[\s\S]*?<\/td>\s*<\/tr>\s*<\/table>\s*/gi,
    ""
  );
  out = out.replace(/<table[^>]*?border-top:[^>]*?>[\s\S]*?<\/table>\s*$/i, "");
  return out;
}

/** 情報チップ */
function chip(html: string, extra = "") {
  return `<span style="display:inline-block;margin:4px 6px 0 0;padding:4px 10px;border-radius:999px;background:#f9fafb !important;border:1px solid #e5e7eb !important;font-size:13px;line-height:1.6;color:#4b5563 !important;${extra}">${html}</span>`;
}

/** 本文+メタを“1枚カード”に統合（見た目はそのまま、反転だけ抑止） */
function buildCardHtml(opts: {
  innerHtml: string;
  company?: string;
  address?: string;
  support?: string;
  recipientEmail: string;
  unsubscribeUrl?: string | null;
  deliveryId: string;
}) {
  const {
    innerHtml,
    company,
    address,
    support,
    recipientEmail,
    unsubscribeUrl,
    deliveryId,
  } = opts;

  const clean = stripLegacyFooter(innerHtml);

  // フッターのサイズ階層（＝変更前と同じ）
  const explStyle = "font-size:14px;color:#374151;";
  const idStyle = "font-size:12px;opacity:.75;color:#4b5563;";

  const who = `<div style="margin-top:12px;${explStyle}">
    このメールは ${company ? escapeHtml(company) : "弊社"} から
    <a href="mailto:${escapeHtml(
      recipientEmail
    )}" style="color:#0a66c2;text-decoration:underline;">${escapeHtml(
    recipientEmail
  )}</a>
    宛にお送りしています。
  </div>`;

  const chips: string[] = [];
  if (company) chips.push(chip(`運営：${escapeHtml(company)}`));
  if (address) chips.push(chip(`所在地：${escapeHtml(address)}`));
  if (support)
    chips.push(
      chip(
        `連絡先：<a href="mailto:${escapeHtml(
          support
        )}" style="color:#0a66c2;text-decoration:underline;">${escapeHtml(
          support
        )}</a>`
      )
    );
  if (unsubscribeUrl)
    chips.push(
      chip(
        `<a href="${unsubscribeUrl}" target="_blank" rel="noopener" style="color:#0a66c2;text-decoration:underline;">配信停止</a>`
      )
    );
  const chipsRow = chips.length
    ? `<div style="margin-top:8px;">${chips.join("")}</div>`
    : "";
  const did = `<div style="margin-top:8px;${idStyle}">配信ID: ${escapeHtml(
    deliveryId
  )}</div>`;

  // ★変更点：各レイヤーに lockLight() を“追加”するだけ（既存の色/角丸/影/余白は一切変更しない）
  return `${CARD_MARK}
<table role="presentation" width="100%" bgcolor="#f3f4f6"
  style="background:#f3f4f6 !important;padding:16px 0;color-scheme:light;supported-color-schemes:light;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility;${lockLight(
    "#f3f4f6"
  )}">
  <tr>
    <td align="center" bgcolor="#f3f4f6" style="padding:0 12px;${lockLight(
      "#f3f4f6"
    )}">
      <table role="presentation" width="100%" bgcolor="#ffffff"
        style="max-width:640px;border-radius:14px;background:#ffffff !important;box-shadow:0 4px 16px rgba(0,0,0,.08);border:1px solid #e5e7eb;color-scheme:light;supported-color-schemes:light;${lockLight(
          "#ffffff"
        )}">
        <tr>
          <td bgcolor="#ffffff"
              style="padding:20px;font:16px/1.7 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111827 !important;${lockLight(
                "#ffffff"
              )}">
            <!-- 本文（プレーン/軽量HTMLは1行目太字。リッチHTMLは無改変） -->
            <div style="color:#111827 !important;${lockLight(
              "#ffffff"
            )}">${clean}</div>

            <!-- メタ情報 -->
            <div style="margin-top:20px;padding-top:12px;border-top:1px dashed #e5e7eb;${lockLight(
              "#ffffff"
            )}">
              ${who}
              ${chipsRow}
              ${did}
            </div>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`;
}

/** 開封ピクセル注入 */
function injectOpenPixel(html: string, url: string) {
  const pixel = `<img src="${url}" alt="" width="1" height="1" style="display:block;max-width:1px;max-height:1px;border:0;outline:none;" />`;
  return /<\/body\s*>/i.test(html)
    ? html.replace(/<\/body\s*>/i, `${pixel}\n</body>`)
    : `${html}\n${pixel}`;
}

/* ================= ハンドラ ================= */
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

async function loadSenderConfigForCurrentUser() {
  const sb = await supabaseServer();
  const { data: u } = await sb.auth.getUser();
  const user = u?.user;
  if (!user)
    return { tenantId: undefined as string | undefined, cfg: {} as any };
  const { data: prof } = await sb
    .from("profiles")
    .select("tenant_id")
    .eq("id", user.id)
    .maybeSingle();
  const tenantId = (prof?.tenant_id as string | undefined) ?? undefined;

  let from_address: string | undefined,
    brand_company: string | undefined,
    brand_address: string | undefined,
    brand_support: string | undefined;

  const byUser = await sb
    .from("email_settings")
    .select("from_address,brand_company,brand_address,brand_support")
    .eq("user_id", user.id)
    .maybeSingle();
  if (byUser.data)
    ({ from_address, brand_company, brand_address, brand_support } =
      byUser.data as any);

  if ((!from_address || !brand_company) && tenantId) {
    const byTenant = await sb
      .from("email_settings")
      .select("from_address,brand_company,brand_address,brand_support")
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (byTenant.data) {
      from_address ||= (byTenant.data as any).from_address;
      brand_company ||= (byTenant.data as any).brand_company;
      brand_address ||= (byTenant.data as any).brand_address;
      brand_support ||= (byTenant.data as any).brand_support;
    }
  }
  if (tenantId) {
    const { data: t } = await sb
      .from("tenants")
      .select("company_name, company_address, support_email, from_email")
      .eq("id", tenantId)
      .maybeSingle();
    if (t) {
      from_address ||= (t as any).from_email || undefined;
      brand_company ||= (t as any).company_name || undefined;
      brand_address ||= (t as any).company_address || undefined;
      brand_support ||= (t as any).support_email || undefined;
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

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as Partial<Payload>;
    const campaignId = String(body.campaignId ?? "");
    const recipientIds = Array.isArray(body.recipientIds)
      ? body.recipientIds
      : [];
    const scheduleAtISO = body.scheduleAt ?? null;
    if (!campaignId || recipientIds.length === 0)
      return NextResponse.json(
        { error: "campaignId と recipientIds は必須です" },
        { status: 400 }
      );

    const sb = await supabaseServer();
    const { data: u } = await sb.auth.getUser();
    if (!u?.user)
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const { tenantId, cfg } = await loadSenderConfigForCurrentUser();
    if (!tenantId)
      return NextResponse.json({ error: "no tenant" }, { status: 400 });

    const admin = supabaseAdmin();
    const { data: camp, error: campErr } = await admin
      .from("campaigns")
      .select("id, tenant_id, subject, body_html, from_email, status")
      .eq("id", campaignId)
      .maybeSingle();
    if (campErr)
      return NextResponse.json(
        { error: "db(campaigns): " + campErr.message },
        { status: 500 }
      );
    if (!camp)
      return NextResponse.json({ error: "not found" }, { status: 404 });
    if ((camp as any).tenant_id !== tenantId)
      return NextResponse.json({ error: "forbidden" }, { status: 403 });

    const htmlBodyRaw = ((camp as any).body_html as string | null) ?? "";
    const subjectRaw = String((camp as any).subject ?? "");

    const { data: recs, error: rErr } = await sb
      .from("recipients")
      .select("id, name, email, unsubscribe_token, unsubscribed_at")
      .in("id", recipientIds)
      .eq("tenant_id", tenantId);
    if (rErr)
      return NextResponse.json(
        { error: "db(recipients): " + rErr.message },
        { status: 500 }
      );
    const recipients = (recs ?? []).filter(
      (r: any) => r?.email && !r?.unsubscribed_at
    );
    if (recipients.length === 0)
      return NextResponse.json({ error: "no recipients" }, { status: 400 });

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

    const now = Date.now();
    let delay = 0;
    let scheduleAt: string | null = null;
    if (scheduleAtISO) {
      const ts = Date.parse(scheduleAtISO);
      if (Number.isNaN(ts))
        return NextResponse.json(
          { error: "scheduleAt が不正です" },
          { status: 400 }
        );
      delay = Math.max(0, ts - now);
      scheduleAt = new Date(ts).toISOString();
    }

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

    const { data: dels, error: dErr } = await sb
      .from("deliveries")
      .select("id, recipient_id")
      .eq("tenant_id", tenantId)
      .eq("campaign_id", campaignId)
      .in(
        "recipient_id",
        targets.map((t) => t.id)
      );
    if (dErr)
      return NextResponse.json(
        { error: "db(deliveries): " + dErr.message },
        { status: 500 }
      );
    const idMap = new Map<string, string>();
    (dels ?? []).forEach((d) =>
      idMap.set(String(d.recipient_id), String(d.id))
    );

    const fromOverride =
      (cfg.fromOverride as string | undefined) ||
      ((camp as any).from_email as string | undefined) ||
      undefined;

    let queued = 0;
    for (const r of targets) {
      const deliveryId = idMap.get(String(r.id)) ?? "";
      const pixelUrl = `${appUrl}/api/email/open?id=${encodeURIComponent(
        deliveryId
      )}`;
      const unsubUrl = r.unsubscribe_token
        ? `${appUrl}/api/unsubscribe?token=${encodeURIComponent(
            r.unsubscribe_token
          )}`
        : null;
      const subjectPersonalized = personalize(
        subjectRaw,
        { name: r.name, email: r.email },
        identity
      );

      const inputIsHtml = isLikelyHtml(htmlBodyRaw);
      const personalizedInput = personalize(
        htmlBodyRaw,
        { name: r.name, email: r.email },
        inputIsHtml ? escapeHtml : identity
      );
      const htmlFilled = buildBodyHtmlFromInput(personalizedInput, inputIsHtml);

      const cardHtml = buildCardHtml({
        innerHtml: htmlFilled,
        company: cfg.brandCompany,
        address: cfg.brandAddress,
        support: cfg.brandSupport,
        recipientEmail: String(r.email),
        unsubscribeUrl: unsubUrl,
        deliveryId,
      });

      const htmlFinal = injectOpenPixel(cardHtml, pixelUrl);

      const textBody = inputIsHtml
        ? decodeHtmlEntities(htmlToText(htmlFilled))
        : personalize(
            htmlBodyRaw,
            { name: r.name, email: r.email },
            identity
          ) || "";
      const textFooter = [
        `このメールは ${cfg.brandCompany || "弊社"} から ${String(
          r.email
        )} 宛にお送りしています。`,
        cfg.brandCompany ? `運営：${cfg.brandCompany}` : "",
        cfg.brandAddress ? `所在地：${cfg.brandAddress}` : "",
        cfg.brandSupport ? `連絡先：${cfg.brandSupport}` : "",
        unsubUrl ? `配信停止：${unsubUrl}` : "",
        `配信ID：${deliveryId}`,
      ]
        .filter(Boolean)
        .join("\n");
      const textFinal = textBody ? `${textBody}\n\n${textFooter}` : textFooter;

      const job: DirectEmailJob = {
        kind: "direct_email",
        to: String(r.email),
        subject: subjectPersonalized,
        html: htmlFinal,
        text: textFinal,
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
