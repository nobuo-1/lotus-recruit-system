// web/src/app/api/form-outreach/templates/[id]/route.ts
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

export async function PUT(
  req: Request,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  const body = await req.json(); // {name, body_text}
  const sb = await supabaseServer();
  await sb.from("form_outreach_messages").update(body).eq("id", id);
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  req: Request,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  const sb = await supabaseServer();
  await sb.from("form_outreach_messages").delete().eq("id", id);
  return NextResponse.json({ ok: true });
}
