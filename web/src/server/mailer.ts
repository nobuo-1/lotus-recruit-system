// web/src/server/mailer.ts
import nodemailer from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";

/* ========= Env & defaults ========= */
const host = process.env.SMTP_HOST!;
const port = Number(process.env.SMTP_PORT!);
const user = process.env.SMTP_USER || "";
const pass = process.env.SMTP_PASS || "";

// FROM_EMAIL に display 名が入っていても envelope 用に純アドレスを抽出
const rawFrom = process.env.FROM_EMAIL!; // 例: 'Lotus Recruit <no-reply@lotus-d-transformation.com>'
const defaultFromAddress = rawFrom.match(/<([^>]+)>/)?.[1] || rawFrom; // -> no-reply@...

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

export type SendArgs = {
  to: string;
  subject: string;
  html: string;
  text?: string;
  unsubscribeToken?: string;

  // 表示上の差出人（Reply-To として扱う）
  fromOverride?: string;

  brandCompany?: string;
  brandAddress?: string;
  brandSupport?: string;
};

// 可能ならコネクションは再利用
const transporter = nodemailer.createTransport({
  pool: true,
  maxConnections: 3,
  maxMessages: 50,
  host,
  port,
  secure: port === 465, // 465=implicit TLS / 587=STARTTLS
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

// 配信停止URL（List-Unsubscribe ヘッダー用）
function buildUnsubscribeUrl(token?: string | null) {
  if (!token) return null;
  return `${appUrl}/api/unsubscribe?token=${encodeURIComponent(token)}`;
}

export async function sendMail(args: SendArgs) {
  // ブランド表示名（表示名だけ利用。本文への会社情報は API 側で埋め込み済み）
  const company = args.brandCompany || fallbackCompany;
  const support = args.brandSupport || fallbackSupport;

  // 表示上の From（ブランド名 + 自ドメインアドレス）
  const fromHeader =
    company && defaultFromAddress
      ? { name: company, address: defaultFromAddress }
      : defaultFromAddress;

  // 技術的送信者（MAIL FROM / SPF / Sender）— 自ドメインで固定
  const senderHeader = defaultFromAddress;

  // 返信先はユーザー入力を尊重（DMARC 影響なし）
  const replyToHeader = args.fromOverride || undefined;

  // Gmail の「解除」用ヘッダー（One-Click + mailto 併記）
  const unsubscribeUrl = buildUnsubscribeUrl(args.unsubscribeToken ?? null);
  const headers: Record<string, string> = {};
  if (unsubscribeUrl) {
    const mailto = support ? `, <mailto:${support}>` : "";
    headers["List-Unsubscribe"] = `<${unsubscribeUrl}>${mailto}`;
    headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
  }

  // ★本文は改変しない（フッターは API 側で本文末尾に埋め込み済み）
  const info = await transporter.sendMail({
    from: fromHeader,
    sender: senderHeader,
    replyTo: replyToHeader,
    to: args.to,
    subject: args.subject,
    html: args.html,
    text: args.text || undefined,
    headers,
    // SPF/バウンス整合のため envelope も自ドメイン固定
    envelope: { from: senderHeader, to: args.to },
  });

  return info;
}
