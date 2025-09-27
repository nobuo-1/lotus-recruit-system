export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

// 現在の設定を取得
export async function GET() {
  try {
    const supabase = await supabaseServer();
    const { data: u } = await supabase.auth.getUser();
    if (!u?.user) return NextResponse.json({}, { status: 401 });

    const { data: prof } = await supabase
      .from("profiles")
      .select("tenant_id")
      .eq("id", u.user.id)
      .maybeSingle();
    const tenantId = prof?.tenant_id as string | undefined;
    if (!tenantId) return NextResponse.json({}, { status: 200 });

    const { data: t } = await supabase
      .from("tenants")
      .select("company_name, company_address, support_email, from_email")
      .eq("id", tenantId)
      .maybeSingle();

    return NextResponse.json(t ?? {});
  } catch {
    return NextResponse.json({}, { status: 200 });
  }
}

// 保存（405対策：POST 実装）
export async function POST(req: Request) {
  try {
    const supabase = await supabaseServer();
    const body = await req.json();

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

    const payload = {
      company_name: String(body?.company_name ?? ""),
      company_address: String(body?.company_address ?? ""),
      support_email: String(body?.support_email ?? ""),
      from_email: String(body?.from_email ?? ""),
    };

    const { error } = await supabase
      .from("tenants")
      .update(payload)
      .eq("id", tenantId);

    if (error)
      return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "server error" },
      { status: 500 }
    );
  }
}
