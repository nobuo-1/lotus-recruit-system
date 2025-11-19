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
  company_weekday?: number; // 1=月〜7=日
  company_month_day?: number; // 1〜31
  company_limit?: number;
  updated_at?: string | null;
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

/** 週次: 現在の「計測期間」を返す
 *  - 1=月〜7=日
 *  - 基本は「直近の指定曜日0:00〜次の指定曜日0:00」
 *  - ただし updatedAt がその期間内にあれば from を updatedAt に引き上げる
 */
function getCurrentWeeklyPeriod(
  now: Date,
  weekday1to7: number,
  updatedAt?: string | null
): { from: Date; to: Date } {
  let targetDow = weekday1to7 === 7 ? 0 : weekday1to7; // JS の getDay() は 0(日)〜6(土)
  if (targetDow < 0 || targetDow > 6) targetDow = 1; // デフォルト月曜

  // 直近の「指定曜日 0:00」（now を含むかそれ以前）
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
      from = u; // ON にした途中からカウント開始
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
    // 今月の境界を過ぎている → 今月境界〜翌月境界
    prev = thisBoundary;
    const nextMonth = (m + 1) % 12;
    const nextYear = m === 11 ? y + 1 : y;
    next = getMonthlyBoundary(nextYear, nextMonth, scheduledDay);
  } else {
    // まだ今月の境界前 → 先月境界〜今月境界
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

/** ========= 期間内の正規 / 不備 / 近似サイトを実テーブルから集計 ========= */
async function countFromTable(
  sb: any,
  table: string,
  tenantId: string,
  fromIso: string,
  toIso: string
): Promise<number> {
  const { data, error } = await sb
    .from(table)
    .select("id, created_at")
    .eq("tenant_id", tenantId)
    .gte("created_at", fromIso)
    .lt("created_at", toIso);

  if (error) throw new Error(error.message);
  return Array.isArray(data) ? data.length : 0;
}

async function loadPeriodSummary(
  sb: any,
  tenantId: string,
  from: Date,
  to: Date
): Promise<{
  newProspects: number;
  newRejected: number;
  newSimilar: number;
}> {
  const fromIso = from.toISOString();
  const toIso = to.toISOString();

  const [pros, rej, sim] = await Promise.all([
    countFromTable(sb, "form_prospects", tenantId, fromIso, toIso),
    countFromTable(sb, "form_prospects_rejected", tenantId, fromIso, toIso),
    countFromTable(sb, "form_similar_sites", tenantId, fromIso, toIso),
  ]);

  return {
    newProspects: pros,
    newRejected: rej,
    newSimilar: sim,
  };
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

    // 0) 自動実行設定を取得（週次 / 月次 / 取得件数 / updated_at など）
    const settings = await loadAutomationSettings(req, tenantId);

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

    // 2) 計測期間の from〜to を決める & 実テーブルから件数集計
    let todayTargetCount: number | null = null;
    let todayProcessedCount: number | null = null;
    let newProspects = 0;
    let newRejected = 0;
    let newSimilar = 0;

    if (settings && settings.auto_company_list) {
      const limit = settings.company_limit ?? 0;
      todayTargetCount = limit > 0 ? limit : null;

      let periodFrom: Date;
      let periodTo: Date;

      if (settings.company_schedule === "weekly") {
        const { from } = getCurrentWeeklyPeriod(
          now,
          settings.company_weekday ?? 1,
          settings.updated_at
        );
        periodFrom = from;
        periodTo = now; // 「今の時点まで」の取得件数
      } else {
        const { from } = getCurrentMonthlyPeriod(
          now,
          settings.company_month_day ?? 1,
          settings.updated_at
        );
        periodFrom = from;
        periodTo = now;
      }

      const summary = await loadPeriodSummary(
        sb,
        tenantId,
        periodFrom,
        periodTo
      );
      newProspects = summary.newProspects;
      newRejected = summary.newRejected;
      newSimilar = summary.newSimilar;

      todayProcessedCount = newProspects;
    } else {
      // 自動取得OFFや設定取得失敗時は 0 として扱う
      todayTargetCount = null;
      todayProcessedCount = null;
      newProspects = 0;
      newRejected = 0;
      newSimilar = 0;
    }

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
          today_target_count: todayTargetCount,
          today_processed_count: todayProcessedCount,
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
