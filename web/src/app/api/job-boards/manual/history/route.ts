// web/src/app/api/job-boards/manual/history/route.ts
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function isValidUuid(v: unknown): v is string {
  if (typeof v !== "string") return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v
  );
}

function resolveTenantId(req: Request, body?: any): string | null {
  const h = (req.headers.get("x-tenant-id") || "").trim();
  if (isValidUuid(h)) return h;

  const cookie = req.headers.get("cookie") || "";
  const m = cookie.match(/(?:^|;\s*)(x-tenant-id|tenant_id)=([^;]+)/i);
  if (m && isValidUuid(decodeURIComponent(m[2])))
    return decodeURIComponent(m[2]);

  if (isValidUuid(body?.tenant_id)) return String(body?.tenant_id);

  return null;
}

export async function GET(req: Request) {
  try {
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const url = new URL(req.url);
    const limit = Math.min(
      100,
      Math.max(1, Number(url.searchParams.get("limit")) || 20)
    );
    const tenantId = resolveTenantId(req);

    // UUID でない場合は安全に空配列を返す（他テナント漏洩防止）
    if (!tenantId) {
      return NextResponse.json({ ok: true, rows: [] });
    }

    const { data, error } = await admin
      .from("job_board_manual_runs")
      .select(
        // UIから結果一覧も見えるように results も返す
        "id, created_at, tenant_id, params, result_count, results"
      )
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) throw error;

    return NextResponse.json({ ok: true, rows: data ?? [] });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: String(e?.message || e) },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const body = await req.json().catch(() => ({}));
    const tenantId = resolveTenantId(req, body);

    if (!tenantId) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "tenant_id is required (UUID). クッキーまたはヘッダーに x-tenant-id を設定してください。",
        },
        { status: 400 }
      );
    }

    const params = body?.params ?? {};
    const results = Array.isArray(body?.results) ? body.results : [];

    const { data, error } = await admin
      .from("job_board_manual_runs")
      .insert({
        tenant_id: tenantId,
        params,
        results,
        result_count: results.length,
      })
      .select("id")
      .single();

    if (error) throw error;

    return NextResponse.json({ ok: true, id: data?.id || null });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: String(e?.message || e) },
      { status: 500 }
    );
  }
}
