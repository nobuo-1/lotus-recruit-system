// web/src/app/api/form-outreach/send/route.ts
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { mode, prospectIds, templateId } = await req.json();
  const sb = await supabaseServer();

  // テンプレ取得
  const { data: tpl } = await sb
    .from("form_outreach_messages")
    .select("id, name, body_text")
    .eq("id", templateId)
    .maybeSingle();

  if (!tpl)
    return NextResponse.json({ error: "template not found" }, { status: 400 });

  // 送信ジョブとして登録（ここでは runs に1件 + 宛先は別テーブルに積むなど、最小実装）
  await sb.from("form_outreach_runs").insert({
    kind: mode, // form | email
    status: "queued",
    note: `template=${tpl.name}, targets=${(prospectIds ?? []).length}`,
  });

  return NextResponse.json({ ok: true });
}
