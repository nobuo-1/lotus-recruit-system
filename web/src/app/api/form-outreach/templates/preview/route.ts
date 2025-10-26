// web/src/app/api/form-outreach/templates/preview/route.ts
import { NextRequest, NextResponse } from "next/server";

function applyVars(tpl: string, vars: Record<string, string>) {
  let out = tpl || "";
  Object.entries(vars).forEach(([k, v]) => {
    const re = new RegExp(`{{\\s*${k}\\s*}}`, "g");
    out = out.replace(re, v);
  });
  return out;
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const sampleVars: Record<string, string> = {
    company_name: "〇〇株式会社",
    contact_name: "採用ご担当者様",
    sender_name: "山田太郎",
    website: "https://example.com",
  };

  // body.keys で上書きも許可（型 any を明示）
  if (body && typeof body === "object" && body.vars) {
    Object.entries(body.vars as Record<string, string>).forEach(
      ([key, val]) => {
        sampleVars[key] = String(val ?? "");
      }
    );
  }

  const text = applyVars(String(body.body_text || ""), sampleVars);
  const html = applyVars(String(body.body_html || ""), sampleVars);

  return NextResponse.json({ body_text: text, body_html: html });
}
