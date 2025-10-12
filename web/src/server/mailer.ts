// web/src/server/mailer.ts
import nodemailer from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";

/* ========= Env & defaults ========= */
const host = process.env.SMTP_HOST!;
const port = Number(process.env.SMTP_PORT!);
const user = process.env.SMTP_USER || "";
const pass = process.env.SMTP_PASS || "";

// 技術的送信者（MAIL FROM / Sender ヘッダ）は no-reply 固定
const defaultFrom = process.env.FROM_EMAIL!; // 例: no-reply@lotus-d-transformation.com

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

  // 表示上の差出人としてユーザーが入れたもの（Reply-To として扱う）
  fromOverride?: string;

  brandCompany?: string;
  brandAddress?: string;
  brandSupport?: string;
};

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

function buildUnsubscribeUrl(token?: string | null) {
  if (!token) return null;
  return `${appUrl}/api/unsubscribe?token=${encodeURIComponent(token)}`;
}

/** 旧テンプレの手書きフッター + {{UNSUB_URL}} などを除去 */
function stripLegacyFooter(html: string) {
  let out = html || "";
  // よくあるトークンを掃除（{{UNSUB_URL}}, __UNSUB_URL__, %%UNSUB_URL%%）
  out = out.replace(
    /\{\{\s*UNSUB_URL\s*\}\}|__UNSUB_URL__|%%UNSUB_URL%%/gi,
    ""
  );
  // data-email-footer や EMAIL_FOOTER_START を含む既存ブロックを削除（重複対策）
  out = out.replace(/<!--EMAIL_FOOTER_START-->[\s\S]*?<\/table>\s*/gi, "");
  out = out.replace(
    /<[^>]+data-email-footer[^>]*>[\s\S]*?<\/td>\s*<\/tr>\s*<\/table>\s*/gi,
    ""
  );
  return out;
}

/** 控えめフッター（ここを編集すれば文言が変わります） */
function footerHtml(opts: {
  url: string;
  company?: string;
  address?: string;
  support?: string;
}) {
  const { url, company, address, support } = opts;
  const addressHtml = address ? `<div>${escapeHtml(address)}</div>` : "";
  const supportHtml = support
    ? `<div>お問い合わせ: <a href="mailto:${escapeHtml(
        support
      )}" style="color:#6b7280;text-decoration:underline;">${escapeHtml(
        support
      )}</a></div>`
    : "";
  return `${FOOTER_MARK}
<table role="presentation" width="100%" style="margin-top:24px;border-top:1px solid #e5e5e5">
  <tr>
    <td data-email-footer style="font:12px/1.6 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#666;padding-top:12px">
      ${
        company
          ? `<div style="font-weight:600;color:#4b5563;">${escapeHtml(
              company
            )}</div>`
          : ""
      }
      ${addressHtml}
      ${supportHtml}
      <div>配信停止: <a href="${url}" target="_blank" rel="noopener" style="color:#6b7280;text-decoration:underline;">こちら</a></div>
    </td>
  </tr>
</table>`;
}

/** プレーンテキスト用フッター */
function footerText(opts: {
  url: string;
  company?: string;
  address?: string;
  support?: string;
}) {
  const { url, company, address, support } = opts;
  const lines = [
    company || "",
    address || "",
    support ? `お問い合わせ: ${support}` : "",
    `配信停止: ${url}`,
  ].filter(Boolean);
  return lines.join("\n");
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

/** 開封ピクセルを “最終末尾” に1回だけ注入 */
function injectOpenPixelOnce(html: string, url: string) {
  const pixel = `<img src="${url}" alt="" width="1" height="1" style="display:none;max-width:1px;max-height:1px;" />`;
  // すでに同じURLがあれば何もしない
  if (html.includes(pixel)) return html;
  const bodyClose = /<\/body\s*>/i;
  return bodyClose.test(html)
    ? html.replace(bodyClose, `${pixel}\n</body>`)
    : `${html}\n${pixel}`;
}

export async function sendMail(args: SendArgs) {
  // ブランド情報（テナント優先 → フォールバック）
  const company = args.brandCompany || fallbackCompany;
  const address = args.brandAddress || fallbackAddress;
  const support = args.brandSupport || fallbackSupport;

  // --- DMARC 整合（From を自ドメインに固定） ---
  // 表示上の From は「会社名 + 自ドメインのアドレス」に固定
  const fromHeader = { name: company, address: defaultFrom };

  // 技術的送信者（MAIL FROM / SPF / Sender）
  const senderHeader = defaultFrom;

  // 返信先のみユーザー指定のアドレスを採用（ユーザーが Gmail でも DMARC に影響しない）
  const replyToHeader = args.fromOverride || undefined;

  // Unsubscribe（HTTPS One-Click + mailto の両方を用意）
  const unsubscribeUrl = buildUnsubscribeUrl(args.unsubscribeToken ?? null);
  const headers: Record<string, string> = {};
  if (unsubscribeUrl) {
    const mailto = support ? `, <mailto:${support}>` : "";
    headers["List-Unsubscribe"] = `<${unsubscribeUrl}>${mailto}`;
    headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
  }

  // --- 本文クリーン + フッター注入（1回だけ） ---
  const sanitizedHtml = stripLegacyFooter(args.html);

  // フッターは mailer.ts でのみ注入（本文末尾に常に見える）
  let finalHtml = sanitizedHtml;
  let finalText = (args.text ?? "").replace(
    /\{\{\s*UNSUB_URL\s*\}\}|__UNSUB_URL__|%%UNSUB_URL%%/gi,
    ""
  );

  if (unsubscribeUrl) {
    const htmlFooter = footerHtml({
      url: unsubscribeUrl,
      company,
      address,
      support,
    });
    finalHtml = injectFooterOnce(finalHtml, htmlFooter);

    const textFooter = footerText({
      url: unsubscribeUrl,
      company,
      address,
      support,
    });
    finalText = finalText ? `${finalText}\n\n${textFooter}` : textFooter;
  }

  // （重要）開封ピクセルは最後に1回だけ
  if (args.unsubscribeToken) {
    const pixelUrl = `${appUrl}/api/email/open?token=${encodeURIComponent(
      args.unsubscribeToken
    )}`;
    finalHtml = injectOpenPixelOnce(finalHtml, pixelUrl);
  }

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
