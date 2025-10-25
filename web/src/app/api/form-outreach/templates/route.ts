// web/src/app/api/form-outreach/templates/route.ts
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
export const dynamic = "force-dynamic";

export async function GET() {
  const sb = await supabaseServer();
  const { data } = await sb
    .from("form_outreach_messages")
    .select("id, name, body_text")
    .order("created_at", { ascending: false })
    .limit(200);
  return NextResponse.json({ rows: data ?? [] });
}

export async function POST(req: Request) {
  const body = await req.json(); // {name, body_text}
  const sb = await supabaseServer();
  await sb
    .from("form_outreach_messages")
    .insert({ name: body.name, body_text: body.body_text });
  return NextResponse.json({ ok: true });
}
