// web/src/app/api/form-outreach/companies/route.ts
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export const runtime = "edge";

const TENANT_ID_FALLBACK = "175b1a9d-3f85-482d-9323-68a44d214424";
const REST_URL = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1`;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

function authHeaders() {
  const token = SERVICE || ANON;
  return {
    apikey: ANON,
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

export async function GET(req: NextRequest) {
  try {
    const tenant = req.headers.get("x-tenant-id")?.trim() || TENANT_ID_FALLBACK;

    // 1) form_outreach_companies 優先
    const url1 =
      `${REST_URL}/form_outreach_companies?` +
      `select=id,tenant_id,source_site,company_name,site_company_url,official_website_url,contact_form_url,contact_email,industry,company_size,created_at` +
      `&tenant_id=eq.${tenant}` +
      `&order=created_at.desc&limit=1000`;

    let r1 = await fetch(url1, { headers: authHeaders(), cache: "no-store" });
    if (r1.ok) {
      const rows = (await r1.json()) as any[];
      return NextResponse.json({ rows });
    }

    // 2) Fallback: form_prospects を companies 風にマップ
    const url2 =
      `${REST_URL}/form_prospects?` +
      `select=id,tenant_id,company_name,website,contact_form_url,contact_email,industry,company_size,job_site_source,created_at` +
      `&tenant_id=eq.${tenant}` +
      `&order=created_at.desc&limit=1000`;

    const r2 = await fetch(url2, { headers: authHeaders(), cache: "no-store" });
    if (!r2.ok) {
      const t = await r2.text().catch(() => "");
      return NextResponse.json(
        { error: `db error ${r2.status}: ${t}` },
        { status: 500 }
      );
    }
    const pRows = (await r2.json()) as any[];

    const mapped = pRows.map((p) => ({
      id: p.id,
      company_name: p.company_name,
      source_site: p.job_site_source ?? null,
      site_company_url: null,
      official_website_url: p.website ?? null,
      contact_form_url: p.contact_form_url ?? null,
      contact_email: p.contact_email ?? null,
      industry: p.industry ?? null,
      company_size: p.company_size ?? null,
      job_site_source: p.job_site_source ?? null,
      created_at: p.created_at ?? null,
    }));

    return NextResponse.json({ rows: mapped });
  } catch (e: any) {
    return NextResponse.json(
      { error: String(e?.message || e) },
      { status: 500 }
    );
  }
}
