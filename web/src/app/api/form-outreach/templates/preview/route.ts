// web/src/app/api/form-outreach/templates/preview/route.ts
import { NextResponse } from "next/server";

export const runtime = "edge";

// 置き換えのデモ値（必要ならフロントから上書き可能）
const DEFAULT_VARS = {
  sender_company: "ロートス株式会社",
  sender_name: "山田 太郎",
  recipient_company: "○○株式会社",
  website: "https://example.com",
  recipient_name: "採用ご担当者様",
  sender_phone: "03-1234-5678",
  sender_email: "sales@example.com",
};

type PreviewReq = {
  subject?: string | null;
  body_text?: string | null;
  body_html?: string | null;
  // 上書き用サンプル値（任意）
  sample?: Record<string, string>;
};

function replaceVars(
  src: string | null | undefined,
  vars: Record<string, string>
) {
  if (!src) return "";
  return src.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    return Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : "";
  });
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as PreviewReq;
    const vars = { ...DEFAULT_VARS, ...(body.sample || {}) };

    const subject = replaceVars(body.subject, vars);
    const text = replaceVars(body.body_text, vars);
    const html = replaceVars(body.body_html, vars);

    // text が無いときは html を落とし込んだ簡易テキストを返しておく
    const fallbackText =
      text ||
      html
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/p>/gi, "\n\n")
        .replace(/<[^>]+>/g, "");

    return NextResponse.json({
      subject,
      body_text: fallbackText,
      body_html: html,
      vars,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: String(e?.message || e) },
      { status: 400 }
    );
  }
}
