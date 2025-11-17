// web/src/app/api/form-outreach/automation/progress/route.ts
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

type AutomationProgress = {
  status?: "idle" | "running" | "completed" | "error";
  label?: string | null;
  last_run_started_at?: string | null;
  last_run_finished_at?: string | null;
  today_target_count?: number | null;
  today_processed_count?: number | null;
  queue_size?: number | null;
  error_message?: string | null;
};

/**
 * リクエストヘッダ or ログインユーザーから tenant_id を解決
 */
async function resolveTenantId(req: NextRequest): Promise<string | null> {
  // 1) ヘッダ優先
  const headerTid = req.headers.get("x-tenant-id");
  if (headerTid) return headerTid;

  // 2) Supabase セッション → profiles.tenant_id
  const sb = await supabaseServer();
  const { data: u } = await sb.auth.getUser();
  const user = u?.user;
  if (!user) return null;

  const { data: prof, error: profErr } = await sb
    .from("profiles")
    .select("tenant_id")
    .eq("id", user.id)
    .maybeSingle();

  if (profErr || !prof?.tenant_id) return null;
  return prof.tenant_id as string;
}

export async function GET(req: NextRequest) {
  try {
    const tenantId = await resolveTenantId(req);
    if (!tenantId) {
      return NextResponse.json(
        {
          error:
            "テナントID（tenant_id / x-tenant-id）が取得できませんでした。",
        },
        { status: 400 }
      );
    }

    const sb = await supabaseServer();

    // 今日の0:00〜23:59 JST で絞り込み
    const nowJst = new Date(
      new Date().toLocaleString("en-US", { timeZone: "Asia/Tokyo" })
    );
    const start = new Date(nowJst);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setHours(23, 59, 59, 999);

    // form_outreach_auto_runs から今日の最新レコードを取得
    const { data, error } = await sb
      .from("form_outreach_auto_runs")
      .select(
        `
        status,
        target_count,
        started_at,
        finished_at,
        last_message,
        new_prospects,
        new_rejected,
        new_similar_sites,
        error_text
      `
      )
      .eq("tenant_id", tenantId)
      .gte("started_at", start.toISOString())
      .lte("started_at", end.toISOString())
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("progress query error:", error);
      return NextResponse.json(
        { error: "進捗情報の取得に失敗しました。" },
        { status: 500 }
      );
    }

    if (!data) {
      // 今日まだ実行されていない場合 → progress=null を返す
      return NextResponse.json({ progress: null });
    }

    const targetCount: number | null =
      (data as any).target_count ?? (data as any).targetCount ?? null;
    const newProspects: number =
      (data as any).new_prospects != null ? (data as any).new_prospects : 0;
    const newRejected: number =
      (data as any).new_rejected != null ? (data as any).new_rejected : 0;
    const newSimilar: number =
      (data as any).new_similar_sites != null
        ? (data as any).new_similar_sites
        : 0;

    // 「処理済み件数」は prospect + rejected + similar を合算しておく
    const processed = newProspects + newRejected + newSimilar;

    const queueSize =
      targetCount != null && targetCount > 0
        ? Math.max(0, targetCount - processed)
        : null;

    const progress: AutomationProgress = {
      status: (data as any).status ?? "idle",
      label: (data as any).last_message ?? null,
      last_run_started_at: (data as any).started_at ?? null,
      last_run_finished_at: (data as any).finished_at ?? null,
      today_target_count: targetCount,
      today_processed_count: targetCount != null ? processed : null,
      queue_size: queueSize,
      error_message: (data as any).error_text ?? null,
    };

    return NextResponse.json({ progress });
  } catch (e: any) {
    console.error("progress endpoint error:", e);
    return NextResponse.json(
      { error: "予期しないエラーが発生しました。" },
      { status: 500 }
    );
  }
}
