// web/src/server/mailer.ts
import nodemailer from "nodemailer";

// ========= Env & defaults =========
const host = process.env.SMTP_HOST!;
const port = Number(process.env.SMTP_PORT!);
const defaultFrom = process.env.FROM_EMAIL!;
const appUrl = process.env.APP_URL || "http://localhost:3000";

// 「設定が未入力のとき」に使うフォールバック
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

  // テナントごとの上書き（任意）
  fromOverride?: string;
  brandCompany?: string;
  brandAddress?: string;
  brandSupport?: string;
};

// 可能ならコネクションはモジュールスコープで再利用
const transporter = nodemailer.createTransport({
  host,
  port,
  secure: port === 465, // 465 のときのみ TLS
});

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

/** 既存テンプレに入っている“手書きフッター＋{{UNSUB_URL}}”を丸ごと除去 */
function stripLegacyFooter(
  html: string,
  company: string,
  address?: string,
  support?: string
) {
  let out = html || "";

  // 置換対象となるアンsubscribeトークン表記の候補
  const TOKEN = String.raw`(?:\{\{\s*UNSUB_URL\s*\}\}|\[\[\s*UNSUB_URL\s*\]\]|__UNSUB_URL__|%%UNSUB_URL%%)`;

  // 「会社名」「住所」「お問い合わせ」「配信停止: {{UNSUB_URL}}」の並びを弱結合で一括除去
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

  const legacyRe = new RegExp(`${comp}${addr}${sup}${unsub}`, "i");
  out = out.replace(legacyRe, "");

  // 念のため、残っている {{UNSUB_URL}} を含む行（div/p/素の行）も除去
  const tokenLine = new RegExp(
    String.raw`\s*(?:<div[^>]*>|<p[^>]*>)?[^<\n]*${TOKEN}[^<\n]*(?:</div>|</p>)?\s*`,
    "ig"
  );
  out = out.replace(tokenLine, "");

  // プレーンに残ったトークンも空文字化
  out = out.replace(new RegExp(TOKEN, "ig"), "");

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

export async function sendMail(args: SendArgs) {
  // ブランド情報（テナント優先 → フォールバック）
  const company = args.brandCompany || fallbackCompany;
  const address = args.brandAddress || fallbackAddress;
  const support = args.brandSupport || fallbackSupport;

  // 差出人（キャンペーンやテナント設定の上書き優先）
  const from = args.fromOverride || defaultFrom;

  // 配信停止URL & ヘッダ
  const unsubscribeUrl = buildUnsubscribeUrl(args.unsubscribeToken ?? null);
  const headers: Record<string, string> = {};
  if (unsubscribeUrl) {
    headers["List-Unsubscribe"] = `<${unsubscribeUrl}>`;
    headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
  }

  // --- ① まず既存の“手書きフッター”を削除 ---
  const sanitizedHtml = stripLegacyFooter(args.html, company, address, support);

  // --- ② 自動フッターを1回だけ注入 ---
  const finalHtml = unsubscribeUrl
    ? injectFooterOnce(
        sanitizedHtml,
        footerHtml(unsubscribeUrl, company, address, support)
      )
    : sanitizedHtml;

  // テキストは末尾にフッターを足す（既存トークンは掃除）
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
    from,
    to: args.to,
    subject: args.subject,
    html: finalHtml,
    text: finalText || undefined,
    headers,
  });

  return info;
}
