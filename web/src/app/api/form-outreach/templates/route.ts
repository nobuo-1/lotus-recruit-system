// web/src/app/api/form-outreach/templates/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export async function GET() {
  const sb = await supabaseServer();
  const { data: u } = await sb.auth.getUser();
  if (!u?.user)
    return NextResponse.json({ error: "auth required" }, { status: 401 });

  const { data, error } = await sb
    .from("form_outreach_messages")
    .select("id, name, subject, body_text, body_html, created_at")
    .eq("tenant_id", u.user.id)
    .eq("channel", "template")
    .order("created_at", { ascending: false });

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ rows: data ?? [] });
}

export async function POST(req: NextRequest) {
  const sb = await supabaseServer();
  const { data: u } = await sb.auth.getUser();
  if (!u?.user)
    return NextResponse.json({ error: "auth required" }, { status: 401 });

  const body = await req.json();
  const row = {
    id: crypto.randomUUID(),
    tenant_id: u.user.id,
    name: String(body.name || "無題テンプレート"),
    subject: String(body.subject || ""),
    body_text: String(body.body_text || ""),
    body_html: String(body.body_html || ""),
    channel: "template" as const, // ← テンプレを channel=template で区別
    created_at: new Date().toISOString(),
  };

  const { error } = await sb.from("form_outreach_messages").insert(row as any);
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id: row.id });
}
