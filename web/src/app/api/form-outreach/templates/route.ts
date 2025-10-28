// web/src/app/api/form-outreach/templates/route.ts
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export const runtime = "edge";

// テナント固定（本番チェック用）
const TENANT_ID_FALLBACK = "175b1a9d-3f85-482d-9323-68a44d214424";
const REST_URL = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1`;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY; // あれば優先（RLS回避）

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

    // テンプレ用途：channel='template' を優先して取得、なければ全件も拾えるように OR 条件を許容
    // まず template を取得、0件なら全件 fallback
    const base = `${REST_URL}/form_outreach_messages`;
    const select = "id,name,subject,channel,created_at";
    const urlTemplateOnly =
      `${base}?select=${select}&tenant_id=eq.${tenant}` +
      `&channel=eq.template&order=created_at.desc&limit=500`;

    let r = await fetch(urlTemplateOnly, {
      headers: authHeaders(),
      cache: "no-store",
    });
    if (!r.ok) {
      const t = await r.text().catch(() => "");
      return NextResponse.json(
        { error: `db error ${r.status}: ${t}` },
        { status: 500 }
      );
    }
    let rows = (await r.json()) as any[];

    if (!rows || rows.length === 0) {
      // Fallback: 全件（過去に channel='email' などでテンプレを持っているケースを救う）
      const urlAll =
        `${base}?select=${select}&tenant_id=eq.${tenant}` +
        `&order=created_at.desc&limit=500`;
      const r2 = await fetch(urlAll, {
        headers: authHeaders(),
        cache: "no-store",
      });
      if (!r2.ok) {
        const t = await r2.text().catch(() => "");
        return NextResponse.json(
          { error: `db error ${r2.status}: ${t}` },
          { status: 500 }
        );
      }
      rows = (await r2.json()) as any[];
    }

    return NextResponse.json({ rows });
  } catch (e: any) {
    return NextResponse.json(
      { error: String(e?.message || e) },
      { status: 500 }
    );
  }
}
