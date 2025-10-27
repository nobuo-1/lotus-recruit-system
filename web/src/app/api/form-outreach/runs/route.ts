// web/src/app/api/form-outreach/runs/route.ts
import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

const TENANT_ID_FALLBACK = "175b1a9d-3f85-482d-9323-68a44d214424";
const REST_URL = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1`;
const APIKEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

async function dbSelect(table: string, query: string) {
  const url = `${REST_URL}/${table}?${query}`;
  const r = await fetch(url, {
    headers: {
      apikey: APIKEY,
      Authorization: `Bearer ${APIKEY}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`db error ${r.status}: ${t}`);
  }
  return r.json();
}

export async function GET(req: NextRequest) {
  try {
    const headers = await req.headers;
    const tenant = headers.get("x-tenant-id")?.trim() || TENANT_ID_FALLBACK;

    // order=started_at.desc で新しい順
    const rows = await dbSelect(
      "form_outreach_runs",
      `select=*&tenant_id=eq.${tenant}&order=started_at.desc&limit=500`
    );

    return NextResponse.json({ rows });
  } catch (e: any) {
    return NextResponse.json(
      { error: String(e?.message || e) },
      { status: 500 }
    );
  }
}
