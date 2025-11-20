// web/src/app/api/job-boards/manual/run-batch/route.ts
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";

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
  saveMode?: "history" | "none"; // 将来 DB 保存するかどうかのフラグ用（今は未使用）
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

/** ====== マイナビの検索 URL を組み立てる ====== */
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

  const jobWords: string[] = [];
  if (opt.internal_small) {
    jobWords.push(opt.internal_small);
  } else if (opt.internal_large) {
    jobWords.push(opt.internal_large);
  }

  if (opt.prefecture) {
    jobWords.push(opt.prefecture);
  }
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

  if (freeWord) {
    // 実サイトの name="fw" を想定
    url.searchParams.set("fw", freeWord);
  }

  return url.toString();
}

/** ====== タイムアウト付き fetch ====== */
async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  ms = 12000
): Promise<Response> {
  const ctl = new AbortController();
  const id = setTimeout(() => ctl.abort(), ms);
  try {
    return await fetch(url, {
      ...init,
      signal: ctl.signal,
    });
  } finally {
    clearTimeout(id);
  }
}

/** ====== 単一の条件でマイナビから求人数を取得 ====== */
async function fetchMynaviJobsCount(opt: MynaviSearchOptions): Promise<number> {
  const url = buildMynaviUrl(opt);

  const res = await fetchWithTimeout(
    url,
    {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
        "Accept-Language": "ja,en;q=0.9",
      },
    },
    12000
  );

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

/** ==== 安全のためのハード上限 ====
 *  - 1回の実行で実際にマイナビへ投げる最大リクエスト数
 *  - want や組み合わせ数よりも優先される
 */
const MAX_FETCHES_HARD = 40;
const CONCURRENCY = 5;
const MAX_ELAPSED_MS = 45_000;

/**
 * POST /api/job-boards/manual/run-batch
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as RunBatchRequestBody;

    const sites = body.sites ?? [];
    const want = body.want && body.want > 0 ? body.want : 200;

    // 今回はマイナビのみ対応
    if (!sites.includes("mynavi")) {
      return NextResponse.json(
        { ok: false, error: "現在はマイナビ(mynavi)のみ対応しています。" },
        { status: 400 }
      );
    }

    // ---- 職種の次元 ----
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

    // ==== 全組み合わせを一旦列挙 ====
    const allCombos: MynaviSearchOptions[] = [];
    for (const job of jobDims) {
      for (const pref of prefDims) {
        for (const age of ageDims) {
          for (const emp of empDims) {
            for (const sal of salDims) {
              allCombos.push({
                internal_large: job.internal_large,
                internal_small: job.internal_small,
                prefecture: pref,
                age_band: age,
                employment_type: emp,
                salary_band: sal,
              });
            }
          }
        }
      }
    }

    const totalComb = allCombos.length;
    const maxFetches = Math.min(want, MAX_FETCHES_HARD, totalComb);

    console.log(
      `[manual-run] mynavi combinations total=${totalComb}, execute=${maxFetches}`
    );

    const results: ManualFetchRow[] = [];
    const start = Date.now();

    let index = 0;
    while (index < maxFetches) {
      const chunk = allCombos.slice(index, index + CONCURRENCY);

      const chunkResults = await Promise.all(
        chunk.map(async (opt) => {
          let jobsCount: number | null = null;
          try {
            jobsCount = await fetchMynaviJobsCount(opt);
          } catch (e) {
            console.warn("[manual-run] fetchMynaviJobsCount error", e);
            jobsCount = null;
          }

          return { opt, jobsCount };
        })
      );

      for (const { opt, jobsCount } of chunkResults) {
        results.push({
          site_key: "mynavi",
          internal_large: opt.internal_large,
          internal_small: opt.internal_small,
          prefecture: opt.prefecture,
          age_band: opt.age_band,
          employment_type: opt.employment_type,
          salary_band: opt.salary_band,
          jobs_count: jobsCount,
          candidates_count: null, // 求職者数は後日実装
        });
      }

      index += CONCURRENCY;

      if (Date.now() - start > MAX_ELAPSED_MS) {
        console.warn(
          "[manual-run] timeout safeguard: returning partial results"
        );
        break;
      }
    }

    const processed = results.length;

    const noteParts: string[] = [
      "マイナビから求人数を取得しました。",
      `試行予定の組み合わせ数: ${totalComb}`,
      `実際に取得を行った組み合わせ数: ${processed}`,
      `レスポンスに含めた件数: ${results.length}`,
    ];

    if (totalComb > processed || processed >= MAX_FETCHES_HARD) {
      noteParts.push(
        `※ 上限 (${MAX_FETCHES_HARD}件 または want=${want}) とタイムアウト対策により、全組み合わせ(${totalComb})の一部のみ取得しています。条件（職種・都道府県・年齢層など）を絞るとより正確になります。`
      );
    }

    return NextResponse.json({
      ok: true,
      preview: results,
      note: noteParts.join("\n"),
      history_id: null, // 将来「手動実行履歴」に保存する場合用
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
