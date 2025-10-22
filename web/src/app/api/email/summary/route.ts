// web/src/app/api/email/summary/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

type RangeKey = "7d" | "14d" | "1m" | "3m" | "6m" | "1y";

function rangeToDays(r: RangeKey) {
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
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const dd = `${d.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function buildDateBuckets(days: number) {
  const out: string[] = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    out.push(ymd(d));
  }
  return out;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const range = (url.searchParams.get("range") as RangeKey) || "14d";
    const days = rangeToDays(range);
    const since = new Date();
    since.setDate(since.getDate() - (days - 1));
    since.setHours(0, 0, 0, 0);
    const sinceISO = since.toISOString();
    const todayISO = new Date().toISOString();

    const sb = await supabaseServer();

    // 認証＆テナント
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

    /* ===== KPI: メール総数 / キャンペーン総数 ===== */
    const { count: mailCount } = await sb
      .from("mails")
      .select("id", { count: "exact", head: true })
      .maybeSingle(); // RLS で tenant が絞られている前提

    const { count: campaignCount } = await sb
      .from("campaigns")
      .select("id", { count: "exact", head: true })
      .maybeSingle();

    /* ===== 配信数（期間別：プレーン/キャンペーン） ===== */
    // プレーン：mail_deliveries の sent_at
    const { data: mailSents } = await sb
      .from("mail_deliveries")
      .select("sent_at, status")
      .gte("sent_at", sinceISO)
      .lte("sent_at", todayISO)
      .eq("status", "sent");

    // キャンペーン：deliveries の sent_at
    const { data: campSents } = await sb
      .from("deliveries")
      .select("sent_at, status")
      .gte("sent_at", sinceISO)
      .lte("sent_at", todayISO)
      .eq("status", "sent");

    const buckets = buildDateBuckets(days);
    const counter = (arr: any[] | null | undefined) => {
      const map = new Map<string, number>();
      (arr ?? []).forEach((r: any) => {
        const dt = new Date(String(r.sent_at || ""));
        if (!isFinite(dt.getTime())) return;
        const key = ymd(dt);
        map.set(key, (map.get(key) ?? 0) + 1);
      });
      return buckets.map((d) => ({ date: d, count: map.get(d) ?? 0 }));
    };

    const seriesMail = counter(mailSents);
    const seriesCampaign = counter(campSents);

    // 合計は足し算
    const seriesAll = buckets.map((d, i) => ({
      date: d,
      count: (seriesMail[i]?.count ?? 0) + (seriesCampaign[i]?.count ?? 0),
    }));

    // 直近30日の参考値（なければ undefined）
    const sent30Mail = (mailSents ?? []).length;
    const sent30Campaign = (campSents ?? []).length;

    // 配信停止数（参考：受信者の直近30日のunsubscribe）
    const since30 = new Date();
    since30.setDate(since30.getDate() - 29);
    since30.setHours(0, 0, 0, 0);
    const { count: unsub30 } = await sb
      .from("recipients")
      .select("id", { count: "exact", head: true })
      .gte("unsubscribed_at", since30.toISOString());

    const metrics = {
      // KPI
      mailCount: mailCount ?? 0,
      campaignCount: campaignCount ?? 0,
      // 旧プロパティ互換
      sent30: (sent30Mail ?? 0) + (sent30Campaign ?? 0),
      reachRate: null, // （ここでは未算出）フロント側は "-" 表示
      openRate: null,
      unsub30: unsub30 ?? 0,
      // グラフ
      series: seriesAll,
      seriesMail,
      seriesCampaign,
      // 内訳KPI
      sent30Mail,
      sent30Campaign,
    };

    return NextResponse.json({ metrics });
  } catch (e: any) {
    console.error("GET /api/email/summary error", e);
    return NextResponse.json(
      { error: e?.message || "server error" },
      { status: 500 }
    );
  }
}
