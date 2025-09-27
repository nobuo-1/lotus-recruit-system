import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export async function POST(req: Request) {
  const body = await req.json();
  const { id, ...fields } = body || {};

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
  if (!tenant_id)
    return NextResponse.json({ error: "no tenant" }, { status: 400 });

  if (id) {
    const { error } = await supabase
      .from("recipients")
      .update(fields)
      .eq("id", id)
      .eq("tenant_id", tenant_id);
    if (error)
      return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, id });
  } else {
    const payload = { ...fields, tenant_id };
    const { data, error } = await supabase
      .from("recipients")
      .insert(payload)
      .select("id")
      .single();
    if (error)
      return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, id: data?.id });
  }
}
