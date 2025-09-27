// web/src/app/api/settings/brand/route.ts
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export async function GET() {
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

  const { data: brand } = await supabase
    .from("tenants")
    .select("company_name, company_address, support_email, from_email")
    .eq("id", tenant_id)
    .maybeSingle();

  return NextResponse.json({ ok: true, brand: brand ?? {} });
}

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: u } = await supabase.auth.getUser();
  if (!u?.user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json();
  const { company_name, company_address, support_email, from_email } =
    body || {};

  const { data: prof } = await supabase
    .from("profiles")
    .select("tenant_id")
    .eq("id", u.user.id)
    .maybeSingle();
  const tenant_id = prof?.tenant_id;
  if (!tenant_id)
    return NextResponse.json({ error: "no tenant" }, { status: 400 });

  const { error } = await supabase
    .from("tenants")
    .update({
      company_name,
      company_address,
      support_email,
      from_email,
    })
    .eq("id", tenant_id);

  if (error)
    return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
