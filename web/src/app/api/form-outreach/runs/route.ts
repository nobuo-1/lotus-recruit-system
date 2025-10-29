// web/src/app/api/form-outreach/runs/route.ts
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
    const url =
      `${REST_URL}/form_outreach_runs?` +
      `select=id,tenant_id,flow,status,error,started_at,finished_at` +
      `&tenant_id=eq.${tenant}` +
      `&order=started_at.desc&limit=1000`;
    const r = await fetch(url, { headers: authHeaders(), cache: "no-store" });
    if (!r.ok) {
      const t = await r.text().catch(() => "");
      return NextResponse.json(
        { error: `db error ${r.status}: ${t}` },
        { status: 500 }
      );
    }
    const rows = await r.json();
    return NextResponse.json({ rows });
  } catch (e: any) {
    return NextResponse.json(
      { error: String(e?.message || e) },
      { status: 500 }
    );
  }
}
