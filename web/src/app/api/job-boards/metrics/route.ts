// web/src/app/api/job-boards/metrics/route.ts
export const runtime = "nodejs";
import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";

const pool =
  (global as any).__pgPool ||
  ((global as any).__pgPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 5,
  }));

type Body = {
  mode: "weekly" | "monthly";
  metric: "jobs" | "candidates";
  sites?: string[];
  large?: string[];
  small?: string[];
  age?: string[]; // 未使用（スキーマ上の列なし）
  emp?: string[]; // 未使用
  sal?: string[]; // 未使用
  range: "12w" | "26w" | "52w" | "12m" | "36m";
};

export async function POST(req: NextRequest) {
  const b = (await req.json()) as Body;

  const weeks =
    b.range === "12w"
      ? 12
      : b.range === "26w"
      ? 26
      : b.range === "52w"
      ? 52
      : 26;
  const months = b.range === "12m" ? 12 : b.range === "36m" ? 36 : 12;

  const since =
    b.mode === "weekly"
      ? `date_trunc('week', now()) - make_interval(weeks => ${weeks - 1})`
      : `date_trunc('month', now()) - make_interval(months => ${months - 1})`;

  const dateCol =
    b.mode === "weekly"
      ? "date_trunc('week', r.captured_at) AS bucket"
      : "date_trunc('month', r.captured_at) AS bucket";

  const where: string[] = [
    `r.captured_at >= ${since}`,
    // サイト（指定がある場合のみ）
    ...(b.sites && b.sites.length
      ? [`COALESCE(r.site_key, r.site, c.site_category_code) = ANY($1)`]
      : ["TRUE"]),
    // 大分類・小分類（指定がある場合のみ）
    ...(b.large && b.large.length ? [`c.internal_large = ANY($2)`] : ["TRUE"]),
    ...(b.small && b.small.length ? [`c.internal_small = ANY($3)`] : ["TRUE"]),
  ];

  // パラメータ
  const params: any[] = [];
  if (b.sites && b.sites.length) params.push(b.sites);
  if (b.large && b.large.length) params.push(b.large);
  if (b.small && b.small.length) params.push(b.small);

  const metricCol =
    b.metric === "jobs" ? "SUM(c.jobs_count)" : "SUM(c.candidates_count)";

  const sql = `
    SELECT
      ${dateCol},
      COALESCE(r.site_key, r.site, c.site_category_code) AS site_key,
      ${metricCol} AS value,
      SUM(c.jobs_count)    AS jobs_count,
      SUM(c.candidates_count) AS candidates_count
    FROM public.job_board_counts c
    JOIN public.job_board_results r ON r.id = c.result_id
    WHERE ${where.join(" AND ")}
    GROUP BY bucket, site_key
    ORDER BY bucket ASC, site_key ASC
  `;

  const client = await pool.connect();
  try {
    const { rows } = await client.query(sql, params);
    // 返却形式をフロントと合わせる（週 or 月の列名）
    const rowsOut = rows.map((r: any) => ({
      week_start: b.mode === "weekly" ? r.bucket : null,
      month_start: b.mode === "monthly" ? r.bucket : null,
      site_key: r.site_key,
      jobs_count: Number(r.jobs_count) || 0,
      candidates_count: Number(r.candidates_count) || 0,
    }));
    return NextResponse.json({ rows: rowsOut });
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message || String(e) },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
