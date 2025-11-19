// web/src/app/api/form-outreach/automation/run-company-list/route.ts
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/** ========= ENV ========= */
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

/** ========= Types ========= */
type Settings = {
  auto_company_list: boolean;
  company_schedule: "weekly" | "monthly";
  company_weekday?: number; // 1=月〜7=日
  company_month_day?: number; // 1〜31
  company_limit?: number;
};

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

type FiltersRow = {
  tenant_id: string;
  prefectures?: string[] | null;
  employee_size_ranges?: string[] | null;
  keywords?: string[] | null;
  industries_large?: string[] | null;
  industries_small?: string[] | null;
  capital_min?: number | null;
  capital_max?: number | null;
  established_from?: string | null;
  established_to?: string | null;
};

/** ========= Utils ========= */

// UUID 簡易チェック
function okUuid(s: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(s || "").trim()
  );
}

// JST 現在時刻
function nowJST(): Date {
  return new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Tokyo" })
  );
}

// 週の開始(月曜0:00)〜次週(月曜0:00)
function startOfThisWeekJST(base?: Date): Date {
  const d = base ? new Date(base) : nowJST();
  const day = d.getDay(); // 0(日)〜6(土)
  const diff = day === 0 ? -6 : 1 - day; // 月曜を週頭とする
  const monday = new Date(d);
  monday.setDate(d.getDate() + diff);
  monday.setHours(0, 0, 0, 0);
  return monday;
}
function startOfNextWeekJST(base?: Date): Date {
  const monday = startOfThisWeekJST(base);
  const next = new Date(monday);
  next.setDate(monday.getDate() + 7);
  return next;
}

// 月の開始(1日0:00)〜翌月(1日0:00)
function startOfThisMonthJST(base?: Date): Date {
  const d = base ? new Date(base) : nowJST();
  const m0 = new Date(d.getFullYear(), d.getMonth(), 1);
  m0.setHours(0, 0, 0, 0);
  return m0;
}
function startOfNextMonthJST(base?: Date): Date {
  const d = base ? new Date(base) : nowJST();
  const m0 = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  m0.setHours(0, 0, 0, 0);
  return m0;
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

/** ========= 設定ロード（既存 settings API を利用） ========= */
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

/** ========= form_outreach_filters のロード ========= */
async function loadFilters(
  sb: any,
  tenantId: string
): Promise<FiltersRow | null> {
  const { data, error } = await sb
    .from("form_outreach_filters")
    .select("*")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error) {
    console.error("loadFilters error:", error.message);
    return null;
  }
  return (data as FiltersRow) || null;
}

/** ========= 今週 / 今月の「自動取得件数(new_prospects)」を数える ========= */
async function countAutoThisWeek(
  sb: any,
  tenantId: string,
  now = nowJST()
): Promise<number> {
  const from = startOfThisWeekJST(now);
  const to = startOfNextWeekJST(now);

  const { data, error } = await sb
    .from("form_outreach_auto_runs")
    .select("new_prospects, target_count")
    .eq("tenant_id", tenantId)
    .eq("kind", "auto-company-list")
    .eq("status", "completed")
    .gte("started_at", from.toISOString())
    .lt("started_at", to.toISOString());

  if (error) throw new Error(error.message);
  const rows = (data || []) as AutoRunRow[];
  return rows.reduce((sum, r) => {
    const n = r.new_prospects ?? r.target_count ?? 0;
    return sum + (Number.isFinite(n as any) ? Number(n) : 0);
  }, 0);
}

async function countAutoThisMonth(
  sb: any,
  tenantId: string,
  now = nowJST()
): Promise<number> {
  const from = startOfThisMonthJST(now);
  const to = startOfNextMonthJST(now);

  const { data, error } = await sb
    .from("form_outreach_auto_runs")
    .select("new_prospects, target_count")
    .eq("tenant_id", tenantId)
    .eq("kind", "auto-company-list")
    .eq("status", "completed")
    .gte("started_at", from.toISOString())
    .lt("started_at", to.toISOString());

  if (error) throw new Error(error.message);
  const rows = (data || []) as AutoRunRow[];
  return rows.reduce((sum, r) => {
    const n = r.new_prospects ?? r.target_count ?? 0;
    return sum + (Number.isFinite(n as any) ? Number(n) : 0);
  }, 0);
}

/** ========= すでに「自動ラン」が走っていないか（並行防止は自動だけ） ========= */
async function hasRunningAuto(
  sb: any,
  tenantId: string,
  now = nowJST()
): Promise<boolean> {
  // 直近1時間以内に "auto-company-list" で running があれば同時実行は避ける
  const oneHourAgo = new Date(now);
  oneHourAgo.setHours(now.getHours() - 1);

  const { data, error } = await sb
    .from("form_outreach_auto_runs")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("kind", "auto-company-list")
    .eq("status", "running")
    .gte("started_at", oneHourAgo.toISOString())
    .limit(1);

  if (error) throw new Error(error.message);
  return Array.isArray(data) && data.length > 0;
}

/** ========= メイン Handler ========= */
export async function POST(req: Request) {
  const trace: string[] = [];
  const startedAtServer = new Date().toISOString();

  try {
    const tenantId = req.headers.get("x-tenant-id") || "";
    if (!tenantId || !okUuid(tenantId)) {
      return NextResponse.json(
        { error: "x-tenant-id required (uuid)" },
        { status: 400 }
      );
    }

    const { sb, usingServiceRole } = getAdmin();

    // body は Cron や Progress からも叩きやすいように任意
    const body = (await req.json().catch(() => ({}))) as {
      max_new_prospects?: number;
      triggered_by?: string; // "cron" | "progress" | "manual" など
    };
    const maxNewFromBody =
      body && typeof body.max_new_prospects === "number"
        ? body.max_new_prospects
        : undefined;
    const triggeredBy = body?.triggered_by || "system";

    // 他の自動ラン(auto-company-list)が同時に走らないようにする
    if (await hasRunningAuto(sb, tenantId)) {
      return NextResponse.json(
        {
          skipped: true,
          reason: "another auto-company-list run is already running",
        },
        { status: 200 }
      );
    }

    // 設定ロード（既存 API を利用）
    const settings = await loadAutomationSettings(req, tenantId);
    if (!settings || !settings.auto_company_list) {
      return NextResponse.json(
        { skipped: true, reason: "auto_company_list is OFF" },
        { status: 200 }
      );
    }

    const now = nowJST();
    const limit = settings.company_limit ?? 100;

    // 週次 / 月次別に「今週/今月の自動取得件数(自動ランのみ)」を集計
    let currentAutoCount = 0;
    if (settings.company_schedule === "weekly") {
      currentAutoCount = await countAutoThisWeek(sb, tenantId, now);
    } else {
      currentAutoCount = await countAutoThisMonth(sb, tenantId, now);
    }

    trace.push(
      `schedule=${settings.company_schedule} limit=${limit} currentAuto=${currentAutoCount}`
    );

    // 上限に達していれば、その期間は何もしない
    if (currentAutoCount >= limit) {
      return NextResponse.json(
        {
          skipped: true,
          reason: "auto quota already satisfied for this period",
          schedule: settings.company_schedule,
          currentAutoCount,
          limit,
        },
        { status: 200 }
      );
    }

    // ====== ★ ここで「週次 / 月次のスケジュール」を判定する ======
    if (settings.company_schedule === "weekly") {
      const dow = now.getDay(); // 0(日)〜6(土)
      const todayAs1to7 = dow === 0 ? 7 : dow; // 1=月〜7=日
      const scheduledDow = settings.company_weekday ?? 1;

      if (todayAs1to7 !== scheduledDow) {
        // まだ実行日ではないのでスキップ（状態は前回の completed のまま）
        return NextResponse.json(
          {
            skipped: true,
            reason: "not scheduled weekday",
            now_jst: now.toISOString(),
            schedule: "weekly",
            todayAs1to7,
            scheduledDow,
            currentAutoCount,
            limit,
          },
          { status: 200 }
        );
      }
    } else {
      // 月次
      const todayDate = now.getDate();
      const scheduledDay = settings.company_month_day ?? 1;

      if (todayDate !== scheduledDay) {
        return NextResponse.json(
          {
            skipped: true,
            reason: "not scheduled month day",
            now_jst: now.toISOString(),
            schedule: "monthly",
            todayDate,
            scheduledDay,
            currentAutoCount,
            limit,
          },
          { status: 200 }
        );
      }
    }
    // ====== ★ ここまでが「週次 / 月次のスケジュール判定」 ======

    // この期間で不足している「正規企業リスト」の件数
    const remain = Math.max(1, limit - currentAutoCount);

    // crawl ルートが want を 1〜200 に clamp しているので、それに合わせる
    const MAX_PER_RUN = 200;
    let want =
      typeof maxNewFromBody === "number" && maxNewFromBody > 0
        ? Math.min(remain, maxNewFromBody, MAX_PER_RUN)
        : Math.min(remain, MAX_PER_RUN);

    want = Math.max(1, want);

    trace.push(`auto-list: will run want=${want}`);

    // ========= form_outreach_filters を取得（prefectures などを crawl/enrich に渡す） =========
    const filters = await loadFilters(sb, tenantId);

    // ========= form_outreach_auto_runs に「自動ラン」行を作成 =========
    const runStartedAt = new Date().toISOString();
    const { data: insertedRuns, error: insertRunErr } = await sb
      .from("form_outreach_auto_runs")
      .insert([
        {
          tenant_id: tenantId,
          kind: "auto-company-list",
          status: "running",
          target_count: want,
          started_at: runStartedAt,
          last_message: "auto company list run started",
          new_prospects: 0,
          new_rejected: 0,
          new_similar_sites: 0,
          last_progress_at: runStartedAt,
          error_text: null,
          meta: {
            schedule: settings.company_schedule,
            company_weekday: settings.company_weekday ?? null,
            company_month_day: settings.company_month_day ?? null,
            limit,
            currentAutoCount_before: currentAutoCount,
            triggered_by: triggeredBy,
          },
        },
      ])
      .select("*")
      .limit(1);

    if (insertRunErr) {
      return NextResponse.json(
        { error: insertRunErr.message, trace },
        { status: 500 }
      );
    }
    const runRow = (insertedRuns || [])[0] as AutoRunRow | undefined;
    const runId = runRow?.id;

    // ========= 実際の「法人リスト取得」処理: crawl → enrich =========
    const u = new URL(req.url);
    const base =
      process.env.APP_URL ||
      `${u.protocol}//${u.host}` ||
      "http://localhost:3000";

    // 1) NTA から候補法人を取得して cache へ
    const crawlBody: any = { want };
    if (filters) {
      crawlBody.filters = {
        prefectures: filters.prefectures ?? undefined,
      };
    }

    const crawlRes = await fetch(`${base}/api/form-outreach/companies/crawl`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-tenant-id": tenantId,
      },
      body: JSON.stringify(crawlBody),
    });
    const crawlJson: any = await crawlRes.json().catch(() => ({}));
    trace.push(`crawl_status=${crawlRes.status}`);

    // 2) cache → prospects へ enrich
    const enrichBody: any = { since: runStartedAt, want, try_llm: false };
    if (filters) {
      enrichBody.filters = filters;
    }

    const enrichRes = await fetch(
      `${base}/api/form-outreach/companies/enrich`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-tenant-id": tenantId,
        },
        body: JSON.stringify(enrichBody),
      }
    );
    const enrichJson: any = await enrichRes.json().catch(() => ({}));
    trace.push(`enrich_status=${enrichRes.status}`);

    const newProspects: number =
      Number(enrichJson?.recent_count ?? enrichJson?.inserted ?? 0) || 0;
    const newSimilar: number =
      Number(enrichJson?.recent_similar_count ?? 0) || 0;
    const rejectedCount: number = Array.isArray(enrichJson?.rejected)
      ? enrichJson.rejected.length
      : 0;

    const finishedAt = new Date().toISOString();

    // ========= ランの完了ステータス更新 =========
    if (runId) {
      const lastMessage =
        crawlRes.ok && enrichRes.ok
          ? "auto company list run completed"
          : "auto company list run completed with errors";

      const { error: updateRunErr } = await sb
        .from("form_outreach_auto_runs")
        .update({
          status: crawlRes.ok && enrichRes.ok ? "completed" : "error",
          finished_at: finishedAt,
          last_message: lastMessage,
          new_prospects: newProspects,
          new_rejected: rejectedCount,
          new_similar_sites: newSimilar,
          last_progress_at: finishedAt,
          error_text:
            !crawlRes.ok || !enrichRes.ok
              ? JSON.stringify({
                  crawl_status: crawlRes.status,
                  enrich_status: enrichRes.status,
                  crawl_error: crawlJson?.error ?? null,
                  enrich_error: enrichJson?.error ?? null,
                }).slice(0, 2000)
              : null,
        })
        .eq("id", runId);

      if (updateRunErr) {
        trace.push(`updateRunErr=${updateRunErr.message}`);
      }
    }

    return NextResponse.json(
      {
        ok: true,
        tenant_id: tenantId,
        schedule: settings.company_schedule,
        limit,
        currentAutoCount_before: currentAutoCount,
        want,
        new_prospects: newProspects,
        new_rejected: rejectedCount,
        new_similar_sites: newSimilar,
        using_service_role: usingServiceRole,
        crawl_status: crawlRes.status,
        enrich_status: enrichRes.status,
        trace,
        run_id: runId ?? null,
        started_at_server: startedAtServer,
      },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { error: String(e?.message || e) },
      { status: 500 }
    );
  }
}
