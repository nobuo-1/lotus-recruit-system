// web/src/app/api/form-outreach/senders/route.ts
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export async function GET() {
  const sb = await supabaseServer();
  const { data, error } = await sb
    .from("form_outreach_senders")
    .select(
      "id,from_name,from_email,reply_to,phone,website,signature,is_default"
    )
    .eq("is_default", true)
    .limit(1);
  if (error)
    return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ row: (data ?? [])[0] ?? null });
}

export async function PUT(req: Request) {
  const sb = await supabaseServer();
  const body = await req.json();

  // 既定行があれば update、無ければ insert（部分ユニークindexにより is_default=true はテナントで1件）
  const { data } = await sb
    .from("form_outreach_senders")
    .select("id")
    .eq("is_default", true)
    .limit(1);

  if ((data ?? []).length > 0) {
    const id = data![0].id as string;
    const { error } = await sb
      .from("form_outreach_senders")
      .update(body)
      .eq("id", id);
    if (error)
      return NextResponse.json({ error: error.message }, { status: 400 });
  } else {
    const { error } = await sb
      .from("form_outreach_senders")
      .insert({ ...body, is_default: true });
    if (error)
      return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
