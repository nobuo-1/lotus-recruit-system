// web/src/app/api/form-outreach/automation/run-company-list/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const APP_URL =
  process.env.APP_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  "http://127.0.0.1:3000";

const CRON_SECRET = process.env.FORM_OUTREACH_CRON_SECRET || "";

/** ===== Supabase admin ===== */
function getAdmin() {
  if (!SUPABASE_URL)
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is missing in env");

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

/** ===== JST 系 ===== */
function nowJST() {
  const now = new Date();
  const jstMs = now.getTime() + 9 * 60 * 60 * 1000;
  return new Date(jstMs);
}

// 月曜=1, …, 日曜=7
function weekdayJST(d: Date): number {
  const w = d.getUTCDay(); // 0..6 (日曜=0)
  return w === 0 ? 7 : w;
}

/** ===== 汎用ヘルパ ===== */
async function postJsonWithRetry(
  url: string,
  body: any,
  headers: Record<string, string>
) {
  const maxRetry = 3;
  let lastErr: any = null;

  const isTransient = (s: number) => [408, 429, 500, 502, 503, 504].includes(s);

  for (let i = 0; i <= maxRetry; i++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          ...headers,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      });
      const txt = await res.text();
      const j = txt ? JSON.parse(txt) : {};
      if (!res.ok && isTransient(res.status)) {
        lastErr = new Error(j?.error || `HTTP ${res.status}`);
        await new Promise((r) => setTimeout(r, 300 * (i + 1)));
        continue;
      }
      if (!res.ok) {
        throw new Error(j?.error || `HTTP ${res.status}`);
      }
      return j;
    } catch (e: any) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 300 * (i + 1)));
    }
  }
  throw lastErr || new Error("request failed");
}

async function countSince(
  sb: any,
  table: string,
  tenantId: string,
  sinceIso: string
): Promise<number> {
  const { count, error } = await sb
    .from(table)
    .select("*", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .gte("created_at", sinceIso);
  if (error) throw new Error(error.message);
  return count || 0;
}

async function fetchFilters(tenantId: string): Promise<any> {
  try {
    const res = await fetch(`${APP_URL}/api/form-outreach/settings/filters`, {
      method: "GET",
      headers: { "x-tenant-id": tenantId },
      cache: "no-store",
    });
    const j = await res.json().catch(() => ({}));
    return j?.filters ?? {};
  } catch {
    return {};
  }
}

/** ===== スケジュール判定 ===== */
function isDueWeekly(
  weekdaySetting: number,
  lastStartedAt?: string | null
): boolean {
  const now = nowJST();
  const todayW = weekdayJST(now);
  if (todayW !== weekdaySetting) return false;
  if (!lastStartedAt) return true;

  const last = new Date(lastStartedAt).getTime();
  const threshold = now.getTime() - 20 * 60 * 60 * 1000; // 20時間以上前なら再実行可
  return last < threshold;
}

function isDueMonthly(
  monthDaySetting: number,
  lastStartedAt?: string | null
): boolean {
  const now = nowJST();
  if (now.getUTCDate() !== monthDaySetting) return false;
  if (!lastStartedAt) return true;

  const last = new Date(lastStartedAt);
  const sameMonth =
    last.getUTCFullYear() === now.getUTCFullYear() &&
    last.getUTCMonth() === now.getUTCMonth();
  if (!sameMonth) return true;

  const threshold = now.getTime() - 20 * 60 * 60 * 1000;
  return last.getTime() < threshold;
}

/** ===== 1テナント分の自動取得を実行 ===== */
async function runCompanyListForTenant(
  sb: any,
  tenantId: string,
  targetCount: number
) {
  const startedAt = new Date().toISOString();

  const { data: runRow, error: runErr } = await sb
    .from("form_outreach_auto_runs")
    .insert({
      tenant_id: tenantId,
      kind: "company_list",
      status: "running",
      target_count: targetCount,
      started_at: startedAt,
      last_progress_at: startedAt,
      last_message: "自動取得を開始しました",
    })
    .select("*")
    .single();

  if (runErr) throw new Error(runErr.message);
  const runId: string = runRow.id;
  const sinceIso = startedAt;

  const filters = await fetchFilters(tenantId);
  const headers = { "x-tenant-id": tenantId };

  let newProspects = 0;
  let newRejected = 0;
  let newSimilar = 0;

  const MAX_ATTEMPTS = Math.max(10, targetCount * 6);
  const BATCH_BASE = Math.min(
    25,
    Math.max(8, Math.floor(Math.max(10, targetCount) / 4))
  );

  try {
    let attempts = 0;
    while (newProspects < targetCount && attempts < MAX_ATTEMPTS) {
      attempts++;
      const leftover = Math.max(1, targetCount - newProspects);
      const wantNow = Math.min(BATCH_BASE, leftover);
      const seed = `${Date.now()}-${attempts}`;

      // Phase A: 国税庁クロール → キャッシュ
      await postJsonWithRetry(
        `${APP_URL}/api/form-outreach/companies/crawl`,
        { filters, want: wantNow, seed },
        headers
      );

      // Phase B: enrich → prospects/rejected/similar を保存
      await postJsonWithRetry(
        `${APP_URL}/api/form-outreach/companies/enrich`,
        {
          since: sinceIso,
          want: leftover,
          try_llm: true,
        },
        headers
      );

      // DB ベースで 3テーブルの件数をカウント
      newProspects = await countSince(sb, "form_prospects", tenantId, sinceIso);
      newSimilar = await countSince(
        sb,
        "form_similar_sites",
        tenantId,
        sinceIso
      );
      newRejected = await countSince(
        sb,
        "form_prospects_rejected",
        tenantId,
        sinceIso
      );

      await sb
        .from("form_outreach_auto_runs")
        .update({
          new_prospects: newProspects,
          new_rejected: newRejected,
          new_similar_sites: newSimilar,
          last_progress_at: new Date().toISOString(),
          last_message: `自動取得中: prospects=${newProspects}/${targetCount}, rejected=${newRejected}, similar=${newSimilar}`,
        })
        .eq("id", runId);
    }

    const finishedAt = new Date().toISOString();
    const success = newProspects >= targetCount;

    await sb
      .from("form_outreach_auto_runs")
      .update({
        status: success ? "done" : "error",
        finished_at: finishedAt,
        error_text: success ? null : "target 未達 (MAX_ATTEMPTS 到達)",
        last_message: success
          ? `完了: ${newProspects}/${targetCount} 件を追加。rejected=${newRejected}, similar=${newSimilar}`
          : `終了(未達): ${newProspects}/${targetCount} 件。rejected=${newRejected}, similar=${newSimilar}`,
      })
      .eq("id", runId);

    return {
      runId,
      status: success ? "done" : "error",
      newProspects,
      newRejected,
      newSimilar,
    };
  } catch (e: any) {
    const finishedAt = new Date().toISOString();
    await sb
      .from("form_outreach_auto_runs")
      .update({
        status: "error",
        finished_at: finishedAt,
        error_text: String(e?.message || e),
        last_message: `エラー: ${String(e?.message || e).slice(0, 200)}`,
      })
      .eq("id", runId);
    throw e;
  }
}

/** ===== メイン: cron から叩く ===== */
export async function POST(req: Request) {
  try {
    // 簡易なシークレットチェック（cron から x-cron-secret を送る）
    if (CRON_SECRET) {
      const headerSecret = req.headers.get("x-cron-secret") || "";
      if (headerSecret !== CRON_SECRET) {
        return NextResponse.json({ error: "unauthorized" }, { status: 401 });
      }
    }

    const { sb } = getAdmin();
    const now = nowJST();
    const w = weekdayJST(now);
    const day = now.getUTCDate();

    // 自動法人リスト取得が ON のテナントを取得
    const { data: settingsRows, error: setErr } = await sb
      .from("form_outreach_automation_settings")
      .select("*")
      .eq("auto_company_list", true);

    if (setErr) throw new Error(setErr.message);

    const results: any[] = [];

    for (const s of settingsRows || []) {
      const tenantId: string | null = s.tenant_id || null;
      if (!tenantId) continue;

      const schedule: "weekly" | "monthly" = s.company_schedule || "weekly";
      const limit: number = s.company_limit ?? 100;
      const weekdaySetting: number = s.company_weekday ?? 1;
      const monthDaySetting: number = s.company_month_day ?? 1;

      // 直近の実行を取得
      const { data: last, error: lastErr } = await sb
        .from("form_outreach_auto_runs")
        .select("id, started_at")
        .eq("tenant_id", tenantId)
        .eq("kind", "company_list")
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (lastErr && lastErr.code !== "PGRST116") {
        throw new Error(lastErr.message);
      }

      const lastStartedAt: string | null = last?.started_at ?? null;

      let due = false;
      if (schedule === "weekly") {
        due = isDueWeekly(weekdaySetting, lastStartedAt);
      } else {
        due = isDueMonthly(monthDaySetting, lastStartedAt);
      }

      if (!due) {
        results.push({
          tenantId,
          skipped: true,
          reason: "not due",
        });
        continue;
      }

      const run = await runCompanyListForTenant(sb, tenantId, limit);
      results.push({
        tenantId,
        skipped: false,
        ...run,
      });
    }

    return NextResponse.json({ ok: true, results }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { error: String(e?.message || e) },
      { status: 500 }
    );
  }
}
