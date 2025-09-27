export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

/**
 * ?range= 7d | 14d | 1m | 3m | 6m | 1y  （省略時 14d）
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const range = (url.searchParams.get("range") ?? "14d").toLowerCase();

    const supabase = await supabaseServer();

    // 認証→テナント
    const { data: u } = await supabase.auth.getUser();
    if (!u?.user) return NextResponse.json({ metrics: emptyMetrics() });

    const { data: prof } = await supabase
      .from("profiles")
      .select("tenant_id")
      .eq("id", u.user.id)
      .maybeSingle();

    const tenantId = prof?.tenant_id as string | undefined;
    if (!tenantId) return NextResponse.json({ metrics: emptyMetrics() });

    // 期間
    const now = new Date();
    const startForSeries = calcStart(range, now);
    const start30 = addDays(now, -30);

    const nowISO = now.toISOString();
    const startSeriesISO = toDayStartISO(startForSeries);
    const start30ISO = toDayStartISO(start30);

    // ① キャンペーン総数
    {
      const { count: cRaw } = await supabase
        .from("campaigns")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId);
      var campaignCount = cRaw ?? 0;
    }

    // ② 直近30日の sent 件数
    {
      const { count: sRaw } = await supabase
        .from("deliveries")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("status", "sent")
        .gte("sent_at", start30ISO)
        .lte("sent_at", nowISO);
      var sent30 = sRaw ?? 0;
    }

    // ③ 到達率: (直近30日 sent) / (直近30日 deliveries 作成)
    {
      const { count: aRaw } = await supabase
        .from("deliveries")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .gte("created_at", start30ISO)
        .lte("created_at", nowISO);
      const attempted30 = aRaw ?? 0;
      var reachRate =
        attempted30 > 0 ? Math.round((sent30 / attempted30) * 1000) / 10 : 0;
    }

    // ④ 開封率: opened_at / sent （opened_atが無い環境は0%）
    let openRate = 0;
    try {
      const { count: oRaw } = await supabase
        .from("deliveries")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .gte("opened_at", start30ISO)
        .lte("opened_at", nowISO);
      const opened30 = oRaw ?? 0;
      openRate = sent30 > 0 ? Math.round((opened30 / sent30) * 1000) / 10 : 0;
    } catch {
      openRate = 0;
    }

    // ⑤ 直近30日の配信停止数
    {
      const { count: uRaw } = await supabase
        .from("recipients")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .gte("unsubscribed_at", start30ISO)
        .lte("unsubscribed_at", nowISO);
      var unsub30 = uRaw ?? 0;
    }

    // ⑥ 折れ線グラフ: 日別 sent
    const { data: sentRows } = await supabase
      .from("deliveries")
      .select("sent_at")
      .eq("tenant_id", tenantId)
      .eq("status", "sent")
      .gte("sent_at", startSeriesISO)
      .lte("sent_at", nowISO);

    const series = bucketByDay(
      startForSeries,
      now,
      (sentRows ?? []).map((r) => r.sent_at as string)
    );

    return NextResponse.json({
      metrics: {
        campaignCount,
        sent30,
        reachRate,
        openRate,
        unsub30,
        series,
      },
    });
  } catch {
    return NextResponse.json({ metrics: emptyMetrics() });
  }
}

// ---------- helpers ----------
function emptyMetrics() {
  return {
    campaignCount: 0,
    sent30: 0,
    reachRate: 0,
    openRate: 0,
    unsub30: 0,
    series: [] as { date: string; count: number }[],
  };
}
function calcStart(range: string, now: Date) {
  switch (range) {
    case "7d":
      return addDays(now, -6);
    case "14d":
      return addDays(now, -13);
    case "1m":
      return addMonths(now, -1);
    case "3m":
      return addMonths(now, -3);
    case "6m":
      return addMonths(now, -6);
    case "1y":
      return addMonths(now, -12);
    default:
      return addDays(now, -13);
  }
}
function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return toLocalDayStart(x);
}
function addMonths(d: Date, n: number) {
  const x = new Date(d);
  x.setMonth(x.getMonth() + n);
  return toLocalDayStart(x);
}
function toLocalDayStart(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}
function toDayStartISO(d: Date) {
  return new Date(
    Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0)
  ).toISOString();
}
function fmtMD(d: Date) {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${m}/${day}`;
}
function bucketByDay(start: Date, end: Date, isoList: string[]) {
  const map = new Map<string, number>();
  const days: { date: string; count: number }[] = [];
  const cur = new Date(start);
  while (cur <= end) {
    const label = fmtMD(cur);
    map.set(label, 0);
    days.push({ date: label, count: 0 });
    cur.setDate(cur.getDate() + 1);
  }
  for (const iso of isoList) {
    const d = new Date(iso);
    const label = fmtMD(d);
    if (map.has(label)) map.set(label, (map.get(label) ?? 0) + 1);
  }
  return days.map((d) => ({ date: d.date, count: map.get(d.date) ?? 0 }));
}
