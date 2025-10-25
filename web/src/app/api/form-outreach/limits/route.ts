// web/src/app/api/form-outreach/limits/route.ts
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

export async function GET() {
  const sb = await supabaseServer();
  const { data } = await sb
    .from("form_outreach_limits")
    .select("id, daily_limit, enabled")
    .limit(1);
  return NextResponse.json({ row: data?.[0] ?? null });
}
export async function POST(req: Request) {
  const { daily_limit, enabled } = await req.json();
  const sb = await supabaseServer();
  const { data } = await sb.from("form_outreach_limits").select("id").limit(1);
  if (data && data.length > 0) {
    await sb
      .from("form_outreach_limits")
      .update({ daily_limit, enabled })
      .eq("id", data[0].id);
  } else {
    await sb.from("form_outreach_limits").insert({ daily_limit, enabled });
  }
  const { data: after } = await sb
    .from("form_outreach_limits")
    .select("id, daily_limit, enabled")
    .limit(1);
  return NextResponse.json({ row: after?.[0] ?? null });
}
