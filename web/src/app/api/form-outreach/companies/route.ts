import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export async function GET(req: Request) {
  try {
    const tenantId = req.headers.get("x-tenant-id") ?? "";
    if (!tenantId) {
      return NextResponse.json({ error: "missing tenant id" }, { status: 400 });
    }
    const sb = await supabaseServer();

    // 必要フィールドのみselect。nullsLastはorderのオプションで扱い、列としてselectしない。
    const { data, error } = await sb
      .from("form_prospects")
      .select(
        "id, tenant_id, source_site, company_name, website, contact_email, created_at, contact_form_url"
      )
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false, nullsFirst: false });

    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });

    // フロントの期待に合わせてエイリアス整形（site_company_url = website）
    const rows = (data || []).map((r) => ({
      id: r.id,
      tenant_id: r.tenant_id,
      source_site: r.source_site,
      company_name: r.company_name,
      site_company_url: r.website, // ← フロントがこの名前で参照
      official_website_url: null, // 使わない
      contact_form_url: r.contact_form_url,
      contact_email: r.contact_email,
      is_blocked: null,
      last_checked_at: null,
      created_at: r.created_at,
    }));

    return NextResponse.json({ rows });
  } catch (e: any) {
    return NextResponse.json(
      { error: String(e?.message || e) },
      { status: 500 }
    );
  }
}
