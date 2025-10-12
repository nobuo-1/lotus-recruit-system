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
const fallbackSupport =
  process.env.SUPPORT_EMAIL ?? "no.no.mu.mu11223@gmail.com";

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

// 配信停止URL（ヘッダー用）
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

/** “折りたたみ回避”のカード型フッター（最小・後方互換用）。route 側で既に付与されていれば何もしない */
function footerHtmlCard(opts: {
  url: string;
  company?: string;
  address?: string;
  support?: string;
  recipient?: string;
}) {
  const { url, company, address, support, recipient } = opts;
  const lineCompany = company
    ? `<div style="font-weight:600;font-size:14px;color:#111827;">${escapeHtml(
        company
      )}</div>`
    : "";
  const lineAddress = address
    ? `<div style="margin-top:4px;">${escapeHtml(address)}</div>`
    : "";
  const lineWho =
    recipient || company
      ? `<div style="margin-top:8px;">このメールは ${
          company ? escapeHtml(company) : "弊社"
        } から <span style="white-space:nowrap">${escapeHtml(
          recipient || ""
        )}</span> 宛にお送りしています。</div>`
      : "";
  const lineSupport = support
    ? `<div style="margin-top:8px;">お問い合わせ: <a href="mailto:${escapeHtml(
        support
      )}" style="color:#0a66c2;text-decoration:underline;">${escapeHtml(
        support
      )}</a></div>`
    : "";
  const lineUnsub = `<div style="margin-top:8px;">配信停止: <a href="${url}" target="_blank" rel="noopener" style="color:#0a66c2;text-decoration:underline;">こちら</a></div>`;

  return `${FOOTER_MARK}
<table role="presentation" width="100%" style="margin-top:24px;">
  <tr>
    <td data-email-footer style="font:14px/1.7 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111827;">
      <table role="presentation" width="100%" style="border-radius:12px;background:#f9fafb;padding:16px;">
        <tr><td>
          ${lineCompany}
          ${lineAddress}
          ${lineWho}
          ${lineSupport}
          ${lineUnsub}
        </td></tr>
      </table>
    </td>
  </tr>
</table>`;
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

export async function sendMail(args: SendArgs) {
  // ブランド情報（テナント優先 → フォールバック）
  const company = args.brandCompany || fallbackCompany;
  const address = args.brandAddress || fallbackAddress;
  const support = args.brandSupport || fallbackSupport;

  // --- DMARC 整合（From を自ドメインに固定） ---
  const fromHeader = { name: company, address: defaultFrom };
  const senderHeader = defaultFrom;
  const replyToHeader = args.fromOverride || undefined;

  // Unsubscribe（HTTPS One-Click + mailto の両方を用意）
  const unsubscribeUrl = buildUnsubscribeUrl(args.unsubscribeToken ?? null);
  const headers: Record<string, string> = {};
  if (unsubscribeUrl) {
    const mailto = support ? `, <mailto:${support}>` : "";
    headers["List-Unsubscribe"] = `<${unsubscribeUrl}>${mailto}`;
    headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
  }

  // --- 本文クリーン ---
  let finalHtml = stripLegacyFooter(args.html);
  let finalText = (args.text ?? "").replace(
    /\{\{\s*UNSUB_URL\s*\}\}|__UNSUB_URL__|%%UNSUB_URL%%/gi,
    ""
  );

  // route 側でフッター付与済みなら何もしない。付与されていないメール（後方互換）には最小フッターを補完。
  if (unsubscribeUrl && !finalHtml.includes(FOOTER_MARK)) {
    const htmlFooter = footerHtmlCard({
      url: unsubscribeUrl,
      company,
      address,
      support,
      recipient: args.to,
    });
    finalHtml = injectFooterOnce(finalHtml, htmlFooter);
    // text も最低限補完
    const lines = [
      company || "",
      address || "",
      args.to
        ? `このメールは ${company || "弊社"} から ${
            args.to
          } 宛にお送りしています。`
        : "",
      support ? `お問い合わせ: ${support}` : "",
      `配信停止: ${unsubscribeUrl}`,
    ].filter(Boolean);
    finalText = finalText
      ? `${finalText}\n\n${lines.join("\n")}`
      : lines.join("\n");
  }

  // （重要）開封ピクセルは route 側で一度だけ注入する方針に統一

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
