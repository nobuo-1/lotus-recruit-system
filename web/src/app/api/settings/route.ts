// web/src/app/api/email/settings/route.ts
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export async function GET() {
  const supabase = await supabaseServer();
  const { data: u } = await supabase.auth.getUser();
  if (!u?.user) return NextResponse.json({ ok: false, settings: null });

  const { data: prof } = await supabase
    .from("profiles")
    .select("tenant_id")
    .eq("id", u.user.id)
    .maybeSingle();

  const tenantId = prof?.tenant_id as string | undefined;
  if (!tenantId) return NextResponse.json({ ok: false, settings: null });

  const { data } = await supabase
    .from("tenants")
    .select("from_email, company_name, company_address, support_email")
    .eq("id", tenantId)
    .maybeSingle();

  return NextResponse.json({ ok: true, settings: data ?? null });
}

export async function POST(req: Request) {
  try {
    const supabase = await supabaseServer();
    const { data: u } = await supabase.auth.getUser();
    if (!u?.user)
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const { data: prof } = await supabase
      .from("profiles")
      .select("tenant_id")
      .eq("id", u.user.id)
      .maybeSingle();
    const tenantId = prof?.tenant_id as string | undefined;
    if (!tenantId)
      return NextResponse.json({ error: "no tenant" }, { status: 400 });

    const payload = (await req.json()) as {
      from_email?: string;
      company_name?: string;
      company_address?: string;
      support_email?: string;
    };

    await supabase
      .from("tenants")
      .update({
        from_email: payload.from_email ?? null,
        company_name: payload.company_name ?? null,
        company_address: payload.company_address ?? null,
        support_email: payload.support_email ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", tenantId);

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "server error" },
      { status: 500 }
    );
  }
}
