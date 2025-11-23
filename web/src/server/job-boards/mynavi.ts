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
 * HTML から件数を抜き出す内部処理
 *
 * - どのパターンで拾えたかを hint として返す
 */
function parseMynaviJobsCountInternal(html: string): {
  count: number | null;
  hint: string | null;
} {
  // ① <span class="js__searchRecruit--count">○○</span>
  {
    const m = html.match(
      /<span[^>]*class=["'][^"']*js__searchRecruit--count[^"']*["'][^>]*>\s*([\d,]+)\s*<\/span>/i
    );
    const n = safeParseCount(m?.[1]);
    if (n != null) return { count: n, hint: "span.js__searchRecruit--count" };
  }

  // ② 「条件に合う求人  44601 件 を検索する」
  {
    const m = html.match(
      /条件に合う求人[\s　]*([\d,]+)[\s　]*件[\s　]*を検索する/
    );
    const n = safeParseCount(m?.[1]);
    if (n != null) return { count: n, hint: "text:条件に合う求人…を検索する" };
  }

  // ③ 「1件〜50件（全44601件中）」の「全44601件中」
  {
    const m = html.match(/全[\s　]*([\d,]+)[\s　]*件中/);
    const n = safeParseCount(m?.[1]);
    if (n != null) return { count: n, hint: "text:全○件中" };
  }

  // ④ <meta name="description" content="…11,269件！…"> から拾う（最優先のフォールバック）
  {
    const m = html.match(
      /<meta[^>]+name=["']description["'][^>]+content=["'][^"'>]*?([\d,]+)\s*件[^"'>]*["'][^>]*>/i
    );
    const n = safeParseCount(m?.[1]);
    if (n != null) return { count: n, hint: "meta[name=description]" };
  }

  // ⑤ 「検索結果一覧44,601件！」のようなテキスト
  {
    const m = html.match(/検索結果一覧[\s　]*([\d,]+)[\s　]*件/);
    const n = safeParseCount(m?.[1]);
    if (n != null) return { count: n, hint: "text:検索結果一覧○件" };
  }

  // ⑥ 「求人情報136,982件！」のようなテキスト
  {
    const m = html.match(/求人情報[\s　]*([\d,]+)[\s　]*件/);
    const n = safeParseCount(m?.[1]);
    if (n != null) return { count: n, hint: "text:求人情報○件" };
  }

  // ⑦ かなり緩い fallback：「求人」「該当」「検索結果」付近の「○○件」
  {
    const m = html.match(
      /(検索結果|該当の求人|条件に合う求人)[\s\S]{0,80}?([\d,]+)\s*件/
    );
    const n = safeParseCount(m?.[2]);
    if (n != null) return { count: n, hint: "text:ゆるい近傍マッチ" };
  }

  return { count: null, hint: null };
}

/**
 * 旧来の公開 API: HTML 全体から件数だけを返す
 * （他のファイル互換用）
 */
export function parseMynaviJobsCount(html: string): number | null {
  return parseMynaviJobsCountInternal(html).count;
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
  /** HTTP ステータスコード（fetch結果） */
  httpStatus?: number | null;
  /** 件数パース時に使用したパターンのヒント */
  parseHint?: string | null;
  /** 失敗時のメッセージ（成功時は null） */
  errorMessage?: string | null;
};

const BASE_LIST_URL = "https://tenshoku.mynavi.jp";

/** =========================
 * エリアプレフィックス判定（首都圏など）
 * ========================= */

/**
 * Pコードからエリアプレフィックス（例: "shutoken"）を返す
 *
 * 現状:
 *   - 首都圏（1都3県: 埼玉・千葉・東京・神奈川）は "/shutoken/list/..." を使用
 *   - それ以外はプレフィックスなしで "/list/..." を使用
 */
function getMynaviAreaPrefix(prefCode: string | null): string {
  if (!prefCode) return "";
  const upper = prefCode.toUpperCase();

  // 首都圏: 埼玉(P11) / 千葉(P12) / 東京(P13) / 神奈川(P14)
  if (
    upper === "P11" ||
    upper === "P12" ||
    upper === "P13" ||
    upper === "P14"
  ) {
    return "shutoken";
  }

  return "";
}

/** =========================
 * URL 組み立て
 * ========================= */

/**
 * 職種（external_small_code）+ 都道府県 Pコード から
 * 実際に叩くマイナビの検索 URL を組み立てる。
 *
 * 例（東京都 / 首都圏版）:
 *   https://tenshoku.mynavi.jp/shutoken/list/p13/o11105/?ags=0
 *
 * 例（全国）:
 *   https://tenshoku.mynavi.jp/list/p01+...+p47/o11105/?ags=0
 */
function buildMynaviListUrl(
  cond: ManualCondition,
  prefCode: string | null
): string {
  // クエリは ags=0 のみ
  const params = new URLSearchParams();
  params.set("ags", "0");

  const jobPath = buildJobPathSegment(cond.internalSmall ?? null);

  const prefPath = prefCode
    ? prefCode.toLowerCase() // P13 → p13
    : ALL_PREF_PATH;

  const pathWithJob = jobPath ? `${prefPath}/${jobPath}` : prefPath;

  const areaPrefix = getMynaviAreaPrefix(prefCode);
  const basePath = areaPrefix
    ? `${BASE_LIST_URL}/${areaPrefix}/list`
    : `${BASE_LIST_URL}/list`;

  return `${basePath}/${pathWithJob}/?${params.toString()}`;
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

    const httpStatus = res.status;

    if (!res.ok) {
      const msg = `mynavi list fetch failed: ${res.status} ${res.statusText}`;
      console.error(msg, { url });
      return {
        total: null,
        source: "none",
        url,
        prefCode,
        modalCount: null,
        headerCount: null,
        httpStatus,
        parseHint: null,
        errorMessage: msg,
      };
    }

    const html = await res.text();

    const { count, hint } = parseMynaviJobsCountInternal(html);
    headerCount = count;

    if (headerCount == null) {
      const msg = "mynavi fetch could not parse header count";
      console.error(msg, {
        url,
        htmlSnippet: html.slice(0, 2000),
      });
      return {
        total: null,
        source: "none",
        url,
        prefCode,
        modalCount: null,
        headerCount: null,
        httpStatus,
        parseHint: hint,
        errorMessage: msg,
      };
    }

    return {
      total: headerCount,
      source: "header",
      url,
      prefCode,
      modalCount: null,
      headerCount,
      httpStatus,
      parseHint: hint,
      errorMessage: null,
    };
  } catch (err: any) {
    const msg = `mynavi fetch error: ${err?.message ?? String(err)}`;
    console.error("mynavi fetch error", err, { url });
    return {
      total: null,
      source: "none",
      url,
      prefCode,
      modalCount: null,
      headerCount: null,
      httpStatus: null,
      parseHint: null,
      errorMessage: msg,
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
 *       https://tenshoku.mynavi.jp/shutoken/list/p13/(oコード…)/?ags=0
 *       または
 *       https://tenshoku.mynavi.jp/list/p27/(oコード…)/?ags=0
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
      // フォールバックでも ags=0 を付けておく
      results[prefName] = {
        total: null,
        source: "none",
        url: `${BASE_LIST_URL}/list/${ALL_PREF_PATH}/?ags=0`,
        prefCode: null,
        modalCount: null,
        headerCount: null,
        httpStatus: null,
        parseHint: null,
        errorMessage: "unknown prefecture name",
      };
      continue;
    }

    const url = buildMynaviListUrl(condBase, prefCode);
    const r = await fetchMynaviJobsCountViaFetch(url, prefCode);
    results[prefName] = r;
  }

  return results;
}
