// web/src/app/api/form-outreach/limits/route.ts（GET/POSTは差し替え）
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
export const dynamic = "force-dynamic";

export async function GET() {
  const sb = await supabaseServer();
  const { data } = await sb.from("form_outreach_limits").select("*").limit(1);
  return NextResponse.json({ row: data?.[0] ?? null });
}
export async function POST(req: Request) {
  const body = await req.json();
  const sb = await supabaseServer();
  const { data } = await sb.from("form_outreach_limits").select("id").limit(1);
  if (data && data.length) {
    await sb.from("form_outreach_limits").update(body).eq("id", data[0].id);
  } else {
    await sb.from("form_outreach_limits").insert(body);
  }
  const { data: after } = await sb
    .from("form_outreach_limits")
    .select("*")
    .limit(1);
  return NextResponse.json({ row: after?.[0] ?? null });
}
