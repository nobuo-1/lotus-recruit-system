// web/src/app/api/form-outreach/templates/preview/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

type PreviewBody = {
  templateId: string;
  vars?: Record<string, string>;
};

export async function POST(req: NextRequest) {
  try {
    const sb = await supabaseServer();
    const { data: u } = await sb.auth.getUser();
    if (!u?.user) return NextResponse.json({ ok: true, body: "" });

    const body = (await req.json()) as PreviewBody;
    const tplId: string = String(body?.templateId || "");
    if (!tplId) return NextResponse.json({ ok: true, body: "" });

    const { data: tpl, error } = await sb
      .from("form_outreach_messages")
      .select("name, subject, body_text, body_html")
      .eq("id", tplId)
      .maybeSingle();

    if (error) throw error;

    const vars: Record<string, string> = body?.vars || {};
    const src: string = (tpl?.body_html || tpl?.body_text || "") as string;

    const out = src.replace(
      /\{\{(\w+)\}\}/g,
      (match: string, key: string): string => {
        // マッチした {{key}} を vars[key] で置換。未定義は空文字。
        return Object.prototype.hasOwnProperty.call(vars, key)
          ? String(vars[key] ?? "")
          : "";
      }
    );

    return NextResponse.json({
      ok: true,
      body: out,
      title: (tpl?.name || tpl?.subject || "") as string,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: String(e?.message || e) },
      { status: 500 }
    );
  }
}
