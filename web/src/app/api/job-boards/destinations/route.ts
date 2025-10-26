// web/src/app/api/job-boards/destinations/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export async function GET() {
  const supabase = await supabaseServer();
  const { data: u } = await supabase.auth.getUser();
  if (!u?.user)
    return NextResponse.json({ error: "auth required" }, { status: 401 });

  const { data, error } = await supabase
    .from("job_board_destinations")
    .select("id, name, type, value, enabled")
    .eq("tenant_id", u.user.id)
    .order("created_at", { ascending: false });

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ rows: data ?? [] });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const supabase = await supabaseServer();
  const { data: u } = await supabase.auth.getUser();
  if (!u?.user)
    return NextResponse.json({ error: "auth required" }, { status: 401 });

  const row = {
    id: crypto.randomUUID(),
    tenant_id: u.user.id,
    name: String(body.name || "無題"),
    type: String(body.type || "email"),
    value: String(body.value || ""),
    enabled: Boolean(body.enabled ?? true),
  };
  if (!row.value)
    return NextResponse.json({ error: "value required" }, { status: 400 });

  const { error } = await supabase
    .from("job_board_destinations")
    .insert(row as any);
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id: row.id });
}
