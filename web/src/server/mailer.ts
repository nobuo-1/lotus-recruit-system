// web/src/server/mailer.ts
import nodemailer from "nodemailer";

const host = process.env.SMTP_HOST!;
const port = Number(process.env.SMTP_PORT!);
const defaultFrom = process.env.FROM_EMAIL!;
const appUrl = process.env.APP_URL || "http://localhost:3000";

// 環境変数は最終フォールバックとしてのみ使用
const fallbackCompany = process.env.COMPANY_NAME ?? "Lotus Recruit System";
const fallbackAddress = process.env.COMPANY_ADDRESS ?? "";
const fallbackSupport = process.env.SUPPORT_EMAIL ?? "";

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

function escapeHtml(s: string) {
  return s.replace(
    /[&<>"']/g,
    (m) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[
        m
      ]!)
  );
}

function footerHtml(
  url: string,
  company: string,
  address?: string,
  support?: string
) {
  const addressHtml = address ? `<div>${escapeHtml(address)}</div>` : "";
  const supportHtml = support
    ? `<div>お問い合わせ: <a href="mailto:${support}">${support}</a></div>`
    : "";
  return `
<table role="presentation" width="100%" style="margin-top:24px;border-top:1px solid #e5e5e5">
  <tr>
    <td style="font:12px/1.6 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#666;padding-top:12px">
      <div>${escapeHtml(company)}</div>
      ${addressHtml}
      ${supportHtml}
      <div>配信停止: <a href="${url}" target="_blank" rel="noopener">こちら</a></div>
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

export async function sendMail(args: SendArgs) {
  const transporter = nodemailer.createTransport({ host, port, secure: false });

  // ブランド情報（テナント優先 → 環境変数）
  const company = args.brandCompany || fallbackCompany;
  const address = args.brandAddress || fallbackAddress;
  const support = args.brandSupport || fallbackSupport;

  // 差出人（キャンペーンやテナント設定の上書き優先）
  const from = args.fromOverride || defaultFrom;

  let unsubscribeUrl: string | null = null;
  const headers: Record<string, string> = {};
  if (args.unsubscribeToken) {
    unsubscribeUrl = `${appUrl}/api/unsubscribe?token=${encodeURIComponent(
      args.unsubscribeToken
    )}`;
    headers["List-Unsubscribe"] = `<${unsubscribeUrl}>`;
  }

  const finalHtml = unsubscribeUrl
    ? `${args.html}${footerHtml(unsubscribeUrl, company, address, support)}`
    : args.html;

  const finalText =
    (args.text ?? "") +
    (unsubscribeUrl
      ? `\n${footerText(unsubscribeUrl, company, address, support)}`
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
