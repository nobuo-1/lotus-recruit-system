// web/src/app/api/form-outreach/summary/route.ts
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

function nowJST(): Date {
  return new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Tokyo" })
  );
}

/** range ごとの期間（ざっくり日数ベース） */
function getRangeWindow(
  range: string | null | undefined,
  now: Date
): { from: Date; to: Date } {
  const to = now;
  const from = new Date(to.getTime());

  switch (range) {
    case "7d":
      from.setDate(from.getDate() - 6); // 今日含めて7日
      break;
    case "1m":
      from.setDate(from.getDate() - 29); // 約30日
      break;
    case "3m":
      from.setDate(from.getDate() - 89);
      break;
    case "6m":
      from.setDate(from.getDate() - 179);
      break;
    case "1y":
      from.setDate(from.getDate() - 364);
      break;
    case "14d":
    default:
      from.setDate(from.getDate() - 13);
      break;
  }

  // 日の0:00に丸める
  from.setHours(0, 0, 0, 0);
  return { from, to };
}

/** JST ベースで YYYY-MM-DD キーを作る */
function dateKeyJst(d: Date): string {
  const j = new Date(d.toLocaleString("en-US", { timeZone: "Asia/Tokyo" }));
  const y = j.getFullYear();
  const m = String(j.getMonth() + 1).padStart(2, "0");
  const day = String(j.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Supabase admin client */
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
    const url = new URL(req.url);
    const range = url.searchParams.get("range") || "14d";

    const tenantId = req.headers.get("x-tenant-id") || "";
    if (!tenantId || !okUuid(tenantId)) {
      return NextResponse.json(
        { error: "x-tenant-id required (uuid)" },
        { status: 400 }
      );
    }

    const { sb } = getAdmin();
    const now = nowJST();

    // --- テンプレ数（form_outreach_messages テナント別件数） ---
    const { count: templatesCount, error: tErr } = await sb
      .from("form_outreach_messages")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", tenantId);
    if (tErr) throw new Error(tErr.message);

    // --- 企業数（form_prospects テナント別件数） ---
    const { count: companiesCount, error: cErr } = await sb
      .from("form_prospects")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", tenantId);
    if (cErr) throw new Error(cErr.message);

    // --- 累計実行（手動 + 自動） ---
    const [
      { count: manualRunsCount, error: rErr },
      { count: autoRunsCount, error: aErr },
    ] = await Promise.all([
      sb
        .from("form_outreach_runs")
        .select("*", { count: "exact", head: true })
        .eq("tenant_id", tenantId),
      sb
        .from("form_outreach_auto_runs")
        .select("*", { count: "exact", head: true })
        .eq("tenant_id", tenantId),
    ]);
    if (rErr) throw new Error(rErr.message);
    if (aErr) throw new Error(aErr.message);

    const allTimeRuns = (manualRunsCount || 0) + (autoRunsCount || 0);

    // --- 成功率（30日）: form_outreach_runs ベース ---
    const from30 = new Date(now.getTime());
    from30.setDate(from30.getDate() - 29);
    from30.setHours(0, 0, 0, 0);

    const { data: runs30, error: runsErr } = await sb
      .from("form_outreach_runs")
      .select("ok_count, failed_count, started_at")
      .eq("tenant_id", tenantId)
      .gte("started_at", from30.toISOString())
      .lte("started_at", now.toISOString());

    if (runsErr) throw new Error(runsErr.message);

    let okSum = 0;
    let failSum = 0;
    (runs30 || []).forEach((r: any) => {
      okSum += Number(r.ok_count || 0);
      failSum += Number(r.failed_count || 0);
    });
    const successRate =
      okSum + failSum > 0 ? (okSum * 100) / (okSum + failSum) : 0;

    // --- series: メッセージ送信数を日別集計 ---
    const { from: rangeFrom, to: rangeTo } = getRangeWindow(range, now);

    const { data: msgs, error: mErr } = await sb
      .from("form_outreach_messages")
      .select("sent_at, channel")
      .eq("tenant_id", tenantId)
      .not("sent_at", "is", null)
      .gte("sent_at", rangeFrom.toISOString())
      .lte("sent_at", rangeTo.toISOString());

    if (mErr) throw new Error(mErr.message);

    const totalMap = new Map<string, number>();
    const formMap = new Map<string, number>();
    const emailMap = new Map<string, number>();

    // 期間内の各日を0で初期化
    for (
      let d = new Date(rangeFrom.getTime());
      d <= rangeTo;
      d.setDate(d.getDate() + 1)
    ) {
      const key = dateKeyJst(d);
      totalMap.set(key, 0);
      formMap.set(key, 0);
      emailMap.set(key, 0);
    }

    (msgs || []).forEach((m: any) => {
      const sentAt = m.sent_at;
      if (!sentAt) return;
      const d = new Date(sentAt);
      if (Number.isNaN(d.getTime())) return;
      const key = dateKeyJst(d);

      totalMap.set(key, (totalMap.get(key) || 0) + 1);

      const ch = (m.channel || "").toLowerCase();
      if (ch === "form") {
        formMap.set(key, (formMap.get(key) || 0) + 1);
      } else if (ch === "email") {
        emailMap.set(key, (emailMap.get(key) || 0) + 1);
      }
    });

    const toSeries = (map: Map<string, number>) =>
      Array.from(map.entries())
        .sort((a, b) => (a[0] < b[0] ? -1 : 1))
        .map(([date, count]) => ({ date, count }));

    const series = {
      total: toSeries(totalMap),
      form: toSeries(formMap),
      email: toSeries(emailMap),
    };

    return NextResponse.json(
      {
        metrics: {
          templates: templatesCount || 0,
          companies: companiesCount || 0,
          allTimeRuns,
          successRate,
          series,
        },
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
