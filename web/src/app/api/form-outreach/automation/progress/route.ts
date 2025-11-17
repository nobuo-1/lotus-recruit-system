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

type Settings = {
  auto_company_list: boolean;
  company_schedule: "weekly" | "monthly";
  company_weekday?: number;
  company_month_day?: number;
  company_limit?: number;
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

/** ========= 設定ロード（既存 settings API を叩く） ========= */
async function loadAutomationSettings(
  req: Request,
  tenantId: string
): Promise<Settings | null> {
  try {
    const u = new URL(req.url);
    const base =
      process.env.APP_URL ||
      `${u.protocol}//${u.host}` ||
      "http://localhost:3000";

    const res = await fetch(`${base}/api/form-outreach/automation/settings`, {
      headers: {
        "x-tenant-id": tenantId,
      },
      cache: "no-store",
    });

    if (!res.ok) return null;

    const j = await res.json().catch(() => ({}));
    const s = (j?.settings ?? j) as Partial<Settings>;

    return {
      auto_company_list: !!s.auto_company_list,
      company_schedule: s.company_schedule ?? "weekly",
      company_weekday: s.company_weekday ?? 1,
      company_month_day: s.company_month_day ?? 1,
      company_limit: s.company_limit ?? 100,
    };
  } catch {
    return null;
  }
}

/** ========= いま自動ランが走っているか ========= */
async function hasRunningAuto(sb: any, tenantId: string): Promise<boolean> {
  const { data, error } = await sb
    .from("form_outreach_auto_runs")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("kind", "auto-company-list")
    .eq("status", "running")
    .limit(1);

  if (error) throw new Error(error.message);
  return Array.isArray(data) && data.length > 0;
}

/** ========= 今日の自動実行件数サマリ ========= */
async function loadTodaySummary(
  sb: any,
  tenantId: string,
  now = nowJST()
): Promise<{ target: number; processed: number }> {
  const from = startOfTodayJST(now);
  const to = startOfTomorrowJST(now);

  const { data, error } = await sb
    .from("form_outreach_auto_runs")
    .select("target_count,new_prospects")
    .eq("tenant_id", tenantId)
    .eq("kind", "auto-company-list")
    .gte("started_at", from.toISOString())
    .lt("started_at", to.toISOString());

  if (error) throw new Error(error.message);
  const rows = (data || []) as AutoRunRow[];

  let target = 0;
  let processed = 0;
  for (const r of rows) {
    const t = Number(r.target_count ?? 0) || 0;
    const p = Number(r.new_prospects ?? 0) || 0;
    target += t;
    processed += p || t; // new_prospects が null の場合は target_count を代替
  }
  return { target, processed };
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
    const url = new URL(req.url);
    const base =
      process.env.APP_URL ||
      `${url.protocol}//${url.host}` ||
      "http://localhost:3000";

    // 1) まず現在の最新ラン情報を取得
    const { data: latestRows, error: latestErr } = await sb
      .from("form_outreach_auto_runs")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("kind", "auto-company-list")
      .order("started_at", { ascending: false })
      .limit(1);

    if (latestErr) throw new Error(latestErr.message);
    const last = (latestRows || [])[0] as AutoRunRow | undefined;
    const hasRunning =
      last?.status === "running" || (await hasRunningAuto(sb, tenantId));

    // 2) 自動リスト取得を「必要なら実行」する
    // ・auto_company_list が ON
    // ・現在 running ではない
    // というときに /automation/run-company-list を叩いて実行させる
    if (!hasRunning) {
      const settings = await loadAutomationSettings(req, tenantId);
      if (settings && settings.auto_company_list) {
        try {
          await fetch(`${base}/api/form-outreach/automation/run-company-list`, {
            method: "POST",
            headers: {
              "x-tenant-id": tenantId,
              "content-type": "application/json",
            },
            body: JSON.stringify({}), // 判定ロジックは run-company-list 側で実施
          });
        } catch (e) {
          // 自動起動のエラーは progress には出さず、ログに留める
          console.error("auto run trigger failed:", e);
        }
      }
    }

    // 3) 実行の有無にかかわらず、改めて最新ランと今日のサマリを取得して返す
    const { data: latestRows2, error: latestErr2 } = await sb
      .from("form_outreach_auto_runs")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("kind", "auto-company-list")
      .order("started_at", { ascending: false })
      .limit(1);

    if (latestErr2) throw new Error(latestErr2.message);
    const last2 = (latestRows2 || [])[0] as AutoRunRow | undefined;

    const { target: todayTarget, processed: todayProcessed } =
      await loadTodaySummary(sb, tenantId, now);

    let status: "idle" | "running" | "completed" | "error" = "idle";
    if (last2?.status === "running") status = "running";
    else if (last2?.status === "completed") status = "completed";
    else if (last2?.status === "error") status = "error";

    const queueSize =
      last2 && last2.status === "running"
        ? Math.max(
            0,
            (Number(last2.target_count ?? 0) || 0) -
              (Number(last2.new_prospects ?? 0) || 0)
          )
        : 0;

    return NextResponse.json(
      {
        progress: {
          status,
          label: last2?.last_message ?? null,
          last_run_started_at: last2?.started_at ?? null,
          last_run_finished_at: last2?.finished_at ?? null,
          today_target_count: todayTarget || null,
          today_processed_count: todayProcessed || null,
          queue_size: queueSize || null,
          error_message: last2?.error_text ?? null,
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
