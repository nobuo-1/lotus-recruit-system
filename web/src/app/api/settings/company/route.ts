import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

async function getTenantId(supabase: any, userId: string) {
  try {
    const { data: t } = await supabase.rpc("current_tenant_id");
    if (t) return t as string;
  } catch {}
  const { data: prof } = await supabase
    .from("profiles")
    .select("tenant_id")
    .eq("id", userId)
    .maybeSingle();
  return prof?.tenant_id ?? null;
}

export async function GET() {
  const supabase = await supabaseServer();
  const { data: u } = await supabase.auth.getUser();
  const userId = u?.user?.id;
  if (!userId)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const tenantId = await getTenantId(supabase, userId);
  if (!tenantId)
    return NextResponse.json({ error: "no tenant" }, { status: 400 });

  const { data } = await supabase
    .from("org_settings")
    .select("company_name, company_address, support_email")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  // 環境変数はフォールバック（未設定でもnull返す）
  return NextResponse.json({
    company_name: data?.company_name ?? process.env.COMPANY_NAME ?? "",
    company_address: data?.company_address ?? process.env.COMPANY_ADDRESS ?? "",
    support_email: data?.support_email ?? process.env.SUPPORT_EMAIL ?? "",
  });
}

export async function PUT(req: Request) {
  const supabase = await supabaseServer();
  const { data: u } = await supabase.auth.getUser();
  const userId = u?.user?.id;
  if (!userId)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const tenantId = await getTenantId(supabase, userId);
  if (!tenantId)
    return NextResponse.json({ error: "no tenant" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const company_name = (body.company_name ?? "").toString().trim();
  const company_address =
    (body.company_address ?? "").toString().trim() || null;
  const support_email = (body.support_email ?? "").toString().trim() || null;

  if (support_email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(support_email)) {
    return NextResponse.json(
      { error: "invalid support_email" },
      { status: 400 }
    );
  }

  const { error } = await supabase
    .from("org_settings")
    .upsert({
      tenant_id: tenantId,
      company_name,
      company_address,
      support_email,
    });

  if (error)
    return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
