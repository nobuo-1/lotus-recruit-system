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
