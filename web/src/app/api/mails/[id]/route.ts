// web/src/app/api/mails/[id]/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export async function GET(
  _: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const sb = await supabaseServer();
  const { data: u } = await sb.auth.getUser();
  if (!u?.user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const { data, error } = await sb
    .from("mails")
    .select("id, name, subject, body_text, status, created_at")
    .eq("id", id)
    .maybeSingle();

  if (error)
    return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ row: data });
}
