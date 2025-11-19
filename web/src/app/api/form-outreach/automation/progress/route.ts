// web/src/app/api/form-outreach/automation/progress/route.ts
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/** ========= ENV ========= */
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

/** ========= Types ========= */
type AutoRunRow = {
  id: string;
  tenant_id: string;
  kind: string | null;
  status: string | null;
  target_count: number | null;
  started_at: string | null;
  finished_at: string | null;
  last_message: string | null;
  new_prospects: number | null;
  new_rejected: number | null;
  new_similar_sites: number | null;
  last_progress_at: string | null;
  error_text: string | null;
  meta: any;
};

/** ========= Utils ========= */

function okUuid(s: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(s || "").trim()
  );
}

function nowJST(): Date {
  return new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Tokyo" })
  );
}

function startOfTodayJST(base?: Date): Date {
  const d = base ? new Date(base) : nowJST();
  d.setHours(0, 0, 0, 0);
  return d;
}
function startOfTomorrowJST(base?: Date): Date {
  const d = startOfTodayJST(base);
  d.setDate(d.getDate() + 1);
  return d;
}

/** ========= Supabase ========= */
function getAdmin(): { sb: any; usingServiceRole: boolean } {
  if (!SUPABASE_URL) throw new Error("NEXT_PUBLIC_SUPABASE_URL is missing");
  if (SERVICE_ROLE) {
    return {
      sb: createClient(SUPABASE_URL, SERVICE_ROLE) as any,
      usingServiceRole: true,
    };
  }
  if (!ANON_KEY)
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_ANON_KEY missing"
    );
  return {
    sb: createClient(SUPABASE_URL, ANON_KEY) as any,
    usingServiceRole: false,
  };
}

/** ========= 今日の自動実行件数サマリ =========
 *  正規企業 / 不備企業 / 近似サイトをそれぞれ集計
 */
async function loadTodaySummary(
  sb: any,
  tenantId: string,
  now = nowJST()
): Promise<{
  target: number;
  processed: number;
  newProspects: number;
  newRejected: number;
  newSimilar: number;
}> {
  const from = startOfTodayJST(now).toISOString();
  const to = startOfTomorrowJST(now).toISOString();

  const { data, error } = await sb
    .from("form_outreach_auto_runs")
    .select(
      "target_count,new_prospects,new_rejected,new_similar_sites,status,kind"
    )
    .eq("tenant_id", tenantId)
    .eq("kind", "auto-company-list")
    .gte("started_at", from)
    .lt("started_at", to);

  if (error) throw new Error(error.message);
  const rows = (data || []) as AutoRunRow[];

  let target = 0;
  let processed = 0; // 「正規企業リスト」の進捗基準
  let newProspects = 0;
  let newRejected = 0;
  let newSimilar = 0;

  for (const r of rows) {
    const t = Number(r.target_count ?? 0) || 0;
    const np = Number(r.new_prospects ?? 0) || 0;
    const nr = Number(r.new_rejected ?? 0) || 0;
    const ns = Number(r.new_similar_sites ?? 0) || 0;

    target += t;
    processed += np; // 進捗バーは「正規企業リスト（new_prospects）」基準
    newProspects += np;
    newRejected += nr;
    newSimilar += ns;
  }

  return { target, processed, newProspects, newRejected, newSimilar };
}

/** ========= メイン Handler ========= */
export async function GET(req: Request) {
  try {
    const tenantId = req.headers.get("x-tenant-id") || "";
    if (!tenantId || !okUuid(tenantId)) {
      return NextResponse.json(
        {
          progress: {
            status: "idle",
            label: "テナントIDが不正です",
          },
        },
        { status: 400 }
      );
    }

    const { sb } = getAdmin();
    const now = nowJST();

    // 1) 最新の自動ラン情報を取得（最後の1件）
    const { data: latestRows, error: latestErr } = await sb
      .from("form_outreach_auto_runs")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("kind", "auto-company-list")
      .order("started_at", { ascending: false })
      .limit(1);

    if (latestErr) throw new Error(latestErr.message);
    const last = (latestRows || [])[0] as AutoRunRow | undefined;

    // 2) 今日のサマリを取得（正規 / 不備 / 近似サイト）
    const {
      target: todayTarget,
      processed: todayProcessed,
      newProspects,
      newRejected,
      newSimilar,
    } = await loadTodaySummary(sb, tenantId, now);

    // 3) ステータス判定
    let status: "idle" | "running" | "completed" | "error" = "idle";
    if (last?.status === "running") status = "running";
    else if (last?.status === "completed") status = "completed";
    else if (last?.status === "error") status = "error";

    // 4) キューの残り（単純に target_count - new_prospects として計算）
    const queueSize =
      last && last.status === "running"
        ? Math.max(
            0,
            (Number(last.target_count ?? 0) || 0) -
              (Number(last.new_prospects ?? 0) || 0)
          )
        : 0;

    // 5) レスポンス
    return NextResponse.json(
      {
        progress: {
          status,
          label: last?.last_message ?? null,
          last_run_started_at: last?.started_at ?? null,
          last_run_finished_at: last?.finished_at ?? null,
          today_target_count: todayTarget || null,
          today_processed_count: todayProcessed || null,
          today_new_prospects: newProspects || null,
          today_new_rejected: newRejected || null,
          today_new_similar_sites: newSimilar || null,
          queue_size: queueSize || null,
          error_message: last?.error_text ?? null,
        },
      },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json(
      {
        progress: {
          status: "error",
          label: "進捗情報の取得に失敗しました",
          error_message: String(e?.message || e),
        },
      },
      { status: 500 }
    );
  }
}
