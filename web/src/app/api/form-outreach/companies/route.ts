// web/src/app/api/form-outreach/companies/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export async function GET(req: NextRequest) {
  try {
    const tenantId = req.headers.get("x-tenant-id") || "";
    if (!tenantId) {
      return NextResponse.json(
        { error: "x-tenant-id header required" },
        { status: 400 }
      );
    }

    const url = new URL(req.url);
    const limit = Math.min(Number(url.searchParams.get("limit") || 200), 1000);
    const offset = Math.max(Number(url.searchParams.get("offset") || 0), 0);

    const sb = await supabaseServer();
    // NOTE: PostgREST のエイリアス構文（source_site:job_site_source）で既存UIを壊さない
    const { data, error } = await sb
      .from("form_prospects")
      .select(
        "id, tenant_id, company_name, website, contact_form_url, contact_email, industry, company_size, status, created_at, source_site:job_site_source"
      )
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false, nullsFirst: false })
      .range(offset, offset + limit - 1);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ rows: data ?? [] });
  } catch (e: any) {
    return NextResponse.json(
      { error: String(e?.message || e) },
      { status: 500 }
    );
  }
}
