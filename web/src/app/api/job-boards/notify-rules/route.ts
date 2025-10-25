// web/src/app/api/job-boards/notify-rules/route.ts
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export async function GET() {
  const supabase = await supabaseServer();
  const { data, error } = await supabase
    .from("job_board_notify_rules")
    .select("id,email,sites,age_bands,employment_types,salary_bands,enabled")
    .order("created_at", { ascending: false });
  if (error)
    return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ rows: data ?? [] });
}

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const body = await req.json();
  const { data, error } = await supabase
    .from("job_board_notify_rules")
    .insert({ ...body })
    .select("id")
    .maybeSingle();
  if (error)
    return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, id: data?.id });
}
