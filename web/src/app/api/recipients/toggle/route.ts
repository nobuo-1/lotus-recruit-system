import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export async function POST(req: Request) {
  const { id, is_active } = await req.json();
  if (!id || typeof is_active !== "boolean") {
    return NextResponse.json({ error: "invalid payload" }, { status: 400 });
  }

  const supabase = await supabaseServer();
  const { data: u } = await supabase.auth.getUser();
  if (!u?.user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: prof } = await supabase
    .from("profiles")
    .select("tenant_id")
    .eq("id", u.user.id)
    .maybeSingle();
  const tenant_id = prof?.tenant_id;

  const { error } = await supabase
    .from("recipients")
    .update({ is_active })
    .eq("id", id)
    .eq("tenant_id", tenant_id);

  if (error)
    return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
