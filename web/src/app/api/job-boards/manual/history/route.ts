// web/src/app/api/job-boards/manual/history/route.ts
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  resolveTenantIdForManualHistory,
  saveJobBoardManualHistory,
} from "@/server/job-boards/manualHistory";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function GET(req: Request) {
  try {
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const url = new URL(req.url);
    const limit = Math.min(
      100,
      Math.max(1, Number(url.searchParams.get("limit")) || 20)
    );
    const tenantId = await resolveTenantIdForManualHistory(req);

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
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const params = body?.params ?? {};
    const results = Array.isArray(body?.results) ? body.results : [];
    const resultCount =
      typeof body?.result_count === "number" ? body.result_count : undefined;

    const saved = await saveJobBoardManualHistory({
      req,
      body,
      params,
      results,
      resultCount,
    });

    return NextResponse.json({ ok: true, id: saved.id });
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
