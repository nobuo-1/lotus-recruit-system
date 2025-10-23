// web/src/app/api/email/summary/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type RangeKey = "7d" | "14d" | "1m" | "3m" | "6m" | "1y";
const RANGE_MAP: Record<RangeKey, number> = {
  "7d": 7,
  "14d": 14,
  "1m": 30,
  "3m": 90,
  "6m": 180,
  "1y": 365,
};

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function fmt(d: Date) {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const dd = `${d.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${dd}`;
}
function emptySeries(days: number) {
  const out: { date: string; count: number }[] = [];
  const today = startOfDay(new Date());
  for (let i = days - 1; i >= 0; i--) {
    const dt = new Date(today);
    dt.setDate(today.getDate() - i);
    out.push({ date: fmt(dt), count: 0 });
  }
  return out;
}
function addToSeries(
  series: Record<string, number>,
  iso: string | null | undefined
) {
  if (!iso) return;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return;
  const key = fmt(startOfDay(d));
  series[key] = (series[key] ?? 0) + 1;
}
function two(v: number) {
  return Math.round(v * 100) / 100;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const range = (url.searchParams.get("range") as RangeKey) || "14d";
    const days = RANGE_MAP[range] ?? 14;

    const sb = await supabaseServer();
    const { data: u } = await sb.auth.getUser();
    if (!u?.user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const admin = supabaseAdmin();

    // 総数
    const { count: mailTotal } = await admin
      .from("mails")
      .select("id", { count: "exact", head: true });

    const { count: campaignTotal } = await admin
      .from("campaigns")
      .select("id", { count: "exact", head: true });

    // 30日KPI：到達率/開封率
    const since30 = new Date();
    since30.setDate(since30.getDate() - 30);
    const since30Iso = since30.toISOString();

    // プレーン（mail_deliveries）
    const { data: m30 } = await admin
      .from("mail_deliveries")
      .select("status, opened_at, sent_at")
      .gte("sent_at", since30Iso);
    const msent = (m30 ?? []).filter((r: any) => (r.status ?? "") === "sent");
    const mfail = (m30 ?? []).filter((r: any) => (r.status ?? "") === "failed");
    const mopen = (m30 ?? []).filter((r: any) => !!r.opened_at);

    // キャンペーン（deliveries）
    const { data: c30 } = await admin
      .from("deliveries")
      .select("status, opened_at, sent_at")
      .gte("sent_at", since30Iso);
    const csent = (c30 ?? []).filter((r: any) => (r.status ?? "") === "sent");
    const cfail = (c30 ?? []).filter((r: any) => (r.status ?? "") === "failed");
    const copen = (c30 ?? []).filter((r: any) => !!r.opened_at);

    const sent30 = msent.length + csent.length;
    const fail30 = mfail.length + cfail.length;
    const open30 = mopen.length + copen.length;
    const base = sent30 + fail30;
    const reachRate = base > 0 ? two((sent30 / base) * 100) : 0;
    const openRate = sent30 > 0 ? two((open30 / sent30) * 100) : 0;

    // 折れ線グラフ（期間中の送信数：合計/プレーン/キャンペーン）
    const since = new Date();
    since.setDate(since.getDate() - (days - 1));
    const sinceIso = startOfDay(since).toISOString();

    const [{ data: md }, { data: cd }] = await Promise.all([
      admin
        .from("mail_deliveries")
        .select("sent_at, status")
        .gte("sent_at", sinceIso)
        .eq("status", "sent"),
      admin
        .from("deliveries")
        .select("sent_at, status")
        .gte("sent_at", sinceIso)
        .eq("status", "sent"),
    ]);

    const sumMail: Record<string, number> = {};
    const sumCamp: Record<string, number> = {};
    (md ?? []).forEach((r: any) => addToSeries(sumMail, r.sent_at));
    (cd ?? []).forEach((r: any) => addToSeries(sumCamp, r.sent_at));

    const baseSeries = emptySeries(days);
    const mailSeries = baseSeries.map(({ date }) => ({
      date,
      count: sumMail[date] ?? 0,
    }));
    const campSeries = baseSeries.map(({ date }) => ({
      date,
      count: sumCamp[date] ?? 0,
    }));
    const totalSeries = baseSeries.map(({ date }) => ({
      date,
      count: (sumMail[date] ?? 0) + (sumCamp[date] ?? 0),
    }));

    // 全期間累計送信数
    const [{ count: allMail }, { count: allCamp }] = await Promise.all([
      admin
        .from("mail_deliveries")
        .select("id", { count: "exact", head: true })
        .eq("status", "sent"),
      admin
        .from("deliveries")
        .select("id", { count: "exact", head: true })
        .eq("status", "sent"),
    ]);
    const allTimeSends = (allMail ?? 0) + (allCamp ?? 0);

    return NextResponse.json({
      metrics: {
        mailTotal: mailTotal ?? 0,
        campaignTotal: campaignTotal ?? 0,
        allTimeSends,
        reachRate,
        openRate,
        series: {
          total: totalSeries,
          mail: mailSeries,
          campaign: campSeries,
        },
      },
    });
  } catch (e: any) {
    console.error("[api.email.summary] error", e);
    return NextResponse.json(
      { error: e?.message || "server error" },
      { status: 500 }
    );
  }
}
