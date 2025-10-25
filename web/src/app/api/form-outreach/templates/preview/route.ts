// web/src/app/api/form-outreach/templates/preview/route.ts
import { NextResponse } from "next/server";

type PreviewReq = {
  template: string;
  vars?: Record<string, string | number | null | undefined>;
};

export async function POST(req: Request) {
  const body = (await req.json()) as PreviewReq;
  const tpl = String(body.template ?? "");
  const vars = (body.vars ?? {}) as Record<string, any>;

  const preview = tpl.replace(
    /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g,
    (_m: string, key: string) => {
      const v = vars[key];
      return v === null || v === undefined ? `{{${key}}}` : String(v);
    }
  );

  return NextResponse.json({ preview });
}
