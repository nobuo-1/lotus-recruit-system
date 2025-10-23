// web/src/server/mailer.ts
import nodemailer from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/* ========= Env & defaults ========= */
const host = process.env.SMTP_HOST!;
const port = Number(process.env.SMTP_PORT!);
const user = process.env.SMTP_USER || "";
const pass = process.env.SMTP_PASS || "";

const defaultFrom = process.env.FROM_EMAIL!;
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
  cc?: string;
  attachments?: Array<{ filename: string; path: string; contentType?: string }>;

  /** ↓↓↓ 追加：送信前の存在チェック（キャンセル済みなら送らない） */
  deliveryId?: string; // campaigns.deliveries.id
  mailDeliveryId?: string; // mails.mail_deliveries.id
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
  // ===== キャンセル防止：送信直前チェック =====
  try {
    const admin = supabaseAdmin();
    if (args.mailDeliveryId) {
      const { data } = await admin
        .from("mail_deliveries")
        .select("id")
        .eq("id", args.mailDeliveryId)
        .maybeSingle();
      if (!data) {
        return {
          messageId: "skipped:mail_cancelled",
          accepted: [],
          rejected: [],
          response: "SKIPPED_MAIL_CANCELLED",
        } as any;
      }
    } else if (args.deliveryId) {
      const { data } = await admin
        .from("deliveries")
        .select("id")
        .eq("id", args.deliveryId)
        .maybeSingle();
      if (!data) {
        return {
          messageId: "skipped:campaign_cancelled",
          accepted: [],
          rejected: [],
          response: "SKIPPED_CAMPAIGN_CANCELLED",
        } as any;
      }
    }
  } catch {
    // 失敗しても送信は継続（チェック不能時は送る）
  }

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

  const finalHtml = stripLegacyFooter(args.html);
  const finalText = args.text && args.text.trim() ? args.text : undefined;

  const info = await transporter.sendMail({
    from: fromHeader,
    sender: senderHeader,
    replyTo: replyToHeader,
    to: args.to,
    cc: args.cc || undefined,
    subject: args.subject,
    html: finalHtml,
    text: finalText,
    headers,
    attachments: (args.attachments ?? []).map((a) => ({
      filename: a.filename,
      path: a.path,
      contentType: a.contentType,
    })),
    envelope: { from: senderHeader, to: args.to },
  });

  return info;
}
