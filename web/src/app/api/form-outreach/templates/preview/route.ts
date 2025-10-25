// web/src/app/api/form-outreach/templates/preview/route.ts
import { NextResponse } from "next/server";

type Vars = Record<string, string>;

function applyVars(template: string, vars: Vars): string {
  let out = template || "";
  for (const [key, val] of Object.entries(vars)) {
    const re = new RegExp(String.raw`\{\{\s*${key}\s*\}\}`, "g");
    out = out.replace(re, val ?? "");
  }
  return out;
}

export async function POST(req: Request) {
  const body = (await req.json()) as { template?: string; vars?: Vars };
  const tpl = body?.template ?? "";
  const vars = body?.vars ?? {};
  const preview = applyVars(tpl, vars);
  return NextResponse.json({ preview });
}
