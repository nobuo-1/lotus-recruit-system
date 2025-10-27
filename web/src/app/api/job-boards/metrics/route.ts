// web/src/app/api/job-boards/metrics/route.ts
import { NextResponse } from "next/server";

export const runtime = "edge";

const SB_URL =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SB_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "";

const DEFAULT_TENANT_ID = "175b1a9d-3f85-482d-9323-68a44d214424";

function sbHeaders() {
  return {
    apikey: SB_KEY,
    Authorization: `Bearer ${SB_KEY}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };
}

type Mode = "weekly" | "monthly";
type Metric = "jobs" | "candidates";
type Payload = {
  mode: Mode;
  metric: Metric;
  sites?: string[];
  large?: string[];
  small?: string[];
  age?: string[];
  emp?: string[];
  sal?: string[];
  range?: "12w" | "26w" | "52w" | "12m" | "36m";
};

function toIsoDate(d: Date) {
  return d.toISOString();
}

function fromRange(mode: Mode, range?: string) {
  const now = new Date();
  if (mode === "weekly") {
    const weeks = range === "12w" ? 12 : range === "52w" ? 52 : 26;
    const from = new Date(now.getTime() - weeks * 7 * 24 * 3600 * 1000);
    // 週頭（Mon）に寄せる（Postgres 週頭差異吸収用）
    from.setUTCHours(0, 0, 0, 0);
    return { from: toIsoDate(from) };
  } else {
    const months = range === "36m" ? 36 : 12;
    const from = new Date(now.getUTCFullYear(), now.getUTCMonth() - months, 1);
    return { from: toIsoDate(from) };
  }
}

function buildInParam(values: string[] | undefined) {
  if (!values || values.length === 0) return "";
  // in.("a","b") 形式（URLエンコード）
  const quoted = values.map((v) => `"${v}"`).join(",");
  return `in.(${encodeURIComponent(quoted)})`;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Payload;
    const tenantId = req.headers.get("x-tenant-id") ?? DEFAULT_TENANT_ID;

    const mode = body.mode ?? "weekly";
    const metric = body.metric ?? "jobs";
    const { from } = fromRange(mode, body.range);

    // 1) 期間内の結果ID（captured_at）を取得
    const resR = await fetch(
      `${SB_URL}/rest/v1/job_board_results?select=id,captured_at,tenant_id&tenant_id=eq.${tenantId}&captured_at=gte.${encodeURIComponent(
        from
      )}&order=captured_at.asc`,
      { headers: sbHeaders(), cache: "no-store" }
    );
    if (!resR.ok) throw new Error(await resR.text());
    const rowsR = (await resR.json()) as { id: string; captured_at: string }[];

    if (rowsR.length === 0) {
      return NextResponse.json({ rows: [] });
    }

    // 2) counts を result_id で引き、サイト/職種/年齢/雇用/年収でフィルタ
    //    PostgREST の in フィルタは 2048文字制限に注意 → 期間が長くても 52週×4サイト程度なのでOK
    const idCsv = rowsR.map((r) => r.id).join(",");
    const siteIn = buildInParam(body.sites);
    const lgIn = buildInParam(body.large);
    const smIn = buildInParam(body.small);
    const ageIn = buildInParam(body.age);
    const empIn = buildInParam(body.emp);
    const salIn = buildInParam(body.sal);

    let url = `${SB_URL}/rest/v1/job_board_counts?select=result_id,site_key,internal_large,internal_small,age_band,employment_type,salary_band,jobs_count,candidates_count&result_id=in.(${idCsv})`;
    if (siteIn) url += `&site_key=${siteIn}`;
    if (lgIn) url += `&internal_large=${lgIn}`;
    if (smIn) url += `&internal_small=${smIn}`;
    if (ageIn) url += `&age_band=${ageIn}`;
    if (empIn) url += `&employment_type=${empIn}`;
    if (salIn) url += `&salary_band=${salIn}`;

    const resC = await fetch(url, { headers: sbHeaders(), cache: "no-store" });
    if (!resC.ok) throw new Error(await resC.text());
    const rowsC = (await resC.json()) as any[];

    // 3) result_id -> captured_at のマップ
    const dateMap = new Map(rowsR.map((r) => [r.id, r.captured_at]));

    // 4) 週次/⽉次キーを組み立て、rows として返す
    const out: any[] = [];
    for (const r of rowsC) {
      const captured = dateMap.get(r.result_id);
      if (!captured) continue;
      const d = new Date(captured);
      const week_start = new Date(
        Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
      );
      // 週頭(Mon)補正
      const dow = week_start.getUTCDay(); // 0=Sun
      const delta = (dow + 6) % 7; // Mon=0
      week_start.setUTCDate(week_start.getUTCDate() - delta);

      const month_start = new Date(
        Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)
      );

      out.push({
        week_start: week_start.toISOString().slice(0, 10),
        month_start: month_start.toISOString().slice(0, 10),
        site_key: r.site_key,
        large_category: r.internal_large,
        small_category: r.internal_small,
        age_band: r.age_band,
        employment_type: r.employment_type,
        salary_band: r.salary_band,
        jobs_count: r.jobs_count ?? 0,
        candidates_count: r.candidates_count ?? 0,
      });
    }

    return NextResponse.json({ rows: out });
  } catch (e: any) {
    return NextResponse.json(
      { error: String(e?.message || e) },
      { status: 500 }
    );
  }
}
