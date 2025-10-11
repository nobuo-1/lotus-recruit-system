// web/src/server/mailer.ts
import nodemailer from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";

/* ========= Env & defaults ========= */
const host = process.env.SMTP_HOST!;
const port = Number(process.env.SMTP_PORT!);
const user = process.env.SMTP_USER || "";
const pass = process.env.SMTP_PASS || "";

// 技術的送信者（MAIL FROM / Sender ヘッダ）は no-reply 固定
const defaultFrom = process.env.FROM_EMAIL!; // 例: no-reply@your-domain

const appUrl = (process.env.APP_URL || "http://localhost:3000").replace(
  /\/+$/,
  ""
);

// 任意: DKIM（用意がある場合のみ有効化）
const dkimDomain = process.env.DKIM_DOMAIN || "";
const dkimSelector = process.env.DKIM_SELECTOR || "";
const dkimKey =
  process.env.DKIM_PRIVATE_KEY ||
  (process.env.DKIM_PRIVATE_KEY_B64
    ? Buffer.from(process.env.DKIM_PRIVATE_KEY_B64, "base64").toString("utf8")
    : "");

// TLS 要件（既定: true）
const requireTLS =
  (process.env.SMTP_REQUIRE_TLS ?? "true").toLowerCase() !== "false";

// 既定ブランド（不足分のフォールバック）
const fallbackCompany = process.env.COMPANY_NAME ?? "Lotus Recruit System";
const fallbackAddress = process.env.COMPANY_ADDRESS ?? "";
const fallbackSupport = process.env.SUPPORT_EMAIL ?? "";

// 重複付与を避けるためのフッターマーカー
const FOOTER_MARK = "<!--EMAIL_FOOTER_START-->";

export type SendArgs = {
  to: string;
  subject: string;
  html: string;
  text?: string;
  unsubscribeToken?: string;

  // テナント/ユーザー設定の上書き（表示用From）
  fromOverride?: string;
  brandCompany?: string;
  brandAddress?: string;
  brandSupport?: string;

  // 追跡ピクセル注入のため
  deliveryId?: string;
};

// 可能ならコネクションはモジュールスコープで再利用
const transporter = nodemailer.createTransport({
  pool: true,
  maxConnections: 3,
  maxMessages: 50,
  host,
  port,
  secure: port === 465,
  requireTLS,
  auth: user && pass ? { user, pass } : undefined,
  tls: {
    servername: host,
    minVersion: "TLSv1.2",
  },
  ...(dkimDomain && dkimSelector && dkimKey
    ? {
        dkim: {
          domainName: dkimDomain,
          keySelector: dkimSelector,
          privateKey: dkimKey,
        },
      }
    : {}),
} as SMTPTransport.Options);

// ---------- helpers ----------
function escapeHtml(s: string) {
  return s.replace(
    /[&<>"']/g,
    (m) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      }[m]!)
  );
}

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildUnsubscribeUrl(token?: string | null) {
  if (!token) return null;
  return `${appUrl}/api/unsubscribe?token=${encodeURIComponent(token)}`;
}

/** 既存テンプレに入っている“手書きフッター＋{{UNSUB_URL}} など”を丸ごと除去（安全版） */
function stripLegacyFooter(
  html: string,
  company: string,
  address?: string,
  support?: string
) {
  let out = html || "";

  const TOKEN = String.raw`(?:\{\{\s*UNSUB_URL\s*\}\}|__UNSUB_URL__|%%UNSUB_URL%%)`;
  const block = (s: string) =>
    String.raw`(?:\s*(?:<div[^>]*>|<p[^>]*>)\s*${s}\s*(?:</div>|</p>)\s*)?`;

  const comp = block(escapeRegex(company));
  const addr = address ? block(escapeRegex(address)) : "";
  const sup = support
    ? block(
        String.raw`(?:お問い合わせ[:：]?\s*(?:<a[^>]*>)?${escapeRegex(
          support
        )}(?:</a>)?)`
      )
    : "";
  const unsub = String.raw`\s*(?:<div[^>]*>|<p[^>]*>)\s*配信停止[:：]?\s*${TOKEN}\s*(?:</div>|</p>)\s*`;

  try {
    const legacyRe = new RegExp(`${comp}${addr}${sup}${unsub}`, "i");
    out = out.replace(legacyRe, "");
  } catch {}

  try {
    const tokenLine = new RegExp(
      String.raw`\s*(?:<div[^>]*>|<p[^>]*>)?[^<\n]*${TOKEN}[^<\n]*(?:</div>|</p>)?\s*`,
      "ig"
    );
    out = out.replace(tokenLine, "");
  } catch {}

  try {
    out = out.replace(new RegExp(TOKEN, "ig"), "");
  } catch {}

  return out;
}

/** 薄いグレーのフッター（HTML）。重複検知用マーカーを必ず含める */
function footerHtml(
  url: string,
  company: string,
  address?: string,
  support?: string
) {
  const addressHtml = address ? `<div>${escapeHtml(address)}</div>` : "";
  const supportHtml = support
    ? `<div>お問い合わせ: <a href="mailto:${escapeHtml(support)}">${escapeHtml(
        support
      )}</a></div>`
    : "";
  return `${FOOTER_MARK}
<table role="presentation" width="100%" style="margin-top:24px;border-top:1px solid #e5e5e5">
  <tr>
    <td data-email-footer style="font:12px/1.6 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#666;padding-top:12px">
      <div>${escapeHtml(company)}</div>
      ${addressHtml}
      ${supportHtml}
      <div>配信停止(クリックで即時反映されるためご注意ください): <a href="${url}" target="_blank" rel="noopener">こちら</a></div>
    </td>
  </tr>
</table>`;
}

function footerText(
  url: string,
  company: string,
  address?: string,
  support?: string
) {
  const lines = [
    `--`,
    company,
    address || "",
    support ? `お問い合わせ: ${support}` : "",
    `配信停止: ${url}`,
  ].filter(Boolean);
  return lines.join("\n");
}

/** HTML末尾（できれば </body> の直前）にフッターを「1回だけ」注入する */
function injectFooterOnce(html: string, footer: string) {
  const src = html || "";
  if (src.includes(FOOTER_MARK) || /data-email-footer/.test(src)) return src;

  const bodyClose = /<\/body\s*>/i;
  if (bodyClose.test(src)) return src.replace(bodyClose, `${footer}\n</body>`);
  return `${src}\n${footer}`;
}

/** 開封ピクセルを最終末尾に注入（フッターの“後”） */
function injectOpenPixelLast(html: string, url: string) {
  const pixel = `<img src="${url}" alt="" width="1" height="1" style="display:none;max-width:1px;max-height:1px" />`;
  const close = /<\/body\s*>/i;
  return close.test(html)
    ? html.replace(close, `${pixel}\n</body>`)
    : `${html}\n${pixel}`;
}

export async function sendMail(args: SendArgs) {
  // ブランド情報（テナント優先 → フォールバック）
  const company = args.brandCompany || fallbackCompany;
  const address = args.brandAddress || fallbackAddress;
  const support = args.brandSupport || fallbackSupport;

  // 表示上の From（ヘッダ）
  const displayFromAddress = args.fromOverride || defaultFrom;
  const fromHeader =
    company && displayFromAddress
      ? { name: company, address: displayFromAddress }
      : displayFromAddress;

  // 技術的送信者（SPF/バウンス整合）
  const senderHeader = defaultFrom;

  // 返信先は fromOverride を優先（無ければ未設定）
  const replyToHeader = args.fromOverride || undefined;

  // 配信停止URL & List-Unsubscribe（Gmailの「解除」用）
  const unsubscribeUrl = buildUnsubscribeUrl(args.unsubscribeToken ?? null);
  const headers: Record<string, string> = {};
  if (unsubscribeUrl) {
    // URL + mailto の両方を提示（「解除」バッジ出現率UP）
    const mailto = support ? `, <mailto:${support}>` : "";
    headers["List-Unsubscribe"] = `<${unsubscribeUrl}>${mailto}`;
    headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
  }

  // --- ① 既存“手書きフッター”を削除 ---
  const sanitizedHtml = stripLegacyFooter(args.html, company, address, support);

  // --- ② 自動フッターを1回だけ注入 ---
  const htmlWithFooter = unsubscribeUrl
    ? injectFooterOnce(
        sanitizedHtml,
        footerHtml(unsubscribeUrl, company, address, support)
      )
    : sanitizedHtml;

  // --- ③ 開封ピクセルは最終末尾（フッターの後） ---
  const pixelUrl = args.deliveryId
    ? `${appUrl}/api/email/open?id=${encodeURIComponent(args.deliveryId)}`
    : undefined;
  const finalHtml = pixelUrl
    ? injectOpenPixelLast(htmlWithFooter, pixelUrl)
    : htmlWithFooter;

  // --- ④ テキスト本文もクリーンアップしてフッターを追記 ---
  const cleanedText = (args.text ?? "").replace(
    /\{\{\s*UNSUB_URL\s*\}\}|\[\[\s*UNSUB_URL\s*\]\]|__UNSUB_URL__|%%UNSUB_URL%%/gi,
    ""
  );
  const finalText =
    cleanedText.trim() +
    (unsubscribeUrl
      ? `\n\n${footerText(unsubscribeUrl, company, address, support)}`
      : "");

  const info = await transporter.sendMail({
    from: fromHeader,
    sender: senderHeader,
    replyTo: replyToHeader,
    to: args.to,
    subject: args.subject,
    html: finalHtml,
    text: finalText || undefined,
    headers,
    envelope: { from: senderHeader, to: args.to },
  });

  return info;
}
