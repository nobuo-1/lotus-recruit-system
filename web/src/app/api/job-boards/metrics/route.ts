// web/src/app/api/job-boards/metrics/route.ts
import { NextResponse } from "next/server";
import { JOB_CATEGORIES, JOB_LARGE } from "@/constants/jobCategories";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { SHARED_RESEARCH_TENANT_ID } from "@/server/job-boards/sharedResearch";

export const runtime = "nodejs";

type Mode = "weekly" | "monthly";
type Metric = "jobs" | "candidates";
type Payload = {
  mode: Mode;
  metric: Metric;
  sites?: string[];
  large?: string[];
  small?: string[];
  pref?: string[];
  age?: string[];
  emp?: string[];
  sal?: string[];
  range?: "12w" | "26w" | "52w" | "12m" | "36m";
};

type ResultRow = {
  id: string;
  captured_at: string;
};

type CountRow = {
  result_id: string;
  site_key: string | null;
  internal_large: string | null;
  internal_small: string | null;
  prefecture: string | null;
  jobs_count: number | null;
  candidates_count: number | null;
};

const PAGE_SIZE = 1000;
const RESULT_CHECK_CHUNK_SIZE = 25;

type FilterParams = {
  large: string[];
  small: string[];
  pref: string[];
  age: string[];
  emp: string[];
  sal: string[];
};

function toIsoDate(d: Date) {
  return d.toISOString();
}

function periodKeyForCapturedAt(capturedAt: string, mode: Mode) {
  const d = new Date(capturedAt);
  const day = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  );
  const dow = day.getUTCDay();
  const delta = (dow + 6) % 7;
  day.setUTCDate(day.getUTCDate() - delta);

  if (mode === "weekly") return day.toISOString().slice(0, 10);

  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))
    .toISOString()
    .slice(0, 10);
}

function fromRange(mode: Mode, range?: string) {
  const now = new Date();
  if (mode === "weekly") {
    const weeks = range === "12w" ? 12 : range === "52w" ? 52 : 26;
    const from = new Date(now.getTime() - weeks * 7 * 24 * 3600 * 1000);
    from.setUTCHours(0, 0, 0, 0);
    return { from: toIsoDate(from) };
  }

  const months = range === "36m" ? 36 : 12;
  const from = new Date(now.getUTCFullYear(), now.getUTCMonth() - months, 1);
  return { from: toIsoDate(from) };
}

function compact(values: string[] | undefined) {
  if (!Array.isArray(values)) return [];
  return Array.from(new Set(values.map((v) => String(v).trim()).filter(Boolean)));
}

function candidateLargeNamesForFilters(filters: {
  large: string[];
  small: string[];
}) {
  const smallSet = new Set(filters.small);
  const largeSet = new Set(filters.large);
  const largeNames: string[] = [];

  for (const large of JOB_LARGE) {
    if (largeSet.size > 0 && !largeSet.has(large)) continue;
    const smalls = JOB_CATEGORIES[large] ?? [];
    if (smalls.length === 0) continue;
    if (smallSet.size > 0 && !smalls.some((small) => smallSet.has(small))) {
      continue;
    }
    largeNames.push(large);
  }

  return Array.from(new Set(largeNames));
}

function dedupeCandidateRows(rows: CountRow[]) {
  const byLargePref = new Map<string, CountRow>();

  for (const row of rows) {
    const key = [
      row.result_id,
      row.site_key ?? "",
      row.internal_large ?? "",
      row.prefecture ?? "",
    ].join(":");

    if (byLargePref.has(key)) continue;
    byLargePref.set(key, row);
  }

  return Array.from(byLargePref.values());
}

async function fetchResults(from: string, _mode: Mode) {
  const admin = supabaseAdmin();
  const rows: ResultRow[] = [];

  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await admin
      .from("job_board_results")
      .select("id,captured_at")
      .eq("tenant_id", SHARED_RESEARCH_TENANT_ID)
      .gte("captured_at", from)
      .order("captured_at", { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) throw error;
    rows.push(...((data ?? []) as ResultRow[]));
    if (!data || data.length < PAGE_SIZE) break;
  }

  return rows;
}

function applyCountFilters(query: any, params: FilterParams) {
  let q = query;
  if (params.large.length > 0) q = q.in("internal_large", params.large);
  if (params.small.length > 0) q = q.in("internal_small", params.small);
  if (params.pref.length > 0) q = q.in("prefecture", params.pref);
  if (params.age.length > 0) q = q.in("age_band", params.age);
  if (params.emp.length > 0) q = q.in("employment_type", params.emp);
  if (params.sal.length > 0) q = q.in("salary_band", params.sal);
  return q;
}

async function findMetricResultInChunk(params: {
  resultIds: string[];
  site: string;
  metricColumn: string;
  filters: FilterParams;
}) {
  if (params.resultIds.length === 0) return null;

  const admin = supabaseAdmin();
  let q = admin
    .from("job_board_counts")
    .select("result_id")
    .in("result_id", params.resultIds)
    .eq("site_key", params.site)
    .limit(1000);

  q =
    params.metricColumn === "jobs_count"
      ? q.gt(params.metricColumn, 0)
      : q.not(params.metricColumn, "is", null);

  q = applyCountFilters(q, params.filters);
  const { data, error } = await q;
  if (error || !data?.length) return null;

  const order = new Map(params.resultIds.map((id, index) => [id, index]));
  let bestId: string | null = null;
  let bestIndex = Number.POSITIVE_INFINITY;
  for (const row of data as Array<{ result_id: string }>) {
    const index = order.get(row.result_id);
    if (index == null || index >= bestIndex) continue;
    bestId = row.result_id;
    bestIndex = index;
  }

  return bestId;
}

async function selectResultSitePairs(params: {
  results: ResultRow[];
  sites: string[];
  mode: Mode;
  metricColumn: string;
  filters: FilterParams;
}) {
  const pairs: Array<{
    resultId: string;
    capturedAt: string;
    site: string;
    periodKey: string;
  }> = [];

  const resultsByPeriod = new Map<string, ResultRow[]>();
  for (const result of params.results) {
    const periodKey = periodKeyForCapturedAt(result.captured_at, params.mode);
    const list = resultsByPeriod.get(periodKey);
    if (list) list.push(result);
    else resultsByPeriod.set(periodKey, [result]);
  }

  for (const [periodKey, periodResults] of resultsByPeriod.entries()) {
    const byId = new Map(periodResults.map((result) => [result.id, result]));
    for (const site of params.sites) {
      let matched: ResultRow | null = null;
      for (
        let offset = 0;
        offset < periodResults.length && !matched;
        offset += RESULT_CHECK_CHUNK_SIZE
      ) {
        const chunk = periodResults.slice(
          offset,
          offset + RESULT_CHECK_CHUNK_SIZE
        );
        const resultId = await findMetricResultInChunk({
          resultIds: chunk.map((result) => result.id),
          site,
          metricColumn: params.metricColumn,
          filters: params.filters,
        });
        matched = resultId ? byId.get(resultId) ?? null : null;
      }

      if (!matched) continue;
      pairs.push({
        resultId: matched.id,
        capturedAt: matched.captured_at,
        site,
        periodKey,
      });
    }
  }

  return pairs;
}

async function fetchCountsForPair(params: {
  resultId: string;
  site: string;
  metric: Metric;
  filters: FilterParams;
  useCandidateRollups: boolean;
}) {
  const admin = supabaseAdmin();
  const metricColumn =
    params.metric === "jobs" ? "jobs_count" : "candidates_count";

  const fetchRows = async (rollupsOnly: boolean) => {
    const rows: CountRow[] = [];

    for (let offset = 0; ; offset += PAGE_SIZE) {
      let q = admin
        .from("job_board_counts")
        .select(`result_id,site_key,internal_large,internal_small,prefecture,${metricColumn}`)
        .eq("result_id", params.resultId)
        .eq("site_key", params.site)
        .not(metricColumn, "is", null);

      if (rollupsOnly) q = q.is("internal_small", null);
      q = applyCountFilters(q, params.filters);

      const { data, error } = await q.range(offset, offset + PAGE_SIZE - 1);
      if (error) throw error;

      rows.push(...((data ?? []) as CountRow[]));
      if (!data || data.length < PAGE_SIZE) break;
    }

    return rows;
  };

  if (!params.useCandidateRollups) return fetchRows(false);

  const rollupRows = await fetchRows(true);
  if (rollupRows.length > 0) return rollupRows;

  const rawRows = await fetchRows(false);
  return dedupeCandidateRows(rawRows);
}

function isUnclassified(row: CountRow, metric: Metric) {
  if (!row.internal_large) return true;
  if (metric === "jobs" && !row.internal_small) return true;
  return false;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Payload;
    const mode = body.mode ?? "weekly";
    const { from } = fromRange(mode, body.range);
    const sites = compact(body.sites);
    const metric = body.metric ?? "jobs";
    const metricColumn = metric === "jobs" ? "jobs_count" : "candidates_count";
    const filters = {
      large: compact(body.large),
      small: compact(body.small),
      pref: compact(body.pref),
      age: compact(body.age),
      emp: compact(body.emp),
      sal: compact(body.sal),
    };
    const countFilters =
      metric === "candidates"
        ? {
            ...filters,
            large: candidateLargeNamesForFilters(filters),
            small: [],
          }
        : filters;

    if (Array.isArray(body.sites) && sites.length === 0) {
      return NextResponse.json({ rows: [] });
    }

    const rowsR = await fetchResults(from, mode);
    if (rowsR.length === 0) {
      return NextResponse.json({ rows: [] });
    }

    const pairs = await selectResultSitePairs({
      results: rowsR,
      sites,
      mode,
      metricColumn,
      filters: countFilters,
    });

    const outMap = new Map<string, any>();

    for (const pair of pairs) {
      const rowsC = await fetchCountsForPair({
        resultId: pair.resultId,
        site: pair.site,
        metric,
        filters: countFilters,
        useCandidateRollups: metric === "candidates",
      });

      const d = new Date(pair.capturedAt);
      const weekStart = new Date(
        Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
      );
      const dow = weekStart.getUTCDay();
      const delta = (dow + 6) % 7;
      weekStart.setUTCDate(weekStart.getUTCDate() - delta);

      const monthStart = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
      const week = weekStart.toISOString().slice(0, 10);
      const month = monthStart.toISOString().slice(0, 10);
      const period = mode === "weekly" ? week : month;
      const key = `${period}:${pair.site}`;

      const current =
        outMap.get(key) ??
        {
          week_start: week,
          month_start: month,
          site_key: pair.site,
          large_category: null,
          small_category: null,
          prefecture: null,
          age_band: null,
          employment_type: null,
          salary_band: null,
          jobs_count: 0,
          candidates_count: 0,
          condition_count: 0,
          unclassified_condition_count: 0,
          unclassified_jobs_count: 0,
          unclassified_candidates_count: 0,
        };

      for (const r of rowsC) {
        const unclassified = isUnclassified(r, metric);
        current.condition_count += 1;
        if (unclassified) current.unclassified_condition_count += 1;

        if (metric === "candidates") {
          const value = r.candidates_count ?? 0;
          current.candidates_count += value;
          if (unclassified) current.unclassified_candidates_count += value;
          continue;
        }

        const value = r.jobs_count ?? 0;
        current.jobs_count += value;
        if (unclassified) current.unclassified_jobs_count += value;
      }
      outMap.set(key, current);
    }

    return NextResponse.json({ rows: Array.from(outMap.values()) });
  } catch (e: any) {
    return NextResponse.json(
      { error: String(e?.message || e) },
      { status: 500 }
    );
  }
}
