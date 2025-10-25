// web/src/app/api/job-boards/site-selection/route.ts
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

export async function GET() {
  const sb = await supabaseServer();
  const { data } = await sb
    .from("job_board_site_selection")
    .select("key, enabled")
    .order("key");
  return NextResponse.json({ sites: data ?? [] });
}
export async function POST(req: Request) {
  const { key } = await req.json();
  const sb = await supabaseServer();
  // toggle
  const { data: cur } = await sb
    .from("job_board_site_selection")
    .select("enabled")
    .eq("key", key)
    .maybeSingle();
  const next = !(cur?.enabled ?? false);
  await sb
    .from("job_board_site_selection")
    .upsert({ key, enabled: next }, { onConflict: "key" });
  const { data } = await sb
    .from("job_board_site_selection")
    .select("key, enabled")
    .order("key");
  return NextResponse.json({ sites: data ?? [] });
}
