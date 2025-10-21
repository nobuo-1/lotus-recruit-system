// web/src/server/mailer.ts
import nodemailer from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";

/* ========= Env & defaults ========= */
const host = process.env.SMTP_HOST!;
const port = Number(process.env.SMTP_PORT!);
const user = process.env.SMTP_USER || "";
const pass = process.env.SMTP_PASS || "";

const defaultFrom = process.env.FROM_EMAIL!; // 例: no-reply@lotus-d-transformation.com
const appUrl = (process.env.APP_URL || "http://localhost:3000").replace(
  /\/+$/,
  ""
);

const dkimDomain = process.env.DKIM_DOMAIN || "";
const dkimSelector = process.env.DKIM_SELECTOR || "";
const dkimKey =
  process.env.DKIM_PRIVATE_KEY ||
  (process.env.DKIM_PRIVATE_KEY_B64
    ? Buffer.from(process.env.DKIM_PRIVATE_KEY_B64, "base64").toString("utf8")
    : "");

const requireTLS =
  (process.env.SMTP_REQUIRE_TLS ?? "true").toLowerCase() !== "false";

const fallbackCompany = process.env.COMPANY_NAME ?? "Lotus Recruit System";
const fallbackAddress = process.env.COMPANY_ADDRESS ?? "";
const fallbackSupport =
  process.env.SUPPORT_EMAIL ?? "no.no.mu.mu11223@gmail.com";

const CARD_MARK = "<!--EMAIL_CARD_START-->";

export type SendArgs = {
  to: string;
  subject: string;
  html?: string; // ← 任意に変更（プレーンは text のみでOK）
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

export async function sendMail(args: SendArgs) {
  const company = args.brandCompany || fallbackCompany;
  const address = args.brandAddress || fallbackAddress;
  const support = args.brandSupport || fallbackSupport;

  const fromHeader = { name: company, address: defaultFrom };
  const senderHeader = defaultFrom;
  const replyToHeader = args.fromOverride || undefined;

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

  // ★ HTML はある時だけ付ける（空文字は外す）
  const finalHtml =
    typeof args.html === "string" && args.html.trim()
      ? stripLegacyFooter(args.html)
      : undefined;

  const finalText = args.text && args.text.trim() ? args.text : undefined;

  const info = await transporter.sendMail({
    from: fromHeader,
    sender: senderHeader,
    replyTo: replyToHeader,
    to: args.to,
    subject: args.subject,
    html: finalHtml, // ← undefined なら HTML パートは付かない
    text: finalText, // ← text のみで送れる（プレーンメール用）
    headers,
    envelope: { from: senderHeader, to: args.to },
  });

  return info;
}
