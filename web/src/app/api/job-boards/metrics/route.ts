// web/src/app/api/job-boards/metrics/route.ts
import { NextResponse } from "next/server";

export const runtime = "edge";

type Mode = "weekly" | "monthly";
type RangeW = "12w" | "26w" | "52w";
type RangeM = "12m" | "36m";
type Metric = "jobs" | "candidates";

type Req = {
  mode: Mode;
  metric: Metric;
  sites: string[];
  large: string[];
  small: string[];
  age: string[];
  emp: string[];
  sal: string[];
  range: RangeW | RangeM;
};

type Row = {
  week_start?: string | null;
  month_start?: string | null;
  site_key: string;
  large_category: string | null;
  small_category: string | null;
  age_band?: string | null;
  employment_type?: string | null;
  salary_band?: string | null;
  jobs_count: number | null;
  candidates_count: number | null;
};

const SB_URL =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SB_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "";

function sbHeaders() {
  return {
    apikey: SB_KEY,
    Authorization: `Bearer ${SB_KEY}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };
}

// ---- util ----
function startOfWeekISO(d: Date) {
  const dt = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  );
  const dow = dt.getUTCDay();
  const diff = (dow + 6) % 7;
  dt.setUTCDate(dt.getUTCDate() - diff);
  dt.setUTCHours(0, 0, 0, 0);
  return dt.toISOString().slice(0, 10);
}
function startOfMonthISO(d: Date) {
  const dt = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  dt.setUTCHours(0, 0, 0, 0);
  return dt.toISOString().slice(0, 10);
}
function fromDateByRange(mode: Mode, range: RangeW | RangeM) {
  const now = new Date();
  const dt = new Date(now);
  if (mode === "weekly") {
    const weeks = range === "12w" ? 12 : range === "26w" ? 26 : 52;
    dt.setUTCDate(dt.getUTCDate() - weeks * 7);
  } else {
    const months = range === "12m" ? 12 : 36;
    dt.setUTCMonth(dt.getUTCMonth() - months);
  }
  return dt.toISOString();
}

// RPC があれば使う（任意）
async function tryRpc(body: Req): Promise<Row[] | null> {
  try {
    const r = await fetch(`${SB_URL}/rest/v1/rpc/job_boards_metrics_fallback`, {
      method: "POST",
      headers: sbHeaders(),
      body: JSON.stringify(body),
    });
    if (!r.ok) return null;
    const rows = (await r.json()) as Row[];
    return rows ?? [];
  } catch {
    return null;
  }
}

// ---- main ----
export async function POST(req: Request) {
  try {
    if (!SB_URL || !SB_KEY) {
      return NextResponse.json(
        { error: "Supabase env (URL/KEY) is missing" },
        { status: 500 }
      );
    }

    const body = (await req.json()) as Req;

    // 1) RPC 優先
    const rpc = await tryRpc(body);
    if (rpc) return NextResponse.json({ rows: rpc });

    // 2) フォールバック（site_key が無い環境に対応）
    const fromISO = fromDateByRange(body.mode, body.range);

    // 2-1) results 取得：まず site_key を試し、失敗したら site のみで再取得
    let results:
      | {
          id: string;
          captured_at: string;
          site_key?: string | null;
          site?: string | null;
        }[] = [];
    let selectCols = "id,captured_at,site_key";
    let res = await fetch(
      `${SB_URL}/rest/v1/job_board_results?select=${encodeURIComponent(
        selectCols
      )}&captured_at=gte.${encodeURIComponent(fromISO)}&order=captured_at.asc`,
      { headers: sbHeaders() }
    );

    if (!res.ok) {
      // site_key が無い場合の 42703 などで落ちたら site だけで再トライ
      selectCols = "id,captured_at,site";
      res = await fetch(
        `${SB_URL}/rest/v1/job_board_results?select=${encodeURIComponent(
          selectCols
        )}&captured_at=gte.${encodeURIComponent(
          fromISO
        )}&order=captured_at.asc`,
        { headers: sbHeaders() }
      );
    }
    if (!res.ok) throw new Error(await res.text());
    results = (await res.json()) as any[];

    if (results.length === 0) return NextResponse.json({ rows: [] });

    // 2-2) 集計用のキー化
    const resMap = new Map<string, { dateKey: string; siteKey: string }>();
    for (const r of results) {
      const cap = new Date(r.captured_at);
      const dateKey =
        body.mode === "weekly" ? startOfWeekISO(cap) : startOfMonthISO(cap);
      const siteKey = r.site_key || r.site || "unknown";
      resMap.set(r.id, { dateKey, siteKey });
    }

    const ids = results.map((x) => x.id);
    const chunk = <T>(arr: T[], n: number) =>
      Array.from({ length: Math.ceil(arr.length / n) }, (_, i) =>
        arr.slice(i * n, i * n + n)
      );

    type CountRow = {
      result_id: string;
      internal_large?: string | null;
      internal_small?: string | null;
      site_category_code?: string | null;
      site_category_label?: string | null;
      jobs_count?: number | null;
      candidates_count?: number | null;
      age_band?: string | null;
      employment_type?: string | null;
      salary_band?: string | null;
    };

    const allCounts: CountRow[] = [];
    for (const group of chunk(ids, 500)) {
      const inList = group.map((x) => `"${x}"`).join(",");
      const q = `job_board_counts?select=result_id,internal_large,internal_small,site_category_code,site_category_label,jobs_count,candidates_count,age_band,employment_type,salary_band&result_id=in.(${encodeURIComponent(
        inList
      )})`;
      const cRes = await fetch(`${SB_URL}/rest/v1/${q}`, {
        headers: sbHeaders(),
      });
      if (!cRes.ok) throw new Error(await cRes.text());
      allCounts.push(...((await cRes.json()) as CountRow[]));
    }

    // フィルタ
    const siteSet = new Set(body.sites ?? []);
    const largeSet = new Set(body.large ?? []);
    const smallSet = new Set(body.small ?? []);
    const hasLarge = largeSet.size > 0;
    const hasSmall = smallSet.size > 0;

    type Agg = { jobs: number; cands: number };
    const agg = new Map<string, Agg>();

    for (const c of allCounts) {
      const m = resMap.get(c.result_id);
      if (!m) continue;

      const siteKey = m.siteKey;
      if (siteSet.size > 0 && !siteSet.has(siteKey)) continue;

      const lg = c.internal_large || "";
      const sm = c.internal_small || "";
      if (hasLarge && !largeSet.has(lg)) continue;
      if (hasSmall && !smallSet.has(sm)) continue;

      const key = `${m.dateKey}__${siteKey}`;
      const cur = agg.get(key) || { jobs: 0, cands: 0 };
      cur.jobs += Number(c.jobs_count ?? 0);
      cur.cands += Number(c.candidates_count ?? 0);
      agg.set(key, cur);
    }

    const out: Row[] = [];
    for (const [key, val] of agg) {
      const [dateKey, siteKey] = key.split("__");
      out.push({
        week_start: body.mode === "weekly" ? dateKey : null,
        month_start: body.mode === "monthly" ? dateKey : null,
        site_key: siteKey,
        large_category: null,
        small_category: null,
        jobs_count: val.jobs,
        candidates_count: val.cands,
      });
    }
    out.sort((a, b) => {
      const da = (a.week_start || a.month_start || "") as string;
      const db = (b.week_start || b.month_start || "") as string;
      if (da !== db) return da < db ? -1 : 1;
      return a.site_key < b.site_key ? -1 : 1;
    });

    return NextResponse.json({ rows: out });
  } catch (e: any) {
    return NextResponse.json(
      { error: String(e?.message || e) },
      { status: 500 }
    );
  }
}
