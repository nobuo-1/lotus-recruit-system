// web/src/app/api/job-boards/manual/run-batch/route.ts
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
import { normalizeCategory } from "@/lib/job-boards/normalize";

/** ================== Env ================== */
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!SUPABASE_URL)
  console.warn("[run-batch] NEXT_PUBLIC_SUPABASE_URL is empty");
if (!SUPABASE_SERVICE_ROLE_KEY)
  console.warn("[run-batch] SUPABASE_SERVICE_ROLE_KEY is empty");

/** ================== Types ================== */
type SiteKey = "mynavi" | "doda" | "type" | "womantype";

/** UI 側のプレビュー行 */
type PreviewRow = {
  site_key: SiteKey;
  internal_large: string | null;
  internal_small: string | null;
  age_band: string | null;
  employment_type: string | null;
  salary_band: string | null;
  prefecture: string | null;
  jobs_count: number | null;
  candidates_count: number | null;
};

/** サイト生データ（取得器の出力想定） */
type RawRow = {
  site_category_code?: string | null;
  site_category_label?: string | null;
  age_band?: string | null;
  employment_type?: string | null;
  salary_band?: string | null;
  prefecture?: string | null;
  jobs_count?: number | null;
  candidates_count?: number | null;
};

/** リクエストBody */
type RunBatchBody = {
  sites?: SiteKey[];
  large?: string[];
  small?: string[];
  age?: string[];
  emp?: string[];
  sal?: string[];
  pref?: string[];
  want?: number; // サイト×カテゴリの上限目安
};

/** DB insert 用 */
type JobBoardCountRow = {
  result_id: string;
  site_key: SiteKey;
  site_category_code: string | null;
  site_category_label: string | null;
  internal_large: string | null;
  internal_small: string | null;
  age_band: string | null;
  employment_type: string | null;
  salary_band: string | null;
  prefecture: string | null;
  jobs_count: number | null;
  candidates_count: number | null;
};

type RunBatchResponse =
  | {
      ok: true;
      result_id: string;
      saved: number;
      preview: PreviewRow[];
      note?: string;
    }
  | { ok: false; error: string };

/** ================== Utils ================== */
const clamp = (n: any, min: number, max: number) =>
  Math.max(min, Math.min(max, Math.floor(Number(n) || 0)));

const ensureStrOrNull = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length ? s : null;
};

const ensureNumOrNull = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const chunk = <T>(arr: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

/** ================== フェッチャ（差し替えポイント） ==================
 * 実装を差し替える場合は siteFetchers の中身を置換してください。
 */
type SiteFetcher = (filters: {
  large?: string[];
  small?: string[];
  age?: string[];
  emp?: string[];
  sal?: string[];
  pref?: string[];
  want: number;
}) => Promise<RawRow[]>;

/** デモフェッチャ：最低限 UI/保存が回るダミー */
const makeDummyFetcher = (site: SiteKey): SiteFetcher => {
  return async ({ large, small, age, emp, sal, pref, want }) => {
    const L = (large && large.length ? large : ["ITエンジニア", "営業"]).slice(
      0,
      2
    );
    const S = (small && small.length ? small : ["インフラ", "法人営業"]).slice(
      0,
      2
    );
    const P = (pref && pref.length ? pref : [null as unknown as string]).slice(
      0,
      2
    );
    const A = (age && age.length ? age : [null as unknown as string]).slice(
      0,
      1
    );
    const E = (emp && emp.length ? emp : [null as unknown as string]).slice(
      0,
      1
    );
    const Y = (sal && sal.length ? sal : [null as unknown as string]).slice(
      0,
      1
    );

    const cap = clamp(want, 1, 50);
    const rows: RawRow[] = [];
    let c = 0;
    for (const l of L) {
      for (const s of S) {
        for (const pf of P) {
          rows.push({
            site_category_code: null,
            site_category_label: `${l}/${s}`,
            age_band: A[0] ?? null,
            employment_type: E[0] ?? null,
            salary_band: Y[0] ?? null,
            prefecture: pf ?? null,
            jobs_count: Math.floor(100 + Math.random() * 400),
            candidates_count:
              site === "doda" ? Math.floor(30 + Math.random() * 120) : null,
          });
          c++;
          if (c >= cap) break;
        }
        if (c >= cap) break;
      }
      if (c >= cap) break;
    }
    await new Promise((r) => setTimeout(r, 180));
    return rows;
  };
};

const siteFetchers: Record<SiteKey, SiteFetcher> = {
  mynavi: makeDummyFetcher("mynavi"),
  doda: makeDummyFetcher("doda"),
  type: makeDummyFetcher("type"),
  womantype: makeDummyFetcher("womantype"),
};

/** ================== Handler ================== */
export async function POST(req: Request) {
  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json(
        {
          ok: false,
          error: "Supabase service role not configured",
        } as RunBatchResponse,
        { status: 500 }
      );
    }
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 入力正規化
    const body: RunBatchBody = await req
      .json()
      .catch(() => ({} as RunBatchBody));
    const sites: SiteKey[] = (
      Array.isArray(body.sites) && body.sites.length
        ? body.sites
        : (["mynavi", "doda", "type", "womantype"] as SiteKey[])
    ).filter((s): s is SiteKey =>
      ["mynavi", "doda", "type", "womantype"].includes(String(s))
    );
    const want = clamp(body.want ?? 12, 1, 200);

    const result_id = randomUUID();

    const toInsert: JobBoardCountRow[] = [];
    const preview: PreviewRow[] = [];

    for (const site of sites) {
      const fetcher = siteFetchers[site];
      if (!fetcher) continue;

      const raw = await fetcher({
        large: body.large ?? [],
        small: body.small ?? [],
        age: body.age ?? [],
        emp: body.emp ?? [],
        sal: body.sal ?? [],
        pref: body.pref ?? [],
        want,
      });

      for (const r of raw) {
        // 正規化（undefined を null に潰す）
        const norm = normalizeCategory(
          site,
          ensureStrOrNull(r.site_category_label),
          ensureStrOrNull(r.site_category_code)
        );
        const internal_large = norm.large ?? null;
        const internal_small = norm.small ?? null;

        const rec: JobBoardCountRow = {
          result_id,
          site_key: site,
          site_category_code: ensureStrOrNull(r.site_category_code),
          site_category_label: ensureStrOrNull(r.site_category_label),
          internal_large,
          internal_small,
          age_band: ensureStrOrNull(r.age_band),
          employment_type: ensureStrOrNull(r.employment_type),
          salary_band: ensureStrOrNull(r.salary_band),
          prefecture: ensureStrOrNull(r.prefecture),
          jobs_count: ensureNumOrNull(r.jobs_count),
          candidates_count: ensureNumOrNull(r.candidates_count),
        };

        toInsert.push(rec);

        preview.unshift({
          site_key: site,
          internal_large,
          internal_small,
          age_band: rec.age_band,
          employment_type: rec.employment_type,
          salary_band: rec.salary_band,
          prefecture: rec.prefecture,
          jobs_count: rec.jobs_count,
          candidates_count: rec.candidates_count,
        });
      }
    }

    if (toInsert.length === 0) {
      return NextResponse.json({
        ok: true,
        result_id,
        saved: 0,
        preview: [],
        note: "該当データがありませんでした（取得器の実装待ち / 条件に合致なし）",
      } satisfies RunBatchResponse);
    }

    // INSERT（500件チャンク）。← ★ TS2554 対策：select は 0-1 引数のみ
    let saved = 0;
    for (const group of chunk(toInsert, 500)) {
      const { error, data } = await admin
        .from("job_board_counts")
        .insert(group)
        .select("id"); // ← ここを 1 引数に修正（以前は第2引数で TS2554）

      if (error) {
        return NextResponse.json({
          ok: true,
          result_id,
          saved,
          preview,
          note: `一部保存に失敗: ${error.message}`,
        } satisfies RunBatchResponse);
      }
      saved += data?.length ?? group.length; // count オプションを使わず保存件数を算出
    }

    return NextResponse.json({
      ok: true,
      result_id,
      saved,
      preview,
      note: `保存完了 (${saved} 件)`,
    } satisfies RunBatchResponse);
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: String(e?.message || e) } as RunBatchResponse,
      { status: 500 }
    );
  }
}
