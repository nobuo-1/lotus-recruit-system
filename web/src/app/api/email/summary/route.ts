// web/src/app/api/email/summary/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

// range パラメタ → 期間日数
function daysOf(range: string | null) {
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

function startOfRange(range: string | null) {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - daysOf(range));
  return d.toISOString();
}

function dateKey(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(d.getTime())
    ? ""
    : `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(
        2,
        "0"
      )}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const range = url.searchParams.get("range");

  const sb = await supabaseServer();
  const { data: u } = await sb.auth.getUser();
  if (!u?.user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: prof } = await sb
    .from("profiles")
    .select("tenant_id")
    .eq("id", u.user.id)
    .maybeSingle();
  const tenantId = (prof?.tenant_id as string | undefined) ?? undefined;

  const startISO = startOfRange(range);

  // ========== 基礎データ ==========
  // mails / campaigns の ID（テナント限定）
  const { data: mails } = await sb
    .from("mails")
    .select("id")
    .match(tenantId ? { tenant_id: tenantId } : {});
  const mailIds = (mails ?? []).map((m: any) => String(m.id));

  const { data: camps } = await sb
    .from("campaigns")
    .select("id")
    .match(tenantId ? { tenant_id: tenantId } : {});
  const campIds = (camps ?? []).map((c: any) => String(c.id));

  // 総数（全期間）
  const mailTotal = mailIds.length;
  const campaignTotal = campIds.length;

  // ========== オールタイム配信済み ==========
  let mailSentAll = 0;
  if (mailIds.length) {
    const { count } = await sb
      .from("mail_deliveries")
      .select("id", { count: "exact", head: true })
      .in("mail_id", mailIds)
      .eq("status", "sent");
    mailSentAll = count ?? 0;
  }
  const { count: campSentAll } = await sb
    .from("deliveries")
    .select("id", { count: "exact", head: true })
    .match(tenantId ? { tenant_id: tenantId } : {})
    .eq("status", "sent");
  const allTimeSends = mailSentAll + (campSentAll ?? 0);

  // ========== 期間内の送信済み（シリーズ用） ==========
  const seriesTotal: Record<string, number> = {};
  const seriesMail: Record<string, number> = {};
  const seriesCamp: Record<string, number> = {};

  if (mailIds.length) {
    const { data: md } = await sb
      .from("mail_deliveries")
      .select("sent_at")
      .in("mail_id", mailIds)
      .eq("status", "sent")
      .gte("sent_at", startISO);
    (md ?? []).forEach((r: any) => {
      const k = dateKey(r.sent_at);
      if (!k) return;
      seriesMail[k] = (seriesMail[k] || 0) + 1;
      seriesTotal[k] = (seriesTotal[k] || 0) + 1;
    });
  }

  const { data: cd } = await sb
    .from("deliveries")
    .select("sent_at")
    .match(tenantId ? { tenant_id: tenantId } : {})
    .eq("status", "sent")
    .gte("sent_at", startISO);
  (cd ?? []).forEach((r: any) => {
    const k = dateKey(r.sent_at);
    if (!k) return;
    seriesCamp[k] = (seriesCamp[k] || 0) + 1;
    seriesTotal[k] = (seriesTotal[k] || 0) + 1;
  });

  // series を昇順配列へ
  function toSeries(obj: Record<string, number>) {
    return Object.entries(obj)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([date, count]) => ({ date, count }));
  }

  // ========== 直近30日の KPI（到達率・開封率） ==========
  const last30ISO = startOfRange("1m");

  // 到達率：分母 = sent + bounced、分子 = sent
  let mailSent30 = 0;
  let mailAttempt30 = 0;
  if (mailIds.length) {
    const { count: s1 } = await sb
      .from("mail_deliveries")
      .select("id", { count: "exact", head: true })
      .in("mail_id", mailIds)
      .eq("status", "sent")
      .gte("sent_at", last30ISO);
    const { count: b1 } = await sb
      .from("mail_deliveries")
      .select("id", { count: "exact", head: true })
      .in("mail_id", mailIds)
      .eq("status", "bounced")
      .gte("sent_at", last30ISO); // bounced に sent_at が無い場合は created_at に変更
    mailSent30 = s1 ?? 0;
    mailAttempt30 = (s1 ?? 0) + (b1 ?? 0);
  }

  const { count: campSent30 } = await sb
    .from("deliveries")
    .select("id", { count: "exact", head: true })
    .match(tenantId ? { tenant_id: tenantId } : {})
    .eq("status", "sent")
    .gte("sent_at", last30ISO);

  const { count: campBounced30 } = await sb
    .from("deliveries")
    .select("id", { count: "exact", head: true })
    .match(tenantId ? { tenant_id: tenantId } : {})
    .eq("status", "bounced")
    .gte("sent_at", last30ISO);

  const sent30 = (mailSent30 ?? 0) + (campSent30 ?? 0);
  const attempt30 =
    (mailAttempt30 ?? 0) + ((campSent30 ?? 0) + (campBounced30 ?? 0));

  const reachRate =
    attempt30 > 0 ? Number(((sent30 / attempt30) * 100).toFixed(2)) : 0;

  // 開封率：分母 = sent30、分子 = opens(ユニーク delivery_id)
  // ※ email_opens テーブル名は環境に合わせてください
  let open30 = 0;
  if (sent30 > 0) {
    // 直近30日の "sent" delivery_id を収集
    const sentMailIds: string[] = [];
    if (mailIds.length) {
      const { data: mrows } = await sb
        .from("mail_deliveries")
        .select("id")
        .in("mail_id", mailIds)
        .eq("status", "sent")
        .gte("sent_at", last30ISO);
      (mrows ?? []).forEach((r: any) => sentMailIds.push(String(r.id)));
    }
    const { data: crows } = await sb
      .from("deliveries")
      .select("id")
      .match(tenantId ? { tenant_id: tenantId } : {})
      .eq("status", "sent")
      .gte("sent_at", last30ISO);
    const sentCampIds = (crows ?? []).map((r: any) => String(r.id));
    const targetIds = [...sentMailIds, ...sentCampIds];

    if (targetIds.length) {
      const chunk = <T>(arr: T[], size: number) => {
        const a = [...arr];
        const out: T[][] = [];
        while (a.length) out.push(a.splice(0, size));
        return out;
      };
      let sum = 0;
      for (const part of chunk(targetIds, 1000)) {
        const { count } = await sb
          .from("email_opens")
          .select("delivery_id", { count: "exact", head: true })
          .in("delivery_id", part)
          .gte("created_at", last30ISO);
        sum += count ?? 0;
      }
      open30 = sum;
    }
  }

  const openRate =
    sent30 > 0 ? Number(((open30 / sent30) * 100).toFixed(2)) : 0;

  const payload = {
    metrics: {
      mailTotal,
      campaignTotal,
      allTimeSends,
      reachRate,
      openRate,
      series: {
        total: toSeries(seriesTotal),
        mail: toSeries(seriesMail),
        campaign: toSeries(seriesCamp),
      },
    },
  };

  return NextResponse.json(payload);
}
