// web/src/app/api/form-outreach/senders/route.ts
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export async function GET() {
  const supabase = await supabaseServer();
  const { data, error } = await supabase
    .from("form_outreach_senders")
    .select("id,company_name,sender_name,sender_email,website_url")
    .limit(1);
  if (error)
    return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ row: (data ?? [])[0] ?? null });
}

export async function PUT(req: Request) {
  const supabase = await supabaseServer();
  const body = await req.json();
  // 既存があれば update、なければ insert。テナント一意制約により常に1件化される。
  const { data: existing } = await supabase
    .from("form_outreach_senders")
    .select("id")
    .limit(1);
  if ((existing ?? []).length > 0) {
    const id = existing![0].id;
    const { error } = await supabase
      .from("form_outreach_senders")
      .update(body)
      .eq("id", id);
    if (error)
      return NextResponse.json({ error: error.message }, { status: 400 });
  } else {
    const { error } = await supabase.from("form_outreach_senders").insert(body);
    if (error)
      return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
