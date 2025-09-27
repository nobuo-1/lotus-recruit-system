import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
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

  const { data, error } = await supabase
    .from("recipients")
    .select(
      "id,name,email,birthday,phone,region,gender,job_category_large,job_category_small,job_type,is_active"
    )
    .eq("id", params.id)
    .eq("tenant_id", tenant_id)
    .maybeSingle();

  if (error)
    return NextResponse.json({ error: error.message }, { status: 400 });
  if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });

  return NextResponse.json({ ok: true, row: data });
}
