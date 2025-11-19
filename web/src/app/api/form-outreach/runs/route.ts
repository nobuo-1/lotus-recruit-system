// web/src/app/api/form-outreach/runs/route.ts
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/** ========= ENV ========= */
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

/** ========= Utils ========= */
function okUuid(s: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(s || "").trim()
  );
}

function getAdmin() {
  if (!SUPABASE_URL) throw new Error("NEXT_PUBLIC_SUPABASE_URL is missing");
  if (SERVICE_ROLE) {
    return {
      sb: createClient(SUPABASE_URL, SERVICE_ROLE),
      usingServiceRole: true,
    };
  }
  if (!ANON_KEY)
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_ANON_KEY missing"
    );
  return { sb: createClient(SUPABASE_URL, ANON_KEY), usingServiceRole: false };
}

/** ========= Handler ========= */
export async function GET(req: Request) {
  try {
    const tenantId = req.headers.get("x-tenant-id") || "";
    if (!tenantId || !okUuid(tenantId)) {
      return NextResponse.json(
        { error: "x-tenant-id required (uuid)" },
        { status: 400 }
      );
    }

    const { sb } = getAdmin();

    // 手動実行（form_outreach_runs）
    const { data: manualRows, error: manualErr } = await sb
      .from("form_outreach_runs")
      .select(
        "id, tenant_id, flow, status, error, started_at, finished_at, table_name, mode, meta"
      )
      .eq("tenant_id", tenantId)
      .order("started_at", { ascending: false })
      .limit(200);

    if (manualErr) throw new Error(manualErr.message);

    // 自動実行（form_outreach_auto_runs）
    const { data: autoRows, error: autoErr } = await sb
      .from("form_outreach_auto_runs")
      .select(
        "id, tenant_id, kind, status, started_at, finished_at, last_message, error_text, target_count, new_prospects, new_rejected, new_similar_sites"
      )
      .eq("tenant_id", tenantId)
      .order("started_at", { ascending: false })
      .limit(200);

    if (autoErr) throw new Error(autoErr.message);

    // SchedulesPage が期待する形に正規化
    type RunRow = {
      id: string;
      flow: string | null;
      status: string | null;
      error: string | null;
      started_at: string | null;
      finished_at: string | null;
      tenant_id?: string | null;
    };

    const manualMapped: RunRow[] = (manualRows || []).map((r: any) => ({
      id: r.id,
      tenant_id: r.tenant_id,
      // flow がなければ table_name / mode からそれっぽい文字列を埋める
      flow:
        r.flow ||
        r.table_name ||
        (r.mode ? `manual-${r.mode}` : "manual-send") ||
        "manual-send",
      status: r.status || null,
      error: r.error || null,
      started_at: r.started_at,
      finished_at: r.finished_at,
    }));

    const autoMapped: RunRow[] = (autoRows || []).map((r: any) => ({
      id: r.id,
      tenant_id: r.tenant_id,
      // kind = "auto-company-list" など
      flow: r.kind || "auto-company-list",
      status: r.status || null, // running / completed / error など
      // error_text があればそれを、無ければ last_message をメモ代わりに表示
      error:
        (r.error_text as string | null) ||
        (r.last_message as string | null) ||
        null,
      started_at: r.started_at,
      finished_at: r.finished_at,
    }));

    const all: RunRow[] = [...manualMapped, ...autoMapped].sort((a, b) => {
      const sa = a.started_at || "";
      const sbt = b.started_at || "";
      if (!sa && !sbt) return 0;
      if (!sa) return 1;
      if (!sbt) return -1;
      // 新しい順
      return sa < sbt ? 1 : sa > sbt ? -1 : 0;
    });

    return NextResponse.json({ rows: all }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { error: String(e?.message || e) },
      { status: 500 }
    );
  }
}
