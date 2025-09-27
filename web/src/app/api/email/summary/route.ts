import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export async function GET() {
  const supabase = await supabaseServer();
  const { data: u } = await supabase.auth.getUser();
  if (!u?.user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: prof } = await supabase
    .from("profiles")
    .select("tenant_id")
    .eq("id", u.user.id)
    .maybeSingle();
  const tenant = prof?.tenant_id;
  if (!tenant)
    return NextResponse.json({ error: "no tenant" }, { status: 400 });

  // キャンペーン総数
  const { count: campaignCount } = await supabase
    .from("campaigns")
    .select("*", { count: "exact", head: true })
    .eq("tenant_id", tenant);

  // 直近30日 配信試行（sent）
  const { count: sent30 } = await supabase
    .from("campaign_recipients")
    .select("*", { count: "exact", head: true })
    .eq("tenant_id", tenant)
    .gte(
      "sent_at",
      new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    );

  // 到達率 = sent / queued（簡易。statusやlast_errorの運用に合わせて調整）
  const { count: queued30 } = await supabase
    .from("campaign_recipients")
    .select("*", { count: "exact", head: true })
    .eq("tenant_id", tenant)
    .gte(
      "created_at",
      new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    );

  // 開封率（open_at あり ÷ sent）
  const { count: opened30 } = await supabase
    .from("campaign_recipients")
    .select("*", { count: "exact", head: true })
    .eq("tenant_id", tenant)
    .gte(
      "open_at",
      new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    );

  // 配信停止数（直近30日）
  const { count: unsub30 } = await supabase
    .from("recipients")
    .select("*", { count: "exact", head: true })
    .eq("tenant_id", tenant)
    .gte(
      "unsubscribed_at",
      new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    );

  // シンプルな日別シリーズ（直近14日：送信数）
  const from = new Date();
  from.setDate(from.getDate() - 13);
  const to = new Date();
  const { data: seriesRaw } = await supabase
    .from("campaign_recipients")
    .select("sent_at")
    .eq("tenant_id", tenant)
    .gte("sent_at", from.toISOString())
    .lte("sent_at", to.toISOString());

  const map = new Map<string, number>();
  for (let i = 0; i < 14; i++) {
    const d = new Date(from);
    d.setDate(from.getDate() + i);
    map.set(d.toISOString().slice(0, 10), 0);
  }
  (seriesRaw ?? []).forEach((r) => {
    const key = (r as any).sent_at?.slice(0, 10);
    if (key && map.has(key)) map.set(key, (map.get(key) ?? 0) + 1);
  });
  const series = Array.from(map.entries()).map(([date, count]) => ({
    date,
    count,
  }));

  const reachRate =
    queued30 && queued30 > 0 ? Math.round(((sent30 ?? 0) * 100) / queued30) : 0;
  const openRate =
    sent30 && sent30 > 0 ? Math.round(((opened30 ?? 0) * 100) / sent30) : 0;

  return NextResponse.json({
    ok: true,
    metrics: {
      campaignCount: campaignCount ?? 0,
      sent30: sent30 ?? 0,
      reachRate,
      openRate,
      unsub30: unsub30 ?? 0,
      series,
    },
  });
}
