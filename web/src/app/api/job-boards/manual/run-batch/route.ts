// web/src/app/api/job-boards/manual/run-batch/route.ts
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * 手動ページ側の rows と揃えた型
 */
type ManualFetchRow = {
  site_key: string;
  internal_large: string | null;
  internal_small: string | null;
  age_band: string | null;
  employment_type: string | null;
  salary_band: string | null;
  prefecture: string | null;
  jobs_count: number | null;
  candidates_count: number | null;
};

type RunBatchRequestBody = {
  sites?: string[]; // ["mynavi", ...] だが今回は mynavi のみ対応
  large?: string[]; // ["営業", "ITエンジニア", ...]
  small?: string[]; // ["営業:::法人営業", ...] （JobCategoryModal の合成キー）
  age?: string[]; // ["20歳以下", "25歳以下", ...]
  emp?: string[]; // ["正社員", "契約社員", ...]
  sal?: string[]; // ["~300万", "300~400万", ...]
  pref?: string[]; // ["東京都", "大阪府", ...]
  want?: number; // 上限件数（例: 200） ※なければ 200
  saveMode?: "history" | "none"; // "history" のとき job_board_manual_runs に保存
};

/** ====== 職種の合成キーを分解 ====== */
const JOB_SEP = ":::";

function decodeJobKey(composite: string | null): {
  internal_large: string | null;
  internal_small: string | null;
} {
  if (!composite) return { internal_large: null, internal_small: null };
  if (!composite.includes(JOB_SEP)) {
    // 念のため従来形式（小分類ラベルだけ）の互換
    return { internal_large: null, internal_small: composite };
  }
  const [lg, sm] = composite.split(JOB_SEP);
  return {
    internal_large: lg || null,
    internal_small: sm || null,
  };
}

/** ====== HTML から求人数をパース ======
 *  - まず <p class="result__num"><em>123</em> の形式を狙う
 *  - 見つからなければ「該当の求人 123件」などのテキストから拾う
 */
function parseJobsCount(html: string): number {
  // <p class="result__num"> ... <em>45039</em><span>件</span> ...
  const m1 = html.match(
    /<p[^>]*class=["']result__num["'][^>]*>[\s\S]*?<em[^>]*>([\d,]+)<\/em>/i
  );
  if (m1 && m1[1]) {
    return Number(m1[1].replace(/,/g, "")) || 0;
  }

  // 「該当の求人  45039件」など
  const m2 = html.match(/該当の求人[^0-9]*([\d,]+)\s*件/);
  if (m2 && m2[1]) {
    return Number(m2[1].replace(/,/g, "")) || 0;
  }

  // 「条件に合う求人  45039 件」など
  const m3 = html.match(/条件に合う求人[^0-9]*([\d,]+)\s*件/);
  if (m3 && m3[1]) {
    return Number(m3[1].replace(/,/g, "")) || 0;
  }

  return 0;
}

/** ====== マイナビの検索 URL を組み立てる ======
 *
 * !!! 重要 !!!
 *  - 実際のマイナビ転職の検索フォームのパラメータに合わせて
 *    下の「TODO」の部分を調整してください。
 *  - 今は「ひとまず動く」ように、
 *    ・ベース URL: jobsearchType=14 & searchType=18
 *    ・キーワード検索パラメータ: fw=「職種/都道府県/雇用形態/年収/年齢層」を全部くっつけた文字列
 *    という形にしてあります。
 */
const MYNAVI_BASE =
  "https://tenshoku.mynavi.jp/list/?jobsearchType=14&searchType=18";

type MynaviSearchOptions = {
  internal_large: string | null;
  internal_small: string | null;
  prefecture: string | null;
  age_band: string | null;
  employment_type: string | null;
  salary_band: string | null;
};

function buildMynaviUrl(opt: MynaviSearchOptions): string {
  const url = new URL(MYNAVI_BASE);

  // --------------------------
  // 職種 → マイナビの職種キーワード or コード
  // --------------------------
  const jobWords: string[] = [];
  if (opt.internal_small) {
    // 例: 「営業:::法人営業」→ 「法人営業」
    jobWords.push(opt.internal_small);
  } else if (opt.internal_large) {
    jobWords.push(opt.internal_large);
  }

  // --------------------------
  // 都道府県 → キーワードで代用
  // --------------------------
  if (opt.prefecture) {
    jobWords.push(opt.prefecture);
  }

  // --------------------------
  // 雇用形態 / 年収帯 / 年齢層 もキーワードに付けておく
  // --------------------------
  if (opt.employment_type) {
    jobWords.push(opt.employment_type);
  }
  if (opt.salary_band) {
    jobWords.push(opt.salary_band);
  }
  if (opt.age_band) {
    jobWords.push(opt.age_band);
  }

  const freeWord = jobWords.join(" ");

  // TODO: 実サイトの HTML から、キーワード検索の name 属性を確認して書き換える
  if (freeWord) {
    url.searchParams.set("fw", freeWord);
  }

  return url.toString();
}

/** ====== 単一の条件でマイナビから求人数を取得 ====== */
async function fetchMynaviJobsCount(opt: MynaviSearchOptions): Promise<number> {
  const url = buildMynaviUrl(opt);

  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
      "Accept-Language": "ja,en;q=0.9",
    },
  });

  if (!res.ok) {
    console.warn("[mynavi] HTTP error", res.status, url);
    return 0;
  }

  const html = await res.text();
  const count = parseJobsCount(html);
  return count;
}

/** ====== 配列 or 空 → [null] に正規化 ====== */
function normalizeDimension(values?: string[] | null): (string | null)[] {
  if (!values || values.length === 0) return [null];
  return values;
}

/** ===== Supabase / tenant utilities ===== */
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function isValidUuid(v: unknown): v is string {
  if (typeof v !== "string") return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v
  );
}

function resolveTenantId(req: NextRequest, body?: any): string | null {
  const h = (req.headers.get("x-tenant-id") || "").trim();
  if (isValidUuid(h)) return h;

  const cookie = req.headers.get("cookie") || "";
  const m = cookie.match(/(?:^|;\s*)(x-tenant-id|tenant_id)=([^;]+)/i);
  if (m && isValidUuid(decodeURIComponent(m[2])))
    return decodeURIComponent(m[2]);

  if (isValidUuid(body?.tenant_id)) return String(body?.tenant_id);

  return null;
}

/**
 * POST /api/job-boards/manual/run-batch
 *
 * 手動実行ページから呼ばれるエンドポイント。
 *  - 今回は「マイナビ（mynavi）」のみ対応。
 *  - 年齢層/雇用形態/年収帯/都道府県/職種の全組み合わせで
 *    マイナビの検索を実行し、求人数を取得する。
 *  - saveMode === "history" のとき job_board_manual_runs に保存する。
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as RunBatchRequestBody;

    const sites = body.sites ?? [];
    const want = body.want && body.want > 0 ? body.want : 200;
    const saveMode = body.saveMode ?? "none";

    // 今回はマイナビのみ対応
    if (!sites.includes("mynavi")) {
      return NextResponse.json(
        { ok: false, error: "現在はマイナビ(mynavi)のみ対応しています。" },
        { status: 400 }
      );
    }

    // ---- 職種の次元（small が優先。なければ large 単位。どちらも空なら 1 パターン null） ----
    type JobDimension = {
      internal_large: string | null;
      internal_small: string | null;
    };

    const jobDims: JobDimension[] = [];

    if (body.small && body.small.length > 0) {
      for (const sk of body.small) {
        const { internal_large, internal_small } = decodeJobKey(sk);
        jobDims.push({ internal_large, internal_small });
      }
    } else if (body.large && body.large.length > 0) {
      for (const lg of body.large) {
        jobDims.push({ internal_large: lg, internal_small: null });
      }
    } else {
      jobDims.push({ internal_large: null, internal_small: null });
    }

    // ---- 他の次元を正規化 ----
    const ageDims = normalizeDimension(body.age);
    const empDims = normalizeDimension(body.emp);
    const salDims = normalizeDimension(body.sal);
    const prefDims = normalizeDimension(body.pref);

    const results: ManualFetchRow[] = [];

    // 組み合わせ総数のざっくり計算（ログ用）
    const totalComb =
      jobDims.length *
      ageDims.length *
      empDims.length *
      salDims.length *
      prefDims.length;

    console.log(
      `[manual-run] mynavi combinations: job=${jobDims.length}, age=${ageDims.length}, emp=${empDims.length}, sal=${salDims.length}, pref=${prefDims.length} (total=${totalComb})`
    );

    let processed = 0;

    // ==== 全組み合わせループ ====
    for (const job of jobDims) {
      for (const pref of prefDims) {
        for (const age of ageDims) {
          for (const emp of empDims) {
            for (const sal of salDims) {
              if (results.length >= want) {
                break;
              }

              const opt: MynaviSearchOptions = {
                internal_large: job.internal_large,
                internal_small: job.internal_small,
                prefecture: pref,
                age_band: age,
                employment_type: emp,
                salary_band: sal,
              };

              let jobsCount: number | null = null;

              try {
                jobsCount = await fetchMynaviJobsCount(opt);
              } catch (e) {
                console.warn("[manual-run] fetchMynaviJobsCount error", e);
                jobsCount = null;
              }

              results.push({
                site_key: "mynavi",
                internal_large: job.internal_large,
                internal_small: job.internal_small,
                prefecture: pref,
                age_band: age,
                employment_type: emp,
                salary_band: sal,
                jobs_count: jobsCount,
                candidates_count: null, // 今回はまだ未取得
              });

              processed++;
            }
            if (results.length >= want) break;
          }
          if (results.length >= want) break;
        }
        if (results.length >= want) break;
      }
      if (results.length >= want) break;
    }

    let historyId: string | null = null;

    // ====== job_board_manual_runs へ保存（saveMode === "history" のとき） ======
    if (saveMode === "history") {
      const tenantId = resolveTenantId(req, body);

      if (tenantId && isValidUuid(tenantId)) {
        try {
          const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
          const params = {
            sites,
            large: body.large ?? [],
            small: body.small ?? [],
            age: body.age ?? [],
            emp: body.emp ?? [],
            sal: body.sal ?? [],
            pref: body.pref ?? [],
            want,
            site_key: "mynavi",
            via: "manual-run-batch",
          };

          const { data, error } = await admin
            .from("job_board_manual_runs")
            .insert({
              tenant_id: tenantId,
              params,
              results,
              result_count: results.length,
            })
            .select("id")
            .single();

          if (error) throw error;
          historyId = data?.id ?? null;
        } catch (e) {
          console.error("[manual-run] failed to save history", e);
        }
      } else {
        console.warn(
          "[manual-run] saveMode=history だが tenant_id が解決できませんでした。保存はスキップします。"
        );
      }
    }

    const note = [
      "マイナビから求人数を取得しました。",
      `試行した組み合わせ数: ${processed}`,
      `レスポンスに含めた件数: ${results.length}`,
      totalComb > results.length
        ? `※ want=${want} の上限に達したため、全組み合わせ(${totalComb})の一部のみ実行しています。`
        : "",
      historyId
        ? `job_board_manual_runs に保存しました（ID: ${historyId}）`
        : "",
    ]
      .filter(Boolean)
      .join("\n");

    return NextResponse.json({
      ok: true,
      preview: results,
      note,
      history_id: historyId,
    });
  } catch (e: any) {
    console.error("[manual-run] error", e);
    return NextResponse.json(
      {
        ok: false,
        error: e?.message || String(e),
      },
      { status: 500 }
    );
  }
}
