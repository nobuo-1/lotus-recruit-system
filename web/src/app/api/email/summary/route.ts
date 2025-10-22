// web/src/app/api/email/summary/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type RangeKey = "7d" | "14d" | "1m" | "3m" | "6m" | "1y";

function daysOf(range: RangeKey) {
  switch (range) {
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

function isoDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}
function stripTime(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function lastNDays(n: number) {
  const today = stripTime(new Date());
  const arr: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    arr.push(isoDate(d));
  }
  return arr;
}
function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export async function GET(req: Request) {
  try {
    const admin = supabaseAdmin();
    const url = new URL(req.url);
    const range = (url.searchParams.get("range") as RangeKey) || "14d";
    const days = daysOf(range);

    // 期間（[from, to)）
    const to = addDays(stripTime(new Date()), 1); // 翌日の0:00
    const from = addDays(to, -days);

    // ========= KPI: 総数 =========
    const mTotal = await admin
      .from("mails")
      .select("id", { count: "exact", head: true });
    const cTotal = await admin
      .from("campaigns")
      .select("id", { count: "exact", head: true });

    const mailTotal = mTotal.count ?? 0;
    const campaignTotal = cTotal.count ?? 0;

    // ========= KPI: 累計配信（全期間 sent）=========
    const mailSentAll = await admin
      .from("mail_deliveries")
      .select("id", { count: "exact", head: true })
      .eq("status", "sent");
    const campSentAll = await admin
      .from("deliveries")
      .select("id", { count: "exact", head: true })
      .eq("status", "sent");
    const allTimeSends = (mailSentAll.count ?? 0) + (campSentAll.count ?? 0);

    // ========= Series（ゼロ補完あり）=========
    const daysList = lastNDays(days);
    const zeroMap = Object.fromEntries(daysList.map((d) => [d, 0]));

    // mail_deliveries（期間内 sent の日毎カウント）
    const mailRows = await admin
      .from("mail_deliveries")
      .select("sent_at")
      .eq("status", "sent")
      .gte("sent_at", from.toISOString())
      .lt("sent_at", to.toISOString());

    const mailMap = { ...zeroMap };
    (mailRows.data ?? []).forEach((r: any) => {
      const dt = r?.sent_at ? isoDate(new Date(r.sent_at)) : null;
      if (dt && dt in mailMap) mailMap[dt] += 1;
    });

    // deliveries（期間内 sent の日毎カウント）
    const campRows = await admin
      .from("deliveries")
      .select("sent_at")
      .eq("status", "sent")
      .gte("sent_at", from.toISOString())
      .lt("sent_at", to.toISOString());

    const campMap = { ...zeroMap };
    (campRows.data ?? []).forEach((r: any) => {
      const dt = r?.sent_at ? isoDate(new Date(r.sent_at)) : null;
      if (dt && dt in campMap) campMap[dt] += 1;
    });

    const mailSeries = daysList.map((d) => ({ date: d, count: mailMap[d] }));
    const campSeries = daysList.map((d) => ({ date: d, count: campMap[d] }));
    const totalSeries = daysList.map((d) => ({
      date: d,
      count: mailMap[d] + campMap[d],
    }));

    // ========= KPI: 30日到達率/開封率 =========
    const now = new Date();
    const from30 = addDays(stripTime(now), -30).toISOString();
    const to30 = addDays(stripTime(now), 1).toISOString();

    // 送信済み（分母）
    const mailSent30 = await admin
      .from("mail_deliveries")
      .select("id", { count: "exact", head: true })
      .eq("status", "sent")
      .gte("sent_at", from30)
      .lt("sent_at", to30);
    const campSent30 = await admin
      .from("deliveries")
      .select("id", { count: "exact", head: true })
      .eq("status", "sent")
      .gte("sent_at", from30)
      .lt("sent_at", to30);
    const sent30 = (mailSent30.count ?? 0) + (campSent30.count ?? 0);

    // 開封済み（分子：開封率）
    const mailOpen30 = await admin
      .from("mail_deliveries")
      .select("id", { count: "exact", head: true })
      .not("opened_at", "is", null)
      .gte("sent_at", from30)
      .lt("sent_at", to30);
    const campOpen30 = await admin
      .from("deliveries")
      .select("id", { count: "exact", head: true })
      .not("opened_at", "is", null)
      .gte("sent_at", from30)
      .lt("sent_at", to30);
    const opened30 = (mailOpen30.count ?? 0) + (campOpen30.count ?? 0);

    // 試行総数（分母：到達率）= 送信済 + 予約済（まだ未送信）
    const mailSchedRows = await admin
      .from("mail_schedules")
      .select("recipient_ids, schedule_at")
      .gte("schedule_at", from30)
      .lt("schedule_at", to30);

    const mailScheduledCount = (mailSchedRows.data ?? []).reduce(
      (sum, r: any) =>
        sum + ((r?.recipient_ids as string[] | null)?.length ?? 0),
      0
    );

    const campSchedCount = await admin
      .from("deliveries")
      .select("id", { count: "exact", head: true })
      .eq("status", "scheduled")
      .gte("scheduled_at", from30)
      .lt("scheduled_at", to30);

    const attempted30 =
      sent30 + (mailScheduledCount ?? 0) + (campSchedCount.count ?? 0);

    const reachRate =
      attempted30 > 0 ? Number(((sent30 / attempted30) * 100).toFixed(2)) : 0;
    const openRate =
      sent30 > 0 ? Number(((opened30 / sent30) * 100).toFixed(2)) : 0;

    return NextResponse.json({
      metrics: {
        mailTotal,
        campaignTotal,
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
    return NextResponse.json(
      { error: e?.message || "server error" },
      { status: 500 }
    );
  }
}
