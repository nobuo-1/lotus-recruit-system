// web/src/app/api/form-outreach/messages/route.ts
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export async function GET() {
  const sb = await supabaseServer();
  const { data: u } = await sb.auth.getUser();
  if (!u?.user)
    return NextResponse.json({ error: "auth required" }, { status: 401 });

  // 送信済みメッセージ（テンプレ配布物）を取得
  const { data, error } = await sb
    .from("form_outreach_messages")
    .select("id, name, subject, email, form_url, status, error, sent_at")
    .eq("tenant_id", u.user.id)
    .neq("channel", "template")
    .order("sent_at", { ascending: false });

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ rows: data ?? [] });
}
