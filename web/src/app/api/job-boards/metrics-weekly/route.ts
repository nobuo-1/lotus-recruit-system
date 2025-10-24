export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type Period = "8w" | "26w" | "52w";
type Site = "mynavi" | "doda" | "type" | "wtype" | "rikunabi" | "en";

function weekKey(d: Date) {
  const yyyy = d.getFullYear();
  const oneJan = new Date(d.getFullYear(), 0, 1);
  const day = Math.floor((d.getTime() - oneJan.getTime()) / 86400000) + 1;
  const wk = Math.ceil(day / 7);
  return `${yyyy}-W${String(wk).padStart(2, "0")}`;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const period = (url.searchParams.get("period") as Period) || "26w";
    const site = (url.searchParams.get("site") as Site) || "mynavi";

    const sb = await supabaseServer();
    const { data: u } = await sb.auth.getUser();
    if (!u?.user)
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const { data: prof } = await sb
      .from("profiles")
      .select("tenant_id")
      .eq("id", u.user.id)
      .maybeSingle();
    const tenantId = prof?.tenant_id ?? null;

    const now = new Date();
    const start = new Date(now);
    start.setDate(
      start.getDate() -
        (period === "8w" ? 7 * 7 : period === "52w" ? 7 * 51 : 7 * 25)
    ); // 8/26/52 週間ぶん
    start.setHours(0, 0, 0, 0);
    const startIso = start.toISOString();

    const admin = supabaseAdmin();
    // job_board_weekly_stats: { tenant_id, site, week_start(date), postings, seekers, category_label, location, salary_band, employment, age_band }
    const { data } = await admin
      .from("job_board_weekly_stats")
      .select(
        "week_start, postings, seekers, category_label, location, salary_band, employment, age_band"
      )
      .eq("tenant_id", tenantId)
      .eq("site", site)
      .gte("week_start", startIso)
      .order("week_start", { ascending: true });

    const series = (data ?? []).map((r: any) => ({
      week: weekKey(new Date(r.week_start)),
      postings: r.postings || 0,
      seekers: r.seekers || 0,
      category_label: r.category_label,
      location: r.location,
      salary_band: r.salary_band,
      employment: r.employment,
      age_band: r.age_band,
    }));

    return NextResponse.json({ ok: true, site, filters: {}, series });
  } catch (e: any) {
    console.error("[api.job-boards.metrics-weekly]", e);
    return NextResponse.json(
      { error: e?.message || "server error" },
      { status: 500 }
    );
  }
}
