// web/src/app/api/form-outreach/companies/fetch-now/route.ts
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export const runtime = "edge";

const TENANT_FALLBACK = "175b1a9d-3f85-482d-9323-68a44d214424";
const REST_URL = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1`;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY; // あれば優先

function headers() {
  const token = SERVICE || ANON;
  return {
    apikey: ANON,
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };
}

export async function POST(req: NextRequest) {
  try {
    const tenant = req.headers.get("x-tenant-id")?.trim() || TENANT_FALLBACK;

    // 1) prospects を全件取得（このテナント）
    const r1 = await fetch(
      `${REST_URL}/form_prospects?select=id,company_name,website,contact_form_url,contact_email,industry,company_size,job_site_source,created_at&tenant_id=eq.${tenant}&order=created_at.desc&limit=2000`,
      { headers: headers(), cache: "no-store" }
    );
    if (!r1.ok) {
      const t = await r1.text().catch(() => "");
      return NextResponse.json(
        { error: `prospects fetch ${r1.status}: ${t}` },
        { status: 500 }
      );
    }
    const prospects = (await r1.json()) as any[];

    let inserted = 0;
    let skipped = 0;

    // 2) 既存 companies 取得（社名 or website で判定）
    const r2 = await fetch(
      `${REST_URL}/form_outreach_companies?select=id,company_name,official_website_url&tenant_id=eq.${tenant}&limit=2000`,
      { headers: headers(), cache: "no-store" }
    );
    if (!r2.ok) {
      const t = await r2.text().catch(() => "");
      return NextResponse.json(
        { error: `companies fetch ${r2.status}: ${t}` },
        { status: 500 }
      );
    }
    const companies = (await r2.json()) as any[];

    const existsKey = new Set<string>();
    for (const c of companies) {
      const key =
        (c.official_website_url || "").trim().toLowerCase() ||
        (c.company_name || "").trim().toLowerCase();
      if (key) existsKey.add(key);
    }

    // 3) 差分をINSERT
    const payload: any[] = [];
    for (const p of prospects) {
      const key =
        (p.website || "").trim().toLowerCase() ||
        (p.company_name || "").trim().toLowerCase();
      if (!key || existsKey.has(key)) {
        skipped++;
        continue;
      }
      payload.push({
        tenant_id: tenant,
        source_site: p.job_site_source ?? null,
        company_name: p.company_name ?? null,
        site_company_url: null,
        official_website_url: p.website ?? null,
        contact_form_url: p.contact_form_url ?? null,
        contact_email: p.contact_email ?? null,
        is_blocked: false,
        last_checked_at: new Date().toISOString(),
      });
    }

    if (payload.length > 0) {
      const r3 = await fetch(`${REST_URL}/form_outreach_companies`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify(payload),
      });
      if (!r3.ok) {
        const t = await r3.text().catch(() => "");
        return NextResponse.json(
          { error: `insert ${r3.status}: ${t}` },
          { status: 500 }
        );
      }
      const ret = await r3.json();
      inserted = ret?.length ?? 0;
    }

    return NextResponse.json({ inserted, skipped });
  } catch (e: any) {
    return NextResponse.json(
      { error: String(e?.message || e) },
      { status: 500 }
    );
  }
}
