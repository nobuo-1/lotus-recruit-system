// web/src/app/api/email/summary/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

type RangeKey = "7d" | "14d" | "1m" | "3m" | "6m" | "1y";
function rangeToDays(r: RangeKey): number {
  switch (r) {
    case "7d":
      return 7;
    case "14d":
      return 14;
    case "1m":
      return 30;
    case "3m":
      return 90;
    case "6m":
      return 180;
    case "1y":
      return 365;
    default:
      return 14;
  }
}
function ymd(d: Date) {
  return d.toISOString().slice(0, 10);
}

function makeEmptySeries(start: Date, end: Date) {
  const arr: { date: string; count: number }[] = [];
  const cur = new Date(start);
  while (cur <= end) {
    arr.push({ date: ymd(cur), count: 0 });
    cur.setDate(cur.getDate() + 1);
  }
  return arr;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const range = (url.searchParams.get("range") as RangeKey) || "14d";

    const sb = await supabaseServer();

    // auth & tenant
    const { data: u } = await sb.auth.getUser();
    if (!u?.user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    const { data: prof } = await sb
      .from("profiles")
      .select("tenant_id")
      .eq("id", u.user.id)
      .maybeSingle();
    const tenantId = (prof?.tenant_id as string | undefined) ?? undefined;

    // ==== KPI（全期間の総数。グラフ切替や期間とは分離） ====
    // メール総数
    const mailTotalHead = await sb
      .from("mails")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId ?? "");
    const mailTotal = mailTotalHead.count ?? 0;

    // キャンペーン総数
    const campTotalHead = await sb
      .from("campaigns")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId ?? "");
    const campaignTotal = campTotalHead.count ?? 0;

    // 全期間の累計配信数 = mail_deliveries(sent) + deliveries(sent)
    // mail_deliveries は tenant_id を持たないので、mails 経由で絞る
    const mailIdsRes = await sb
      .from("mails")
      .select("id")
      .eq("tenant_id", tenantId ?? "");
    const mailIds = (mailIdsRes.data ?? []).map((r: any) => r.id);
    let allTimeMailSent = 0;
    if (mailIds.length) {
      const mailSentHead = await sb
        .from("mail_deliveries")
        .select("id", { count: "exact", head: true })
        .in("mail_id", mailIds)
        .eq("status", "sent");
      allTimeMailSent = mailSentHead.count ?? 0;
    }
    const campSentHead = await sb
      .from("deliveries")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId ?? "")
      .eq("status", "sent");
    const allTimeCampaignSent = campSentHead.count ?? 0;
    const allTimeSends = allTimeMailSent + allTimeCampaignSent;

    // ==== 期間のグラフ用データ ====
    const days = rangeToDays(range);
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - (days - 1));

    // 期間中の mail_deliveries(sent)
    let mailSentRows: Array<{
      sent_at: string | null;
      created_at: string | null;
    }> = [];
    if (mailIds.length) {
      const { data: ms } = await sb
        .from("mail_deliveries")
        .select("sent_at, created_at")
        .in("mail_id", mailIds)
        .eq("status", "sent")
        .gte("sent_at", start.toISOString())
        .lte("sent_at", end.toISOString());
      mailSentRows = ms ?? [];
    }

    // 期間中の deliveries(sent)
    const { data: cs } = await sb
      .from("deliveries")
      .select("sent_at")
      .eq("tenant_id", tenantId ?? "")
      .eq("status", "sent")
      .gte("sent_at", start.toISOString())
      .lte("sent_at", end.toISOString());
    const campSentRows: Array<{ sent_at: string | null }> = cs ?? [];

    const base = makeEmptySeries(start, end);
    const mailSeries = base.map((d) => ({ ...d }));
    const campSeries = base.map((d) => ({ ...d }));
    const idxMap = new Map(base.map((d, i) => [d.date, i]));

    for (const r of mailSentRows) {
      const t = r.sent_at || r.created_at;
      if (!t) continue;
      const k = t.slice(0, 10);
      const i = idxMap.get(k);
      if (i != null) mailSeries[i].count++;
    }
    for (const r of campSentRows) {
      const t = r.sent_at;
      if (!t) continue;
      const k = t.slice(0, 10);
      const i = idxMap.get(k);
      if (i != null) campSeries[i].count++;
    }
    const totalSeries = base.map((d, i) => ({
      date: d.date,
      count: (mailSeries[i]?.count ?? 0) + (campSeries[i]?.count ?? 0),
    }));

    // ==== 到達率/開封率（直近30日・プレーン+キャンペーン合算） ====
    const start30 = new Date();
    start30.setDate(end.getDate() - 29);

    // attempts = queued+sent（processing もあれば含める）
    let mailAttempt = 0,
      mailSent30 = 0,
      mailOpened30 = 0;
    if (mailIds.length) {
      // attempts
      const { count: ma } = await sb
        .from("mail_deliveries")
        .select("id", { count: "exact", head: true })
        .in("mail_id", mailIds)
        .in("status", ["queued", "sent", "processing"])
        .gte("created_at", start30.toISOString());
      mailAttempt = ma ?? 0;

      // sent
      const { count: ms30 } = await sb
        .from("mail_deliveries")
        .select("id", { count: "exact", head: true })
        .in("mail_id", mailIds)
        .eq("status", "sent")
        .gte("sent_at", start30.toISOString());
      mailSent30 = ms30 ?? 0;

      // opened_at カラムがあれば利用（無ければ 0）
      try {
        const { count: mo } = await sb
          .from("mail_deliveries")
          .select("id", { count: "exact", head: true })
          .in("mail_id", mailIds)
          .not("opened_at", "is", null)
          .gte("opened_at", start30.toISOString());
        mailOpened30 = mo ?? 0;
      } catch {
        mailOpened30 = 0;
      }
    }

    const { count: campAttempt } = await sb
      .from("deliveries")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId ?? "")
      .in("status", ["queued", "sent", "processing"])
      .gte("created_at", start30.toISOString());
    const { count: campSent30 } = await sb
      .from("deliveries")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId ?? "")
      .eq("status", "sent")
      .gte("sent_at", start30.toISOString());

    let campOpened30 = 0;
    try {
      const { count: co } = await sb
        .from("deliveries")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId ?? "")
        .not("opened_at", "is", null)
        .gte("opened_at", start30.toISOString());
      campOpened30 = co ?? 0;
    } catch {
      campOpened30 = 0;
    }

    const attempts30 = (campAttempt ?? 0) + (mailAttempt ?? 0);
    const sent30 = (campSent30 ?? 0) + (mailSent30 ?? 0);
    const opened30 = campOpened30 + mailOpened30;

    const reachRate =
      attempts30 > 0 ? Math.round((sent30 / attempts30) * 100) : 0;
    const openRate = sent30 > 0 ? Math.round((opened30 / sent30) * 100) : 0;

    return NextResponse.json({
      metrics: {
        // KPI（期間やグラフ切替と無関係）
        mailTotal,
        campaignTotal,
        allTimeSends,
        reachRate,
        openRate,

        // グラフ（選択期間のみ）
        series: {
          total: totalSeries,
          mail: mailSeries,
          campaign: campSeries,
        },
      },
    });
  } catch (e: any) {
    console.error("/api/email/summary error", e);
    return NextResponse.json(
      { error: e?.message || "server error" },
      { status: 500 }
    );
  }
}
