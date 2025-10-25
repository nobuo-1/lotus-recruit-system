// web/src/app/api/job-boards/notify-rules/[id]/route.ts
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export async function PUT(req: Request, ctx: { params: { id: string } }) {
  const supabase = await supabaseServer();
  const body = await req.json();
  const { error } = await supabase
    .from("job_board_notify_rules")
    .update(body)
    .eq("id", ctx.params.id);
  if (error)
    return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: { params: { id: string } }) {
  const supabase = await supabaseServer();
  const { error } = await supabase
    .from("job_board_notify_rules")
    .delete()
    .eq("id", ctx.params.id);
  if (error)
    return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
