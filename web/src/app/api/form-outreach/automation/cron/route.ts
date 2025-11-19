// web/src/app/api/form-outreach/automation/cron/route.ts
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const CRON_SECRET = process.env.FORM_OUTREACH_CRON_SECRET || "";

/** ====== Supabase Admin ====== */
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

/** ====== Utils (JST / 週次・月次の期間計算) ====== */
function nowInTz(tz: string): Date {
  // 最もシンプルなタイムゾーン対応（多少のズレは許容）
  return new Date(
    new Date().toLocaleString("en-US", {
      timeZone: tz || "Asia/Tokyo",
    })
  );
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** 週次: 指定曜日を起点とした 1週間の範囲 */
function getWeeklyRange(
  now: Date,
  weekday1_7: number
): {
  from: Date;
  to: Date;
} {
  // 1=Mon .. 7=Sun として計算
  const day = now.getDay() === 0 ? 7 : now.getDay(); // JS: 0=Sun
  const diff = (day - weekday1_7 + 7) % 7; // 直近の「指定曜日」まで何日戻るか
  const start = startOfDay(new Date(now));
  start.setDate(start.getDate() - diff);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return { from: start, to: end };
}

/** 月次: 指定日を起点とした 1ヶ月の範囲（例: 毎月10日〜翌月10日） */
function getMonthlyRange(
  now: Date,
  dayOfMonth: number
): {
  from: Date;
  to: Date;
} {
  const d = new Date(now);
  const y = d.getFullYear();
  const m = d.getMonth(); // 0-11
  const currentDay = d.getDate();

  let fromYear = y;
  let fromMonth = m;
  if (currentDay < dayOfMonth) {
    // まだ今月の指定日を迎えていない → 前月の指定日スタート
    fromMonth = m - 1;
    if (fromMonth < 0) {
      fromMonth = 11;
      fromYear = y - 1;
    }
  }

  const from = new Date(fromYear, fromMonth, dayOfMonth, 0, 0, 0, 0);

  // 終了日は「翌月の同日」
  let toYear = fromYear;
  let toMonth = fromMonth + 1;
  if (toMonth > 11) {
    toMonth = 0;
    toYear = fromYear + 1;
  }
  const to = new Date(toYear, toMonth, dayOfMonth, 0, 0, 0, 0);

  return { from, to };
}

/** 指定テナントの今期（週 or 月）の new_prospects 合計 */
async function loadPeriodNewProspects(
  sb: any,
  tenantId: string,
  params: {
    schedule: "weekly" | "monthly";
    weekday?: number | null;
    monthDay?: number | null;
    timezone?: string | null;
  }
): Promise<number> {
  const tz = params.timezone || "Asia/Tokyo";
  const now = nowInTz(tz);

  let range: { from: Date; to: Date };
  if (params.schedule === "weekly") {
    const wd =
      params.weekday && params.weekday >= 1 && params.weekday <= 7
        ? params.weekday
        : 1;
    range = getWeeklyRange(now, wd);
  } else {
    const day =
      params.monthDay && params.monthDay >= 1 && params.monthDay <= 31
        ? params.monthDay
        : 1;
    range = getMonthlyRange(now, day);
  }

  const { data, error } = await sb
    .from("form_outreach_auto_runs")
    .select("new_prospects")
    .eq("tenant_id", tenantId)
    .eq("kind", "auto-company-list")
    .gte("started_at", range.from.toISOString())
    .lt("started_at", range.to.toISOString());

  if (error) throw new Error(error.message);

  let sum = 0;
  for (const row of data || []) {
    const v = Number((row as any).new_prospects ?? 0) || 0;
    sum += v;
  }
  return sum;
}

/** あるテナントで今このタイミングで自動取得を走らせるべきか？ */
async function shouldTriggerAutoRun(
  sb: any,
  tenantId: string
): Promise<boolean> {
  // すでに running のジョブがあれば起動しない
  const { data: running, error: runningErr } = await sb
    .from("form_outreach_auto_runs")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("kind", "auto-company-list")
    .eq("status", "running")
    .limit(1);

  if (runningErr) throw new Error(runningErr.message);
  if ((running || []).length > 0) return false;

  return true;
}

/** ========= Handler ========= */

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const token =
      url.searchParams.get("token") || req.headers.get("x-cron-token") || "";

    if (!CRON_SECRET) {
      return NextResponse.json(
        { error: "FORM_OUTREACH_CRON_SECRET is not set" },
        { status: 500 }
      );
    }
    if (!token || token !== CRON_SECRET) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const { sb } = getAdmin();

    // 自動実行対象テナントを取得
    const { data: rows, error } = await sb
      .from("form_outreach_automation_settings")
      .select(
        "tenant_id, auto_company_list, company_schedule, company_weekday, company_month_day, company_limit, enabled, timezone"
      )
      .eq("auto_company_list", true);

    if (error) throw new Error(error.message);

    const base =
      process.env.APP_URL ||
      `${url.protocol}//${url.host}` ||
      "http://localhost:3000";

    const results: any[] = [];

    for (const r of rows || []) {
      const tenantId = (r as any).tenant_id as string;
      const autoCompanyList = !!(r as any).auto_company_list;
      const enabled = (r as any).enabled;
      const schedule = ((r as any).company_schedule || "weekly") as
        | "weekly"
        | "monthly";
      const weekday = (r as any).company_weekday as number | null;
      const monthDay = (r as any).company_month_day as number | null;
      const limit = Number((r as any).company_limit ?? 0) || 0;
      const tz = ((r as any).timezone || "Asia/Tokyo") as string;

      if (!tenantId || !autoCompanyList || !limit) {
        continue;
      }
      if (enabled === false) {
        // enabled が false 明示ならスキップ
        continue;
      }

      const now = nowInTz(tz);

      // スケジュール条件（指定曜日・指定日）を満たしているかをチェック
      let isInScheduleWindow = false;
      if (schedule === "weekly") {
        const wd = weekday && weekday >= 1 && weekday <= 7 ? weekday : 1;
        const today = now.getDay() === 0 ? 7 : now.getDay(); // 1-7
        // 週次: 「指定曜日の日」であれば、その日中は OK
        isInScheduleWindow = today === wd;
      } else {
        const d = now.getDate();
        const targetDay =
          monthDay && monthDay >= 1 && monthDay <= 31 ? monthDay : 1;
        // 月次: 「指定日」かつ、その日中は OK
        isInScheduleWindow = d === targetDay;
      }

      if (!isInScheduleWindow) {
        results.push({
          tenantId,
          skipped: "out_of_schedule_window",
        });
        continue;
      }

      // 今期（週 or 月）の new_prospects 合計を取得
      const already = await loadPeriodNewProspects(sb, tenantId, {
        schedule,
        weekday,
        monthDay,
        timezone: tz,
      });

      if (already >= limit) {
        // すでに今期分の上限に達している
        results.push({
          tenantId,
          skipped: "limit_reached",
          already,
          limit,
        });
        continue;
      }

      // 既に running があれば起動しない
      const canRun = await shouldTriggerAutoRun(sb, tenantId);
      if (!canRun) {
        results.push({
          tenantId,
          skipped: "already_running",
        });
        continue;
      }

      // 残り必要件数
      const remaining = limit - already;

      try {
        // 各テナントごとに run-company-list を叩く
        await fetch(`${base}/api/form-outreach/automation/run-company-list`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-tenant-id": tenantId,
          },
          body: JSON.stringify({
            max_new_prospects: remaining,
            triggered_by: "cron",
            schedule: schedule,
          }),
        });
        results.push({
          tenantId,
          triggered: true,
          remaining,
        });
      } catch (e: any) {
        console.error("cron -> run-company-list failed:", e);
        results.push({
          tenantId,
          triggered: false,
          error: String(e?.message || e),
        });
      }
    }

    return NextResponse.json(
      {
        ok: true,
        tenants: results,
      },
      { status: 200 }
    );
  } catch (e: any) {
    console.error("automation cron error:", e);
    return NextResponse.json(
      { error: String(e?.message || e) },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  // Cron サービスが POST を使う場合にも対応しておく
  return GET(req);
}
