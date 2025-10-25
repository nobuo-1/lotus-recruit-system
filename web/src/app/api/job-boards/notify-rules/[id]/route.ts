// web/src/app/api/job-boards/notify-rules/[id]/route.ts
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export async function PUT(req: Request, ctx: { params: { id: string } }) {
  const sb = await supabaseServer();
  const patch = await req.json();
  const { error } = await sb
    .from("job_board_notify_rules")
    .update(patch)
    .eq("id", ctx.params.id);
  if (error)
    return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: { params: { id: string } }) {
  const sb = await supabaseServer();
  const { error } = await sb
    .from("job_board_notify_rules")
    .delete()
    .eq("id", ctx.params.id);
  if (error)
    return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
