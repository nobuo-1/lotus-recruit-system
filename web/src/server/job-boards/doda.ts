// web/src/server/job-boards/doda.ts

import type { ManualCondition } from "./types";

/** ======== 共通ユーティリティ ======== */

/** 数字文字列（カンマ付き）→ number | null */
function safeParseCount(raw: string | undefined | null): number | null {
  if (!raw) return null;
  const n = Number(raw.replace(/,/g, ""));
  if (Number.isNaN(n)) return null;
  return n;
}

/**
 * HTML から doda の求人件数を抜き出す内部処理
 *
 * - どのパターンで拾えたかを hint として返す
 */
function parseDodaJobsCountInternal(html: string): {
  count: number | null;
  hint: string | null;
} {
  // 0-1. サイドバー上部の件数
  // <span class="search-sidebar__total-count__number">840</span>
  {
    const m = html.match(
      /<span[^>]*class=["'][^"']*search-sidebar__total-count__number[^"']*["'][^>]*>\s*([\d,]+)\s*<\/span>/i
    );
    const n = safeParseCount(m?.[1]);
    if (n != null) {
      return {
        count: n,
        hint: "class:search-sidebar__total-count__number",
      };
    }
  }

  // 0-2. 検索結果ヘッダー部の件数
  // <span class="displayJobCount__totalNum">840</span>
  {
    const m = html.match(
      /<span[^>]*class=["'][^"']*displayJobCount__totalNum[^"']*["'][^>]*>\s*([\d,]+)\s*<\/span>/i
    );
    const n = safeParseCount(m?.[1]);
    if (n != null) {
      return {
        count: n,
        hint: "class:displayJobCount__totalNum",
      };
    }
  }

  // ① 「該当求人数 63 件中 1～50件 を表示」
  {
    const m = html.match(/該当求人数[\s\S]{0,80}?([\d,]+)\s*件/);
    const n = safeParseCount(m?.[1]);
    if (n != null) {
      return { count: n, hint: "text:該当求人数○件" };
    }
  }

  // ② 「この条件の求人数 63 件」
  {
    const m = html.match(/この条件の求人数[\s\S]{0,80}?([\d,]+)\s*件/);
    const n = safeParseCount(m?.[1]);
    if (n != null) {
      return { count: n, hint: "text:この条件の求人数○件" };
    }
  }

  // ③ 「公開求人数 58 件」
  {
    const m = html.match(/公開求人数[\s\S]{0,80}?([\d,]+)\s*件/);
    const n = safeParseCount(m?.[1]);
    if (n != null) {
      return { count: n, hint: "text:公開求人数○件" };
    }
  }

  // ④ <meta name="description" content="…公開求人数58件…">
  {
    const m = html.match(
      /<meta[^>]+name=["']description["'][^>]+content=["'][^"'>]*?([\d,]+)\s*件[^"'>]*["'][^>]*>/i
    );
    const n = safeParseCount(m?.[1]);
    if (n != null) {
      return { count: n, hint: "meta[name=description]" };
    }
  }

  // ⑤ ゆるい fallback
  {
    const m = html.match(
      /(該当求人数|この条件の求人数|求人)[\s\S]{0,120}?([\d,]+)\s*件/
    );
    const n = safeParseCount(m?.[2]);
    if (n != null) {
      return { count: n, hint: "text:ゆるい近傍マッチ" };
    }
  }

  return { count: null, hint: null };
}

/**
 * 旧来の公開 API: HTML 全体から件数だけを返す
 * （他のファイル互換用）
 */
export function parseDodaJobsCount(html: string): number | null {
  return parseDodaJobsCountInternal(html).count;
}

/** =========================
 * 都道府県名 → doda pr コード対応（1〜47）
 * ========================= */

const PREF_NAME_TO_DODA_CODE: Record<string, string> = {
  北海道: "1",
  青森県: "2",
  岩手県: "3",
  宮城県: "4",
  秋田県: "5",
  山形県: "6",
  福島県: "7",
  茨城県: "8",
  栃木県: "9",
  群馬県: "10",
  埼玉県: "11",
  千葉県: "12",
  東京都: "13",
  神奈川県: "14",
  新潟県: "15",
  富山県: "16",
  石川県: "17",
  福井県: "18",
  山梨県: "19",
  長野県: "20",
  岐阜県: "21",
  静岡県: "22",
  愛知県: "23",
  三重県: "24",
  滋賀県: "25",
  京都府: "26",
  大阪府: "27",
  兵庫県: "28",
  奈良県: "29",
  和歌山県: "30",
  鳥取県: "31",
  島根県: "32",
  岡山県: "33",
  広島県: "34",
  山口県: "35",
  徳島県: "36",
  香川県: "37",
  愛媛県: "38",
  高知県: "39",
  福岡県: "40",
  佐賀県: "41",
  長崎県: "42",
  熊本県: "43",
  大分県: "44",
  宮崎県: "45",
  鹿児島県: "46",
  沖縄県: "47",
};

/**
 * ManualCondition.prefecture（「大阪府」や「13」など）から
 * doda の pr コード（"27" など）を返す。
 */
function getDodaPrefectureCode(cond: ManualCondition): string | null {
  const raw = cond.prefecture?.trim();
  if (!raw) return null;

  // すでに数字コードっぽいとき（1〜47）
  if (/^\d{1,2}$/.test(raw)) {
    const n = Number(raw);
    if (1 <= n && n <= 47) return String(n);
  }

  // 「東京都」などの日本語からコードを引く
  const mapped = PREF_NAME_TO_DODA_CODE[raw];
  return mapped ?? null;
}

/** =========================
 * URL 組み立て
 * ========================= */

/**
 * ManualCondition から doda の検索 URL を組み立てる。
 *
 * 例:
 *   https://doda.jp/DodaFront/View/JobSearchList.action
 *     ?oc=031201S
 *     &pr=13
 *     &ss=1&pic=1&ds=0&tp=1&bf=1&mpsc_sid=10&oldestDayWdtno=0&leftPanelType=1
 *
 * - oc: job_board_mappings.external_small_code（例: "031201"）に "S" を付与したもの
 * - pr: 都道府県コード（1〜47）
 */
function buildDodaListUrl(
  cond: ManualCondition,
  prefCode: string | null
): { url: string; oc: string | null } {
  const BASE_URL = "https://doda.jp/DodaFront/View/JobSearchList.action";

  // job_board_mappings からマッピング済みの値を想定
  const rawSmall = cond.internalSmall?.trim() || "";
  const rawLarge = cond.internalLarge?.trim() || "";

  let oc: string | null = null;

  if (rawSmall) {
    // 小分類コード（例: "031201"）を前提に "S" を付ける
    const digits = rawSmall.replace(/[^0-9]/g, "");
    oc = digits ? `${digits}S` : null;
  } else if (rawLarge) {
    // 小分類が無い場合の保険として、大分類コードに "L" を付けて利用
    const digits = rawLarge.replace(/[^0-9]/g, "");
    oc = digits ? `${digits}L` : null;
  }

  const params = new URLSearchParams();

  if (oc) params.set("oc", oc);
  if (prefCode) params.set("pr", prefCode);

  // 固定パラメータ（UI のデフォルト値 & 参考 URL に合わせる）
  params.set("ss", "1");
  params.set("pic", "1");
  params.set("ds", "0");
  params.set("tp", "1");
  params.set("bf", "1");
  params.set("leftPanelType", "1");
  params.set("mpsc_sid", "10");
  params.set("oldestDayWdtno", "0");

  const url = `${BASE_URL}?${params.toString()}`;
  return { url, oc };
}

/** =========================
 * fetch 実装
 * ========================= */

export type DodaJobsCountResult = {
  /** 最終的に返した件数（null の場合は取得失敗） */
  total: number | null;
  /** 実際に叩いた URL */
  url: string;
  /** 使用した都道府県コード（例: "13"）*/
  prefCode: string | null;
  /** 使用した職種コード（例: "031201S"） */
  oc: string | null;
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
  referer: "https://doda.jp/",
};

/**
 * マイナビと同じ思想のシンプルな fetch 実装
 * - AbortController で 15 秒タイムアウト
 * - 1 回だけ試行
 * - 失敗したら total=null を即返す（Vercel の 300 秒タイムアウトを避ける）
 */
async function fetchDodaJobsCountViaFetch(
  url: string,
  prefCode: string | null,
  oc: string | null
): Promise<DodaJobsCountResult> {
  const controller = new AbortController();
  const timeoutMs = 15000; // 15秒
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: COMMON_HEADERS,
      cache: "no-store",
      signal: controller.signal,
    });

    const httpStatus = res.status;

    if (!res.ok) {
      const msg = `doda list fetch failed: ${res.status} ${res.statusText}`;
      console.error(msg, { url });
      return {
        total: null,
        url,
        prefCode,
        oc,
        httpStatus,
        parseHint: null,
        errorMessage: msg,
      };
    }

    const html = await res.text();
    const { count, hint } = parseDodaJobsCountInternal(html);

    if (count == null) {
      const msg = "doda fetch could not parse jobs count";
      console.error(msg, {
        url,
        htmlSnippet: html.slice(0, 2000),
      });
      return {
        total: null,
        url,
        prefCode,
        oc,
        httpStatus,
        parseHint: hint,
        errorMessage: msg,
      };
    }

    return {
      total: count,
      url,
      prefCode,
      oc,
      httpStatus,
      parseHint: hint,
      errorMessage: null,
    };
  } catch (err: any) {
    const msg =
      err?.name === "AbortError"
        ? "doda fetch aborted (timeout)"
        : `doda fetch error: ${err?.message ?? String(err)}`;

    console.error("doda fetch error", err, { url });

    return {
      total: null,
      url,
      prefCode,
      oc,
      httpStatus: null,
      parseHint: null,
      errorMessage: msg,
    };
  } finally {
    clearTimeout(timer);
  }
}

/** =========================
 * 公開 API: doda 件数取得（単一条件）
 * ========================= */

/**
 * run-batch/route.ts から呼び出される公開関数。
 *
 * - job_board_mappings でマッピング済みの ManualCondition を受け取り
 * - 職種コード（oc）＋都道府県コード（pr）入りの URL を叩き
 * - HTML から該当求人数（公開求人数）を抜き出して結果オブジェクトを返す
 */
export async function fetchDodaJobsCount(
  cond: ManualCondition
): Promise<DodaJobsCountResult> {
  const prefCode = getDodaPrefectureCode(cond);
  const { url, oc } = buildDodaListUrl(cond, prefCode);

  const result = await fetchDodaJobsCountViaFetch(url, prefCode, oc);

  if (result.errorMessage) {
    console.error("doda jobs count error", result);
  } else {
    console.info("doda jobs count ok", {
      url: result.url,
      total: result.total,
      prefCode: result.prefCode,
      oc: result.oc,
      hint: result.parseHint,
      httpStatus: result.httpStatus,
    });
  }

  return result;
}
