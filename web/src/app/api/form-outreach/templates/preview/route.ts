// web/src/app/api/form-outreach/templates/preview/route.ts
import { NextRequest, NextResponse } from "next/server";

type Dict = Record<string, string>;
const EXAMPLE: Dict = {
  company_name: "〇〇株式会社",
  person_name: "山田太郎 様",
  product_name: "採用自動化ツール",
};

function replaceVars(template: string, vars: Dict): string {
  return template.replace(
    /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g,
    (_: string, key: string) => {
      return vars[key] ?? `{{${key}}}`;
    }
  );
}

export async function POST(req: NextRequest) {
  const { body_text = "", body_html = "" } = await req.json();
  return NextResponse.json({
    text: replaceVars(String(body_text), EXAMPLE),
    html: replaceVars(String(body_html), EXAMPLE),
  });
}
