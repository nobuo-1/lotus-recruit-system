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
  updated_at?: string | null;
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

/** 週次: 現在の「計測期間」を返す（progress と同じロジック） */
function getCurrentWeeklyPeriod(
  now: Date,
  weekday1to7: number,
  updatedAt?: string | null
): { from: Date; to: Date } {
  let targetDow = weekday1to7 === 7 ? 0 : weekday1to7; // JS getDay: 0(日)〜6(土)
  if (targetDow < 0 || targetDow > 6) targetDow = 1;

  const last = new Date(now);
  last.setHours(0, 0, 0, 0);
  while (last.getDay() !== targetDow) {
    last.setDate(last.getDate() - 1);
  }
  const next = new Date(last);
  next.setDate(next.getDate() + 7);

  let from = last;
  if (updatedAt) {
    const u = new Date(updatedAt);
    if (!isNaN(u.getTime()) && u > from && u < next) {
      from = u;
    }
  }

  return { from, to: next };
}

/** 月次: その月に存在しない日付の場合は、月内の最大日を使う */
function getMonthlyBoundary(
  year: number,
  month0: number,
  scheduledDay: number
): Date {
  const daysInMonth = new Date(year, month0 + 1, 0).getDate();
  const safeDay = Math.max(1, Math.min(scheduledDay, daysInMonth));
  const d = new Date(year, month0, safeDay);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** 月次: 現在の「計測期間」を返す */
function getCurrentMonthlyPeriod(
  now: Date,
  scheduledDay: number,
  updatedAt?: string | null
): { from: Date; to: Date } {
  const y = now.getFullYear();
  const m = now.getMonth();

  const thisBoundary = getMonthlyBoundary(y, m, scheduledDay);

  let prev: Date;
  let next: Date;
  if (now >= thisBoundary) {
    prev = thisBoundary;
    const nextMonth = (m + 1) % 12;
    const nextYear = m === 11 ? y + 1 : y;
    next = getMonthlyBoundary(nextYear, nextMonth, scheduledDay);
  } else {
    const prevMonth = (m + 11) % 12;
    const prevYear = m === 0 ? y - 1 : y;
    prev = getMonthlyBoundary(prevYear, prevMonth, scheduledDay);
    next = thisBoundary;
  }

  let from = prev;
  if (updatedAt) {
    const u = new Date(updatedAt);
    if (!isNaN(u.getTime()) && u > from && u < next) {
      from = u;
    }
  }

  return { from, to: next };
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
    const updated =
      (j as any)?.updatedAt || (j as any)?.updated_at || s.updated_at || null;

    return {
      auto_company_list: !!s.auto_company_list,
      company_schedule: s.company_schedule ?? "weekly",
      company_weekday: s.company_weekday ?? 1,
      company_month_day: s.company_month_day ?? 1,
      company_limit: s.company_limit ?? 100,
      updated_at: updated,
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

/** ========= 現在の期間内に form_prospects へ入っている件数を集計 ========= */
async function countProspectsInCurrentPeriod(
  sb: any,
  tenantId: string,
  settings: Settings,
  now: Date
): Promise<{ currentAutoCount: number; periodFrom: Date }> {
  let periodFrom: Date;
  if (settings.company_schedule === "weekly") {
    const { from } = getCurrentWeeklyPeriod(
      now,
      settings.company_weekday ?? 1,
      settings.updated_at
    );
    periodFrom = from;
  } else {
    const { from } = getCurrentMonthlyPeriod(
      now,
      settings.company_month_day ?? 1,
      settings.updated_at
    );
    periodFrom = from;
  }

  const fromIso = periodFrom.toISOString();
  const toIso = now.toISOString();

  const { data, error } = await sb
    .from("form_prospects")
    .select("id, created_at")
    .eq("tenant_id", tenantId)
    .gte("created_at", fromIso)
    .lt("created_at", toIso);

  if (error) throw new Error(error.message);
  const rows = Array.isArray(data) ? data : [];
  const count = rows.length;

  return { currentAutoCount: count, periodFrom };
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

    // 設定ロード
    const settings = await loadAutomationSettings(req, tenantId);
    if (!settings || !settings.auto_company_list) {
      return NextResponse.json(
        { skipped: true, reason: "auto_company_list is OFF" },
        { status: 200 }
      );
    }

    const now = nowJST();
    const limit = settings.company_limit ?? 100;

    // 現在の期間内にすでに取得済みの「正規企業リスト」の件数（form_prospects ベース）
    const { currentAutoCount, periodFrom } =
      await countProspectsInCurrentPeriod(sb, tenantId, settings, now);

    trace.push(
      `schedule=${
        settings.company_schedule
      } limit=${limit} currentAuto=${currentAutoCount} periodFrom=${periodFrom.toISOString()}`
    );

    // 上限に達していれば、この期間は何もしない
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

    // ====== 週次 / 月次の「実行日」かどうかを判定 ======
    if (settings.company_schedule === "weekly") {
      const dow = now.getDay(); // 0(日)〜6(土)
      const todayAs1to7 = dow === 0 ? 7 : dow; // 1=月〜7=日
      const scheduledDow = settings.company_weekday ?? 1;

      if (todayAs1to7 !== scheduledDow) {
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
    // ====== ここまでが「週次 / 月次のスケジュール判定」 ======

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
            period_from: periodFrom.toISOString(),
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

    // enrich の返り値に依存せず、「実際に form_prospects に入った件数」を数え直す
    const { currentAutoCount: totalAfterRun } =
      await countProspectsInCurrentPeriod(sb, tenantId, settings, nowJST());
    const newProspects = Math.max(0, totalAfterRun - currentAutoCount);

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
