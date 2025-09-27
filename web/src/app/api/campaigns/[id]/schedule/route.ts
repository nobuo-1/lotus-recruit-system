import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const { when } = await req.json();
  if (!when)
    return NextResponse.json({ error: "when required" }, { status: 400 });

  const dt = new Date(when);
  if (isNaN(dt.getTime()))
    return NextResponse.json({ error: "invalid datetime" }, { status: 400 });

  const supabase = await supabaseServer();
  const { data: u } = await supabase.auth.getUser();
  if (!u?.user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { error } = await supabase
    .from("campaigns")
    .update({ status: "scheduled", scheduled_at: dt.toISOString() })
    .eq("id", params.id);

  if (error)
    return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, scheduled_at: dt.toISOString() });
}
