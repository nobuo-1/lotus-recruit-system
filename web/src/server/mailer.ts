// web/src/server/mailer.ts
import nodemailer from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";

/* ========= Env & defaults ========= */
const host = process.env.SMTP_HOST!;
const port = Number(process.env.SMTP_PORT!);
const user = process.env.SMTP_USER || "";
const pass = process.env.SMTP_PASS || "";

// 技術的送信者（MAIL FROM / Sender ヘッダ）は no-reply 固定
const defaultFrom = process.env.FROM_EMAIL!; // 例: no-reply@example.com

const rawAppUrl = (process.env.APP_URL || "http://localhost:3000").replace(
  /\/+$/,
  ""
);
// Gmail 解除UIは https を強く好むため、ヘッダー用URLは https を優先
const appUrlHttps = rawAppUrl.replace(/^http:\/\//i, "https://");

const dkimDomain = process.env.DKIM_DOMAIN || "";
const dkimSelector = process.env.DKIM_SELECTOR || "";
const dkimKey =
  process.env.DKIM_PRIVATE_KEY ||
  (process.env.DKIM_PRIVATE_KEY_B64
    ? Buffer.from(process.env.DKIM_PRIVATE_KEY_B64, "base64").toString("utf8")
    : "");

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

  fromOverride?: string;
  brandCompany?: string;
  brandAddress?: string;
  brandSupport?: string;

  /** route/worker から任意で渡される配信ID（開封ピクセルURL は header 側では使わない） */
  deliveryId?: string;
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

/* ---------- helpers ---------- */
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

function buildUnsubUrlForHeader(token?: string | null) {
  // Gmail の解除UI検出用（One-Click URL は https 推奨）
  if (!token) return `${appUrlHttps}/unsubscribe`;
  return `${appUrlHttps}/api/unsubscribe?token=${encodeURIComponent(token)}`;
}
function buildUnsubUrlForBody(token?: string | null) {
  // 本文のリンク（http でもOKだが https を維持）
  if (!token) return `${appUrlHttps}/unsubscribe`;
  return `${appUrlHttps}/unsubscribe?token=${encodeURIComponent(token)}`;
}

/** 旧テンプレ由来のフッター（会社名/住所/問い合わせ/配信停止）が本文中にある場合は除去 */
function stripLegacyFooter(
  html: string,
  company: string,
  address?: string,
  support?: string
) {
  let out = html || "";

  // 我々の新フッター（過去に付いたもの）を安全に除去（重複防止）
  out = out.replace(/<!--EMAIL_FOOTER_START-->[\s\S]*?<\/table>\s*/i, "");
  out = out.replace(
    /data-email-footer[\s\S]*?<\/td>[\s\S]*?<\/tr>[\s\S]*?<\/table>\s*/i,
    ""
  );

  // “配信停止” を含むブロック（div/p/table直下）を緩めに掃除
  out = out.replace(
    new RegExp(
      String.raw`(?:<div[^>]*>|<p[^>]*>|<table[^>]*>)[\s\S]{0,400}配信停止[\s\S]*?(?:</div>|</p>|</table>)`,
      "ig"
    ),
    ""
  );

  // 会社名・住所・問い合わせ を並べたブロック（旧レイアウト）も掃除
  const comp = company ? String.raw`(?:${escapeRegex(company)})` : "";
  const addr = address ? String.raw`(?:${escapeRegex(address)})` : "";
  const sup = support
    ? String.raw`(?:${escapeRegex(support)}|mailto:${escapeRegex(support)})`
    : "";
  if (comp || addr || sup) {
    out = out.replace(
      new RegExp(
        String.raw`(?:<div[^>]*>|<p[^>]*>|<table[^>]*>)[\s\S]{0,400}(?:${comp}[\s\S]{0,200})?(?:${addr}[\s\S]{0,200})?(?:${sup}[\s\S]{0,200})?[\s\S]{0,400}(?:</div>|</p>|</table>)`,
        "ig"
      ),
      ""
    );
  }

  return out;
}

/** 薄いグレーのフッター（本文末尾に 1 回だけ） */
function footerHtml(
  url: string,
  company: string,
  address?: string,
  support?: string
) {
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
      <div style="font-weight:600;color:#4b5563;">${escapeHtml(company)}</div>
      ${addressHtml}
      ${supportHtml}
      <div>配信停止: <a href="${url}" target="_blank" rel="noopener" style="color:#6b7280;text-decoration:underline;">こちら</a></div>
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

/** HTML末尾（できれば </body> の直前）にフッターを「1回だけ」注入 */
function injectFooterOnce(html: string, footer: string) {
  const src = html || "";
  if (src.includes(FOOTER_MARK) || /data-email-footer/.test(src)) return src;
  const bodyClose = /<\/body\s*>/i;
  return bodyClose.test(src)
    ? src.replace(bodyClose, `${footer}\n</body>`)
    : `${src}\n${footer}`;
}

export async function sendMail(args: SendArgs) {
  const company = args.brandCompany || fallbackCompany;
  const address = args.brandAddress || fallbackAddress;
  const support = args.brandSupport || fallbackSupport;

  // 表示上の From アドレスは常に既定の送信ドメインを使う
  const displayFromAddress = defaultFrom;
  const fromHeader =
    company && displayFromAddress
      ? { name: company, address: displayFromAddress }
      : displayFromAddress;

  // 技術的送信者（SPF/バウンス整合）
  const senderHeader = defaultFrom;

  // 返信先は fromOverride を優先
  const replyToHeader = args.fromOverride || undefined;

  // Gmail 解除UI（URL + mailto + One-Click）
  const unsubHeaderUrl = buildUnsubUrlForHeader(args.unsubscribeToken);
  const unsubMailto = support ? `mailto:${support}` : undefined;

  const headers: Record<string, string> = {};
  if (unsubHeaderUrl) {
    headers["List-Unsubscribe"] = unsubMailto
      ? `<${unsubHeaderUrl}>, <${unsubMailto}>`
      : `<${unsubHeaderUrl}>`;
    headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
  }

  // 既存の“手書きフッター”や旧自動フッターを除去
  const sanitizedHtml = stripLegacyFooter(args.html, company, address, support);

  // 本文のフッター（本文末尾に 1 回だけ）
  const bodyUnsubUrl = buildUnsubUrlForBody(args.unsubscribeToken);
  const finalHtml = injectFooterOnce(
    sanitizedHtml,
    footerHtml(bodyUnsubUrl, company, address, support)
  );

  // テキスト本文もフッターを追記
  const text = (args.text ?? "").trim();
  const finalText = `${text ? text + "\n\n" : ""}${footerText(
    bodyUnsubUrl,
    company,
    address,
    support
  )}`;

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
