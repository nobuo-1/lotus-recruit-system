// web/src/app/api/job-boards/manual/history/route.ts
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

type PreviewRow = {
  site_key: string;
  internal_large: string | null;
  internal_small: string | null;
  age_band: string | null;
  employment_type: string | null;
  salary_band: string | null;
  prefecture: string | null;
  jobs_count: number | null;
  candidates_count: number | null;
};

export async function GET(req: Request) {
  try {
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const tenantId = req.headers.get("x-tenant-id") || "";
    const url = new URL(req.url);
    const limit = Math.min(
      100,
      Math.max(1, Number(url.searchParams.get("limit")) || 20)
    );
    const { data, error } = await admin
      .from("job_board_manual_runs")
      .select("id, created_at, tenant_id, params, result_count")
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
    const tenantId = req.headers.get("x-tenant-id") || "";
    if (!tenantId)
      return NextResponse.json(
        { ok: false, error: "x-tenant-id required" },
        { status: 400 }
      );

    const body = await req.json().catch(() => ({}));
    const params = body?.params ?? {};
    const results: PreviewRow[] = Array.isArray(body?.results)
      ? body.results
      : [];
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data, error } = await admin
      .from("job_board_manual_runs")
      .insert({
        tenant_id: tenantId,
        params,
        results, // jsonb
        result_count: results.length,
      })
      .select("id");

    if (error) throw error;
    return NextResponse.json({ ok: true, id: data?.[0]?.id || null });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: String(e?.message || e) },
      { status: 500 }
    );
  }
}
