// web/src/app/api/job-boards/metrics/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type Period = "1m" | "1y" | "3y";

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const period = (url.searchParams.get("period") as Period) || "1y";
    const sites = (url.searchParams.get("sites") || "mynavi,doda,type,wtype")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const sb = await supabaseServer();
    const { data: u } = await sb.auth.getUser();
    if (!u?.user)
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const { data: prof } = await sb
      .from("profiles")
      .select("tenant_id")
      .eq("id", u.user.id)
      .maybeSingle();
    const tenantId = prof?.tenant_id as string | undefined;

    const admin = supabaseAdmin();

    // 期間開始（当月含めて過去Nヶ月分を返す）
    const now = new Date();
    const start = new Date(now);
    if (period === "1m") start.setMonth(start.getMonth() - 0);
    else if (period === "1y") start.setMonth(start.getMonth() - 11);
    else start.setMonth(start.getMonth() - 35); // 3y = 36ヶ月

    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    const startIso = start.toISOString();

    // job_board_stats: { tenant_id, site, month (YYYY-MM-01), postings, seekers, ... }
    const { data: rows } = await admin
      .from("job_board_stats")
      .select("site, month, postings, seekers")
      .eq("tenant_id", tenantId ?? null)
      .in("site", sites)
      .gte("month", startIso)
      .order("month", { ascending: true });

    // 月ごと集計（サイト合算）
    const sum = new Map<string, { postings: number; seekers: number }>();
    if (rows) {
      for (const r of rows as any[]) {
        const d = new Date(r.month);
        const key = monthKey(d);
        const cur = sum.get(key) || { postings: 0, seekers: 0 };
        cur.postings += r.postings || 0;
        cur.seekers += r.seekers || 0;
        sum.set(key, cur);
      }
    }

    // 欠損月を0で埋める
    const out: { month: string; postings: number; seekers: number }[] = [];
    const cursor = new Date(start);
    const endKey = monthKey(now);
    while (true) {
      const key = monthKey(cursor);
      const v = sum.get(key) || { postings: 0, seekers: 0 };
      out.push({ month: key, postings: v.postings, seekers: v.seekers });
      if (key === endKey) break;
      cursor.setMonth(cursor.getMonth() + 1);
      cursor.setDate(1);
    }

    const totals = out.reduce(
      (acc, r) => {
        acc.postings += r.postings;
        acc.seekers += r.seekers;
        return acc;
      },
      { postings: 0, seekers: 0 }
    );

    return NextResponse.json({
      ok: true,
      filters: { sites },
      series: out,
      totals,
    });
  } catch (e: any) {
    console.error("[api.job-boards.metrics] error", e);
    return NextResponse.json(
      { error: e?.message || "server error" },
      { status: 500 }
    );
  }
}
