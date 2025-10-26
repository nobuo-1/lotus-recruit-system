// web/src/app/api/form-outreach/prospects/route.ts
export const runtime = "nodejs";
import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";
const pool =
  (global as any).__pgPool ||
  ((global as any).__pgPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 5,
  }));
const TENANT =
  process.env.SEED_TENANT_ID || "00000000-0000-0000-0000-000000000001";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim() || "";
  const client = await pool.connect();
  try {
    const sql = `
      SELECT id, company_name, website, contact_email, contact_form_url,
             industry, company_size, job_site_source, status, created_at
        FROM public.form_prospects
       WHERE tenant_id = $1
         AND ($2 = '' OR company_name ILIKE '%'||$2||'%' OR website ILIKE '%'||$2||'%')
       ORDER BY created_at DESC
       LIMIT 200
    `;
    const { rows } = await client.query(sql, [TENANT, q]);
    return NextResponse.json({ rows });
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message || String(e) },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
