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

// 任意: DKIM（用意がある場合のみ）
const dkimDomain = process.env.DKIM_DOMAIN || "";
const dkimSelector = process.env.DKIM_SELECTOR || "";
const dkimKey =
  process.env.DKIM_PRIVATE_KEY ||
  (process.env.DKIM_PRIVATE_KEY_B64
    ? Buffer.from(process.env.DKIM_PRIVATE_KEY_B64, "base64").toString("utf8")
    : "");

// TLS
const requireTLS =
  (process.env.SMTP_REQUIRE_TLS ?? "true").toLowerCase() !== "false";

// 既定ブランド（不足分のフォールバック）
const fallbackCompany = process.env.COMPANY_NAME ?? "Lotus Recruit System";
const fallbackAddress = process.env.COMPANY_ADDRESS ?? "";
const fallbackSupport =
  process.env.SUPPORT_EMAIL ?? "no.no.mu.mu11223@gmail.com";

// “本文はカード化済みか”の判定マーカー（route 側で付与）
const CARD_MARK = "<!--EMAIL_CARD_START-->";

export type SendArgs = {
  to: string;
  subject: string;
  html: string; // route 側でカード化済みを想定
  text?: string;
  unsubscribeToken?: string;

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
  tls: { servername: host, minVersion: "TLSv1.2" },
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

// -------- helpers ----------
function stripLegacyFooter(html: string) {
  if (!html) return "";
  let out = html;
  // 手書きフッターやテンプレ残骸を掃除
  out = out.replace(
    /\{\{\s*UNSUB_URL\s*\}\}|__UNSUB_URL__|%%UNSUB_URL%%/gi,
    ""
  );
  out = out.replace(/<!--EMAIL_FOOTER_START-->[\s\S]*?<\/table>\s*/gi, "");
  out = out.replace(
    /<[^>]+data-email-footer[^>]*>[\s\S]*?<\/td>\s*<\/tr>\s*<\/table>\s*/gi,
    ""
  );
  // hr/細罫線の末尾フッター風パターンを軽く除去
  out = out.replace(/<table[^>]*?border-top:[^>]*?>[\s\S]*?<\/table>\s*$/i, "");
  return out;
}

export async function sendMail(args: SendArgs) {
  const company = args.brandCompany || fallbackCompany;
  const address = args.brandAddress || fallbackAddress;
  const support = args.brandSupport || fallbackSupport;

  // DMARC整合（From を自ドメイン）
  const fromHeader = { name: company, address: defaultFrom };
  const senderHeader = defaultFrom;
  const replyToHeader = args.fromOverride || undefined;

  // List-Unsubscribe
  const headers: Record<string, string> = {};
  const unsubUrl = args.unsubscribeToken
    ? `${appUrl}/api/unsubscribe?token=${encodeURIComponent(
        args.unsubscribeToken
      )}`
    : null;
  if (unsubUrl) {
    const mailto = support ? `, <mailto:${support}>` : "";
    headers["List-Unsubscribe"] = `<${unsubUrl}>${mailto}`;
    headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
  }

  // route 側で“カード化”済み前提。念のため旧フッター掃除のみ。
  const finalHtml = stripLegacyFooter(args.html);
  const finalText = args.text && args.text.trim() ? args.text : undefined;

  // ここでは一切フッターを追加しない（重複防止）
  // ※ CARD_MARK が含まれている想定（なくても送信はする）

  const info = await transporter.sendMail({
    from: fromHeader,
    sender: senderHeader,
    replyTo: replyToHeader,
    to: args.to,
    subject: args.subject,
    html: finalHtml,
    text: finalText,
    headers,
    envelope: { from: senderHeader, to: args.to },
  });

  return info;
}
