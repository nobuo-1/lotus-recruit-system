// web/src/server/job-boards/mynavi.ts

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
 * マイナビの検索結果ページ HTML から
 * 「条件に合う求人 ○○件を検索する」や「全○○件中」の ○○件 を抜き出す
 *
 * ※ 都道府県の有無に関係なく、「その URL に表示されている検索結果件数」を返す
 *
 * ※ 優先順位:
 *   1. <span class="js__searchRecruit--count">○○</span>
 *   2. 「条件に合う求人 ○○ 件 を検索する」
 *   3. 「全 ○○ 件中」
 *   4. 「検索結果一覧 ○○ 件」
 *   5. 「求人情報 ○○ 件」
 *   6. それ以外（検索結果 / 該当の求人 / 条件に合う求人 付近の ○○件）
 */
export function parseMynaviJobsCount(html: string): number | null {
  // ① <span class="js__searchRecruit--count">○○</span>
  const m1 = html.match(
    /<span[^>]*class=["'][^"']*js__searchRecruit--count[^"']*["'][^>]*>\s*([\d,]+)\s*<\/span>/i
  );
  const n1 = safeParseCount(m1?.[1]);
  if (n1 != null) return n1;

  // ② 「条件に合う求人  44601 件 を検索する」
  const m2 = html.match(
    /条件に合う求人[\s　]*([\d,]+)[\s　]*件[\s　]*を検索する/
  );
  const n2 = safeParseCount(m2?.[1]);
  if (n2 != null) return n2;

  // ③ 「1件〜50件（全44601件中）」の「全44601件中」
  const m3 = html.match(/全[\s　]*([\d,]+)[\s　]*件中/);
  const n3 = safeParseCount(m3?.[1]);
  if (n3 != null) return n3;

  // ④ <meta name="description" content="…検索結果一覧44,601件！…">
  const m4 = html.match(/検索結果一覧[\s　]*([\d,]+)[\s　]*件/);
  const n4 = safeParseCount(m4?.[1]);
  if (n4 != null) return n4;

  // ⑤ <meta name="description" content="…求人情報136,982件！…">
  const m5 = html.match(/求人情報[\s　]*([\d,]+)[\s　]*件/);
  const n5 = safeParseCount(m5?.[1]);
  if (n5 != null) return n5;

  // ⑥ かなり緩い fallback：「求人」「該当」「検索結果」付近の「○○件」
  const m6 = html.match(
    /(検索結果|該当の求人|条件に合う求人)[\s\S]{0,80}?([\d,]+)\s*件/
  );
  const n6 = safeParseCount(m6?.[2]);
  if (n6 != null) return n6;

  return null;
}

/** =========================
 * 都道府県関連ヘルパー
 * ========================= */

/** 47都道府県（海外除く）の path 部分 */
const ALL_PREF_PATH =
  "p01+p02+p03+p04+p05+p06+p07+p08+p09+p10+p11+p12+p13+p14+p15+p19+p20+p16+p17+p18+p21+p22+p23+p24+p25+p26+p27+p28+p29+p30+p31+p32+p33+p34+p35+p36+p37+p38+p39+p40+p41+p42+p43+p44+p45+p46+p47";

/** =========================
 * 都道府県名 → マイナビ P コード対応
 * ========================= */
const PREF_NAME_TO_CODE: Record<string, string> = {
  北海道: "P01",
  青森県: "P02",
  岩手県: "P03",
  宮城県: "P04",
  秋田県: "P05",
  山形県: "P06",
  福島県: "P07",
  茨城県: "P08",
  栃木県: "P09",
  群馬県: "P10",
  埼玉県: "P11",
  千葉県: "P12",
  東京都: "P13",
  神奈川県: "P14",
  新潟県: "P15",
  富山県: "P16",
  石川県: "P17",
  福井県: "P18",
  山梨県: "P19",
  長野県: "P20",
  岐阜県: "P21",
  静岡県: "P22",
  愛知県: "P23",
  三重県: "P24",
  滋賀県: "P25",
  京都府: "P26",
  大阪府: "P27",
  兵庫県: "P28",
  奈良県: "P29",
  和歌山県: "P30",
  鳥取県: "P31",
  島根県: "P32",
  岡山県: "P33",
  広島県: "P34",
  山口県: "P35",
  徳島県: "P36",
  香川県: "P37",
  愛媛県: "P38",
  高知県: "P39",
  福岡県: "P40",
  佐賀県: "P41",
  長崎県: "P42",
  熊本県: "P43",
  大分県: "P44",
  宮崎県: "P45",
  鹿児島県: "P46",
  沖縄県: "P47",
};

/**
 * ManualCondition.prefecture（「大阪府」や「P27」など）から
 * マイナビの P コード（"P27"）を返す。
 */
function getMynaviPrefectureCode(cond: ManualCondition): string | null {
  const raw = cond.prefecture?.trim();
  if (!raw) return null;

  // すでに Pコード形式のとき
  if (/^P\d{2}$/i.test(raw)) {
    return `P${raw.slice(1).padStart(2, "0")}`.toUpperCase();
  }

  const mapped = PREF_NAME_TO_CODE[raw];
  return mapped ?? null;
}

/** prefecture 名から Pコードを直接取るヘルパー（複数都道府県用） */
function getMynaviPrefCodeFromName(name: string): string | null {
  const raw = name.trim();
  if (!raw) return null;
  const mapped = PREF_NAME_TO_CODE[raw];
  return mapped ?? null;
}

/** =========================
 * 職種（external_small_code） → URL パス
 * ========================= */

/**
 * external_small_code（例: "112+111+126" や "o112+o111"）から
 * マイナビの URL 用職種パス（例: "o112+o111+o126"）を生成
 *
 * - "+" 区切りで複数コードを指定可能
 * - 先頭に "o" が付いていなければ付与する
 */
function buildJobPathSegment(
  externalSmallCode: string | null | undefined
): string {
  const raw = externalSmallCode?.trim();
  if (!raw) return "";

  const parts = raw
    .split("+")
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  if (parts.length === 0) return "";

  const withPrefix = parts.map((p) => {
    const lower = p.toLowerCase();
    if (lower.startsWith("o")) return lower;
    return `o${lower}`;
  });

  return withPrefix.join("+");
}

/** =========================
 * マイナビ件数取得用 型
 * ========================= */

/** マイナビ件数取得のデバッグ用構造 */
export type MynaviJobsCountResult = {
  /** 最終的に返した件数（null の場合は取得失敗） */
  total: number | null;
  /** どこから取れたか: header=ページ上部 / none=取得失敗 */
  source: "header" | "none";
  /** 実際に叩いた URL */
  url: string;
  /** 使用した P コード（例: P13） */
  prefCode: string | null;
  /** モーダル起点は使わないので常に null（互換用） */
  modalCount: number | null;
  /** ページ上部（全体件数）から読めた件数（null の場合はヒットなし） */
  headerCount: number | null;
};

const JOBSEARCH_TYPE = "14";
const SEARCH_TYPE = "18";
const BASE_LIST_URL = "https://tenshoku.mynavi.jp";

/** =========================
 * URL 組み立て
 * ========================= */

/**
 * 職種（external_small_code）+ 都道府県 Pコード から
 * 実際に叩くマイナビの検索 URL を組み立てる。
 *
 * 仕様:
 * - 職種は external_small_code から生成した jobPath (例: "o112+o111+o126")
 * - 都道府県は path 部分の "pXX" または ALL_PREF_PATH で指定
 *
 * 例:
 *   (pref=P13, jobPath="o112+o111") →
 *     https://tenshoku.mynavi.jp/list/p13/o112+o111/?jobsearchType=14&searchType=18&refLoc=fnc_sra
 *
 *   (pref=null, jobPath="o112+o111") →
 *     https://tenshoku.mynavi.jp/list/p01+...+p47/o112+o111/?jobsearchType=14&searchType=18&refLoc=fnc_sra
 */
function buildMynaviListUrl(
  cond: ManualCondition,
  prefCode: string | null
): string {
  const params = new URLSearchParams();
  params.set("jobsearchType", JOBSEARCH_TYPE);
  params.set("searchType", SEARCH_TYPE);
  params.set("refLoc", "fnc_sra");

  const jobPath = buildJobPathSegment(cond.internalSmall ?? null);

  const prefPath = prefCode
    ? prefCode.toLowerCase() // P13 → p13
    : ALL_PREF_PATH;

  const pathWithJob = jobPath ? `${prefPath}/${jobPath}` : prefPath;

  return `${BASE_LIST_URL}/list/${pathWithJob}/?${params.toString()}`;
}

/** =========================
 * fetch ベースの実装
 * ========================= */

/**
 * マイナビの検索件数を取得するメイン関数（fetch 版）
 *
 * - URL 側に職種＋勤務地の条件をすべて埋め込んでおき、
 *   そのページに表示されている「検索結果件数」をそのまま読む。
 */
async function fetchMynaviJobsCountViaFetch(
  url: string,
  prefCode: string | null
): Promise<MynaviJobsCountResult> {
  const controller = new AbortController();
  const timeoutMs = 15000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let headerCount: number | null = null;

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36",
        "accept-language": "ja-JP,ja;q=0.9,en;q=0.8",
        accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
      },
      signal: controller.signal,
    });

    if (!res.ok) {
      console.error("mynavi list fetch failed", res.status, res.statusText, {
        url,
      });
      return {
        total: null,
        source: "none",
        url,
        prefCode,
        modalCount: null,
        headerCount: null,
      };
    }

    const html = await res.text();

    headerCount = parseMynaviJobsCount(html);

    if (headerCount == null) {
      console.error("mynavi fetch could not parse header count", {
        url,
        htmlSnippet: html.slice(0, 2000),
      });
    }

    return {
      total: headerCount,
      source: headerCount != null ? "header" : "none",
      url,
      prefCode,
      modalCount: null,
      headerCount,
    };
  } catch (err) {
    console.error("mynavi fetch error", err, { url });
    return {
      total: null,
      source: "none",
      url,
      prefCode,
      modalCount: null,
      headerCount,
    };
  } finally {
    clearTimeout(timer);
  }
}

/** =========================
 * 公開 API: マイナビ件数取得（単一都道府県 or 全国）
 * ========================= */

export async function fetchMynaviJobsCount(
  cond: ManualCondition
): Promise<MynaviJobsCountResult> {
  const prefCode = getMynaviPrefectureCode(cond);
  const url = buildMynaviListUrl(cond, prefCode);
  return fetchMynaviJobsCountViaFetch(url, prefCode);
}

/** =========================
 * 公開 API: マイナビ件数取得（複数都道府県）
 * ========================= */

/**
 * 1つの「職種条件（external_small_code）」に対して、
 * 複数の都道府県の件数をまとめて取得する。
 *
 * 実装:
 *   - Playwright は Vercel 環境で動かないため完全に廃止
 *   - 各都道府県ごとに
 *       https://tenshoku.mynavi.jp/list/pXX/(oコード…)/?jobsearchType=14&searchType=18&refLoc=fnc_sra
 *     を直接叩いて件数を取得する
 */
export async function fetchMynaviJobsCountForPrefectures(
  condBase: ManualCondition,
  prefectures: string[]
): Promise<Record<string, MynaviJobsCountResult>> {
  const results: Record<string, MynaviJobsCountResult> = {};

  const stringPrefs = prefectures.filter(
    (p): p is string => typeof p === "string" && p.trim().length > 0
  );
  if (stringPrefs.length === 0) {
    // 都道府県指定がない場合は「全国」で 1 回だけ取得する
    const url = buildMynaviListUrl(condBase, null);
    const r = await fetchMynaviJobsCountViaFetch(url, null);
    results["全国"] = r;
    return results;
  }

  for (const prefName of stringPrefs) {
    const prefCode = getMynaviPrefCodeFromName(prefName);

    if (!prefCode) {
      results[prefName] = {
        total: null,
        source: "none",
        url: `${BASE_LIST_URL}/list/${ALL_PREF_PATH}/`,
        prefCode: null,
        modalCount: null,
        headerCount: null,
      };
      continue;
    }

    const url = buildMynaviListUrl(condBase, prefCode);
    const r = await fetchMynaviJobsCountViaFetch(url, prefCode);
    results[prefName] = r;
  }

  return results;
}
