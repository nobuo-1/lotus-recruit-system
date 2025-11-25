// web/src/server/job-boards/womantype.ts

import type { ManualCondition } from "./types";

/** ======== 共通ユーティリティ ======== */

/** 数字文字列（カンマ付き）→ number | null */
function safeParseCount(raw: string | undefined | null): number | null {
  if (!raw) return null;
  const n = Number(String(raw).replace(/,/g, ""));
  if (Number.isNaN(n)) return null;
  return n;
}

/**
 * HTML から 女の転職type の求人件数を抜き出す内部処理
 *
 * 優先度:
 *  0. <span id="loading-count" ...>123</span>
 *  1. <span id="result-count" ...>123</span>
 *  2. 「123 件中 1～40 を表示」などのパターン
 *
 * ※ それぞれ複数回出現する可能性があるので、最大値を採用
 */
function parseWomanTypeJobsCountInternal(html: string): {
  count: number | null;
  hint: string | null;
} {
  // 0. <span id="loading-count" ...>123</span>
  {
    const re =
      /<span[^>]*id=["']loading-count["'][^>]*>\s*([\d,]+)\s*<\/span>/g;

    let max: number | null = null;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
      const n = safeParseCount(m[1]);
      if (n == null) continue;
      if (max == null || n > max) max = n;
    }
    if (max != null) {
      return { count: max, hint: "span#loading-count(max)" };
    }
  }

  // 1. <span id="result-count" ...>123</span>
  {
    const re = /<span[^>]*id=["']result-count["'][^>]*>\s*([\d,]+)\s*<\/span>/g;

    let max: number | null = null;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
      const n = safeParseCount(m[1]);
      if (n == null) continue;
      if (max == null || n > max) max = n;
    }
    if (max != null) {
      return { count: max, hint: "span#result-count(max)" };
    }
  }

  // 2. 「123 件中 1～40 を表示」 っぽいテキストから拾うゆるい fallback
  {
    const re =
      /([\d,]+)[\s　]*件中[\s　]*[\d,]+[\s　]*～[\s　]*[\d,]+[\s　]*を表示/g;

    let max: number | null = null;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
      const n = safeParseCount(m[1]);
      if (n == null) continue;
      if (max == null || n > max) max = n;
    }
    if (max != null) {
      return { count: max, hint: "text:○件中○～○を表示(max)" };
    }
  }

  return { count: null, hint: null };
}

/** 旧来互換: HTML 全体から件数だけ返す */
export function parseWomanTypeJobsCount(html: string): number | null {
  return parseWomanTypeJobsCountInternal(html).count;
}

/** =========================
 * 都道府県名 → 女の転職type エリアスラッグ
 * ========================= */
/**
 * ManualCondition.prefecture に入ってくる文字列
 *   - 「東京都」「神奈川県」「大阪府」など
 *   - もしくは "tokyo" や "area-tokyo" などのスラッグ文字列
 *
 * ここでは最低限、現状よく使いそうな都道府県だけマッピングしておき、
 * 足りないものは必要に応じて追加する前提にしている。
 */
const PREF_NAME_TO_WOMAN_AREA_SLUG: Record<string, string> = {
  東京都: "tokyo",
  神奈川県: "kanagawa",
  千葉県: "chiba",
  埼玉県: "saitama",

  大阪府: "osaka",
  兵庫県: "hyogo",
  京都府: "kyoto",

  愛知県: "aichi",

  北海道: "hokkaido",
  宮城県: "miyagi",
  福岡県: "fukuoka",

  // ★ ユーザーさんがすでに使っている石川県も追加
  石川県: "ishikawa",
  // ここに他県も必要に応じて足していく
};

/**
 * ManualCondition.prefecture から woman-type の「area-xxx」用スラッグを返す
 *
 * 例:
 *   "東京都"   → "tokyo"
 *   "area-tokyo" → "tokyo"
 *   "tokyo"    → "tokyo"
 */
function getWomanTypeAreaSlug(cond: ManualCondition): string | null {
  const raw = cond.prefecture?.trim();
  if (!raw) return null;

  // すでに "area-tokyo" のような形なら "tokyo" に変換
  if (/^area-[a-z0-9-]+$/i.test(raw)) {
    return raw.slice("area-".length);
  }

  // すでにスラッグっぽい場合はそのまま使う
  if (/^[a-z0-9-]+$/i.test(raw)) {
    return raw;
  }

  // 日本語都道府県名 → スラッグ
  const mapped = PREF_NAME_TO_WOMAN_AREA_SLUG[raw];
  return mapped ?? null;
}

/** =========================
 * 職種（external_small_code）→ job-office コード
 * ========================= */
/**
 * cond.internalSmall には job_board_mappings.external_small_code が入る想定。
 * 「10402」や「10402,10403」のような値を想定し、最初のコードを job-office コードとして使う。
 */
function buildWomanTypeJobCode(cond: ManualCondition): string | null {
  const raw = cond.internalSmall?.trim();
  if (!raw) return null;

  // カンマやプラスで複数指定されている可能性もあるので最初の1つを採用
  const first = raw.split(/[,+]/)[0]?.trim();
  if (!first) return null;

  const digits = first.replace(/[^0-9]/g, "");
  return digits || null;
}

/** =========================
 * URL 組み立て
 * ========================= */

const WOMAN_TYPE_BASE_URL = "https://woman-type.jp";

/**
 * ManualCondition から 女の転職type の検索 URL を組み立てる。
 *
 * 例:
 *   https://woman-type.jp/job-office/10402/area-tokyo/?routeway=79
 *
 * - 職種: /job-office/{jobCode}/
 * - 都道府県: /area-{slug}/
 * - その他は routeway=79 をクエリに付与（検索結果ページのルートウェイ）
 *
 * ※ prefecture が null の場合は /job-office/10402/?routeway=79 のような URL になる
 */
function buildWomanTypeListUrl(cond: ManualCondition): {
  url: string;
  jobCode: string | null;
  areaSlug: string | null;
} {
  const jobCode = buildWomanTypeJobCode(cond);
  const areaSlug = getWomanTypeAreaSlug(cond);

  const segments: string[] = [];

  if (jobCode) {
    segments.push("job-office", jobCode);
  }

  if (areaSlug) {
    segments.push(`area-${areaSlug}`);
  }

  // segments が空になることは基本想定していないが、保険でルートにしておく
  const path =
    segments.length > 0 ? `/${segments.join("/")}/` : "/job-search/?";

  const url = `${WOMAN_TYPE_BASE_URL.replace(/\/$/, "")}${path}?routeway=79`;

  return { url, jobCode, areaSlug };
}

/** =========================
 * fetch 実装
 * ========================= */

export type WomanTypeJobsCountResult = {
  /** 最終的に返した件数（null の場合は取得失敗） */
  total: number | null;
  /** 実際に叩いた URL */
  url: string;
  /** 使用したエリアスラッグ（例: "tokyo"） */
  areaSlug: string | null;
  /** 使用した職種コード（例: "10402"） */
  jobCode: string | null;
  /** HTTP ステータスコード（fetch結果） */
  httpStatus?: number | null;
  /** 件数パース時に使用したパターンのヒント */
  parseHint?: string | null;
  /** 失敗時のメッセージ（成功時は null） */
  errorMessage?: string | null;
};

const COMMON_HEADERS = {
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36",
  "accept-language": "ja-JP,ja;q=0.9,en;q=0.8",
  accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
  referer: "https://woman-type.jp/",
};

/**
 * Vercel (Next.js) から 女の転職type に直接アクセスして件数を取得する実装
 */
async function fetchWomanTypeJobsCountViaDirectFetch(
  url: string,
  areaSlug: string | null,
  jobCode: string | null
): Promise<WomanTypeJobsCountResult> {
  const controller = new AbortController();
  const timeoutMs = 15000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: COMMON_HEADERS as any,
      cache: "no-store",
      signal: controller.signal,
    });

    const httpStatus = res.status;

    if (!res.ok) {
      // 404 の場合は「条件に合う求人が存在しない」とみなして 0 件でフォールバック
      if (res.status === 404) {
        const msg = "woman-type list not found (404, treat as 0件)";
        console.warn(msg, { url });
        return {
          total: 0,
          url,
          areaSlug,
          jobCode,
          httpStatus,
          parseHint: "fallback:404->0",
          errorMessage: null,
        };
      }

      const msg = `woman-type list fetch failed: ${res.status} ${res.statusText}`;
      console.error(msg, { url });
      return {
        total: null,
        url,
        areaSlug,
        jobCode,
        httpStatus,
        parseHint: null,
        errorMessage: msg,
      };
    }

    const html = await res.text();
    const { count, hint } = parseWomanTypeJobsCountInternal(html);

    if (count == null) {
      const msg = "woman-type fetch could not parse jobs count";
      console.error(msg, {
        url,
        htmlSnippet: html.slice(0, 2000),
      });
      // パースできなかった場合も「0件」として扱う（バッチ全体をこけさないため）
      return {
        total: 0,
        url,
        areaSlug,
        jobCode,
        httpStatus,
        parseHint: hint ?? "fallback:parse-failed->0",
        errorMessage: null,
      };
    }

    return {
      total: count,
      url,
      areaSlug,
      jobCode,
      httpStatus,
      parseHint: hint,
      errorMessage: null,
    };
  } catch (err: any) {
    const msg =
      err?.name === "AbortError"
        ? "woman-type fetch aborted (timeout)"
        : `woman-type fetch error: ${err?.message ?? String(err)}`;

    console.error("woman-type fetch error", err, { url });

    return {
      total: null,
      url,
      areaSlug,
      jobCode,
      httpStatus: null,
      parseHint: null,
      errorMessage: msg,
    };
  } finally {
    clearTimeout(timer);
  }
}

/** =========================
 * 公開 API: 女の転職type 件数取得（単一条件）
 * ========================= */

/**
 * run-batch/route.ts から呼び出される公開関数。
 *
 * - job_board_mappings でマッピング済みの ManualCondition を受け取り
 * - 職種コード（job-office コード）＋エリアスラッグ入りの URL を叩き
 * - HTML から該当求人数を抜き出して結果オブジェクトを返す
 */
export async function fetchWomanTypeJobsCount(
  cond: ManualCondition
): Promise<WomanTypeJobsCountResult> {
  const { url, jobCode, areaSlug } = buildWomanTypeListUrl(cond);

  const result = await fetchWomanTypeJobsCountViaDirectFetch(
    url,
    areaSlug,
    jobCode
  );

  if (result.errorMessage) {
    console.error("woman-type jobs count error (direct)", result);
  } else {
    console.info("woman-type jobs count ok (direct)", {
      url: result.url,
      total: result.total,
      areaSlug: result.areaSlug,
      jobCode: result.jobCode,
      hint: result.parseHint,
      httpStatus: result.httpStatus,
    });
  }

  return result;
}
