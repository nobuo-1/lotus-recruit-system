// web/src/app/api/form-outreach/companies/route.ts
import { NextRequest, NextResponse } from "next/server";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function h(tenantId: string) {
  return {
    apikey: KEY!,
    Authorization: `Bearer ${KEY}`,
    "Content-Type": "application/json",
    "x-tenant-id": tenantId,
  };
}

export async function GET(req: NextRequest) {
  try {
    const tenantId = req.headers.get("x-tenant-id") || "";
    if (!tenantId) {
      return NextResponse.json(
        { error: "x-tenant-id header required" },
        { status: 400 }
      );
    }

    // form_prospects から必要な列を抽出（website をサイトURLとして利用）
    const url =
      `${URL}/rest/v1/form_prospects?tenant_id=eq.${tenantId}` +
      `&select=id,tenant_id,company_name,website,contact_form_url,contact_email,job_site_source,created_at` +
      `&order=created_at.desc,nullslast`;

    const r = await fetch(url, { headers: h(tenantId), cache: "no-store" });
    const j = await r.json();
    if (!r.ok) {
      return NextResponse.json(
        { error: j?.message || "fetch failed" },
        { status: r.status }
      );
    }

    const rows = (j as any[]).map((x) => ({
      id: x.id,
      tenant_id: x.tenant_id,
      company_name: x.company_name,
      website: x.website,
      contact_form_url: x.contact_form_url,
      contact_email: x.contact_email,
      source_site: x.job_site_source,
      created_at: x.created_at,
    }));

    return NextResponse.json({ rows });
  } catch (e: any) {
    return NextResponse.json(
      { error: String(e?.message || e) },
      { status: 500 }
    );
  }
}
