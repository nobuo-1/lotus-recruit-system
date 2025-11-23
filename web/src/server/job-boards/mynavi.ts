// web/src/server/job-boards/mynavi.ts

import type { ManualCondition } from "./types";
import { chromium, Browser, Page } from "playwright";

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
 */
export function parseMynaviJobsCount(html: string): number | null {
  // 0. <meta name="description" content="…検索結果一覧44,601件！…">
  const m0 = html.match(/検索結果一覧[\s　]*([\d,]+)[\s　]*件/);
  const n0 = safeParseCount(m0?.[1]);
  if (n0 != null) return n0;

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

  // ④ 「該当の求人 44601 件」ブロック
  const m4 = html.match(/該当の求人[\s\S]{0,150}?([\d,]+)[\s\S]{0,20}?件/);
  const n4 = safeParseCount(m4?.[1]);
  if (n4 != null) return n4;

  // ⑤ かなり緩い fallback：「求人」「該当」「検索結果」付近の「○○件」
  const m5 = html.match(
    /(検索結果|該当の求人|条件に合う求人)[\s\S]{0,80}?([\d,]+)\s*件/
  );
  const n5 = safeParseCount(m5?.[2]);
  if (n5 != null) return n5;

  return null;
}

/** =========================
 * 都道府県関連ヘルパー
 * ========================= */

/** Pコード（P13 など） → 地域コード（data-large-cd="04" など）の対応 */
const PREF_CODE_TO_AREA_LARGE: Record<string, string> = {
  P01: "01", // 北海道
  P02: "02",
  P03: "02",
  P04: "02",
  P05: "02",
  P06: "02",
  P07: "02", // 東北

  P08: "03",
  P09: "03",
  P10: "03", // 北関東

  P11: "04",
  P12: "04",
  P13: "04",
  P14: "04", // 首都圏

  P15: "15",
  P19: "15",
  P20: "15", // 甲信越

  P16: "14",
  P17: "14",
  P18: "14", // 北陸

  P21: "08",
  P22: "08",
  P23: "08",
  P24: "08", // 東海

  P25: "09",
  P26: "09",
  P27: "09",
  P28: "09",
  P29: "09",
  P30: "09", // 関西

  P31: "10",
  P32: "10",
  P33: "10",
  P34: "10",
  P35: "10", // 中国

  P36: "11",
  P37: "11",
  P38: "11",
  P39: "11", // 四国

  P40: "12",
  P41: "12",
  P42: "12",
  P43: "12",
  P44: "12",
  P45: "12",
  P46: "12",
  P47: "12", // 九州・沖縄
};

/**
 * PREF_CODE_TO_AREA_LARGE に対応する URL 上のエリアスラッグ
 *
 * 例：
 *   areaLarge=04 → /shutoken/list/p13/
 *   areaLarge=08 → /tokai/list/p23/
 */
const AREA_LARGE_TO_SLUG: Record<string, string> = {
  "01": "hokkaido",
  "02": "tohoku",
  "03": "kanto",
  "04": "shutoken",
  "08": "tokai",
  "09": "kansai",
  "10": "chugoku",
  "11": "shikoku",
  "12": "kyushu",
  "14": "hokuriku",
  "15": "koshinetsu",
};

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

/** Pコードからエリアスラッグ（shutoken, tokai など）を取得 */
function getAreaSlugFromPrefCode(prefCode: string): string | null {
  const upper = prefCode.toUpperCase();
  const areaLarge = PREF_CODE_TO_AREA_LARGE[upper];
  if (!areaLarge) return null;
  return AREA_LARGE_TO_SLUG[areaLarge] ?? null;
}

/**
 * internalLarge / internalSmall から
 * マイナビの「職種」用クエリパラメータを組み立てる。
 *
 * ※ ここでは「システム側の職種 → マイナビの sr_occ_l_cd / sr_occ_cd」の
 *   マッピングがすでに完了している前提で、数値 or 英字コードをそのまま付与する。
 */
function buildMynaviJobQueryParams(cond: ManualCondition): URLSearchParams {
  const params = new URLSearchParams();

  const large = cond.internalLarge?.trim() || "";
  const small = cond.internalSmall?.trim() || "";

  // マッピング済みのコード（数値 or 英大文字）を想定
  if (small && /^[0-9A-Z]+$/i.test(small)) {
    params.set("sr_occ_cd", small);
  }
  if (large && /^[0-9A-Z]+$/i.test(large)) {
    params.set("sr_occ_l_cd", large);
  }

  return params;
}

/** マイナビ件数取得のデバッグ用構造 */
export type MynaviJobsCountResult = {
  /** 最終的に返した件数（null の場合は取得失敗） */
  total: number | null;
  /** どこから取れたか: header=ページ上部（meta 含む） / none=取得失敗 */
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

const PLAYWRIGHT_TIMEOUT_MS = 20000;

/** =========================
 * URL 組み立て（通常）
 * ========================= */

/**
 * 職種パラメータ + 都道府県の Pコード から
 * 実際に叩くマイナビの検索 URL を組み立てる。
 *
 * 例：
 *   (no pref) → https://tenshoku.mynavi.jp/list/?sr_occ_l_cd=11&sr_occ_cd=11105&...
 *   (P13)     → https://tenshoku.mynavi.jp/shutoken/list/p13/?sr_occ_l_cd=11&sr_occ_cd=11105&...
 */
function buildMynaviListUrl(
  params: URLSearchParams,
  prefCode: string | null
): string {
  const query = params.toString();
  if (!prefCode) {
    return `${BASE_LIST_URL}/list/?${query}`;
  }

  const upper = prefCode.toUpperCase();
  const lower = upper.toLowerCase(); // p13 など
  const areaSlug = getAreaSlugFromPrefCode(upper);

  if (areaSlug) {
    // 例: /shutoken/list/p13/
    return `${BASE_LIST_URL}/${areaSlug}/list/${lower}/?${query}`;
  }

  // 最後の保険として /list/p13/ パターンも試す
  return `${BASE_LIST_URL}/list/${lower}/?${query}`;
}

/**
 * 「47都道府県すべて + 職種」の URL
 *
 * 例（イメージ）：
 *   https://tenshoku.mynavi.jp/list/p01+...+p47/?sr_occ_l_cd=11&sr_occ_cd=11105&jobsearchType=14&searchType=18&refLoc=fnc_sra
 */
function buildAllPrefUrl(params: URLSearchParams): string {
  const p = new URLSearchParams(params);
  p.set("jobsearchType", JOBSEARCH_TYPE);
  p.set("searchType", SEARCH_TYPE);
  p.set("refLoc", "fnc_sra");
  return `${BASE_LIST_URL}/list/${ALL_PREF_PATH}/?${p.toString()}`;
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
 * Playwright + searchTable 差分ロジック（複数都道府県用）
 * ========================= */

/** ページ全体から現在の件数を読む */
async function readMynaviJobsCountFromPage(page: Page): Promise<number | null> {
  const html = await page.content();
  return parseMynaviJobsCount(html);
}

/** 件数が変わるまで待つ（ローディング→反映待ち） */
async function waitForCountChange(
  page: Page,
  prev: number | null
): Promise<number | null> {
  const timeoutMs = 15000;
  const start = Date.now();
  let last: number | null = prev;

  while (Date.now() - start < timeoutMs) {
    await page.waitForTimeout(500);
    const cur = await readMynaviJobsCountFromPage(page);
    if (cur != null && (prev == null || cur !== prev)) {
      return cur;
    }
    last = cur;
  }

  return last;
}

/**
 * 47都道府県 + 職種 の URL を開き、
 * searchTable 内の都道府県チェックボックスの ON/OFF 差分から
 * 各都道府県の件数を取得する。
 */
async function fetchMynaviJobsCountViaPlaywrightDiff(
  condBase: ManualCondition,
  prefectures: string[]
): Promise<Record<string, MynaviJobsCountResult>> {
  const params = buildMynaviJobQueryParams(condBase);
  const url = buildAllPrefUrl(params);

  const results: Record<string, MynaviJobsCountResult> = {};
  let browser: Browser | null = null;

  try {
    console.log("[mynavi] playwright diff start", {
      url,
      prefectures,
    });

    browser = await chromium.launch({
      headless: true,
    });

    const page: Page = await browser.newPage({
      viewport: { width: 1280, height: 720 },
    });

    page.setDefaultTimeout(PLAYWRIGHT_TIMEOUT_MS);
    await page.setExtraHTTPHeaders({
      "Accept-Language": "ja-JP,ja;q=0.9,en;q=0.8",
    });

    await page.goto(url, {
      waitUntil: "domcontentloaded",
    });

    await page.waitForSelector(".searchTable", { state: "visible" });

    // 全47都道府県がチェックされている状態での総件数
    const totalAll = await readMynaviJobsCountFromPage(page);
    console.log("[mynavi] playwright diff initial total", {
      url,
      totalAll,
    });

    for (const prefName of prefectures) {
      const prefCode = getMynaviPrefCodeFromName(prefName);
      let totalForPref: number | null = null;

      try {
        // searchTable 内の都道府県チェックボックスを label テキストから取得
        const label = page
          .locator(".searchTable label", { hasText: prefName })
          .first();

        if (!(await label.count())) {
          console.warn(
            "[mynavi] playwright diff: pref label not found in searchTable",
            { prefName }
          );
          results[prefName] = {
            total: null,
            source: "none",
            url,
            prefCode,
            modalCount: null,
            headerCount: totalAll,
          };
          continue;
        }

        const checkbox = label.locator('input[type="checkbox"]').first();
        if (!(await checkbox.count())) {
          console.warn(
            "[mynavi] playwright diff: checkbox not found under label",
            { prefName }
          );
          results[prefName] = {
            total: null,
            source: "none",
            url,
            prefCode,
            modalCount: null,
            headerCount: totalAll,
          };
          continue;
        }

        // 念のためチェック状態を整える（全件状態に戻す）
        let before = await readMynaviJobsCountFromPage(page);

        const isChecked = await checkbox.isChecked();
        if (!isChecked) {
          await checkbox.click();
          before = await waitForCountChange(page, before);
        }

        // この時点の before が「この職種 × 全47都道府県」の件数になる想定
        // （前ループからのズレがあっても、ここで再同期する）
        before = await readMynaviJobsCountFromPage(page);

        // 対象都道府県のチェックを外す
        await checkbox.click();

        const after = await waitForCountChange(page, before);

        if (
          typeof before === "number" &&
          typeof after === "number" &&
          before >= after
        ) {
          totalForPref = before - after;
        } else {
          totalForPref = null;
        }

        console.log("[mynavi] playwright diff pref result", {
          prefName,
          before,
          after,
          totalForPref,
        });

        // チェックを戻して、次の都道府県に備える
        await checkbox.click();
        await waitForCountChange(page, after);
      } catch (err) {
        console.error("mynavi playwright diff per-pref error", err, {
          prefName,
        });
      }

      results[prefName] = {
        total: totalForPref,
        source: totalForPref != null ? "header" : "none",
        url,
        prefCode,
        modalCount: null,
        headerCount: totalAll,
      };
    }

    return results;
  } catch (err) {
    console.error("mynavi playwright diff error", err, { url, prefectures });
    return results;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

/** =========================
 * 公開 API: マイナビ件数取得（単一都道府県）
 * ========================= */

export async function fetchMynaviJobsCount(
  cond: ManualCondition
): Promise<MynaviJobsCountResult> {
  const params = buildMynaviJobQueryParams(cond);
  params.set("jobsearchType", JOBSEARCH_TYPE);
  params.set("searchType", SEARCH_TYPE);

  const prefCode = getMynaviPrefectureCode(cond);
  const url = buildMynaviListUrl(params, prefCode);

  // 単一都道府県は、差分ロジックを使う必要が薄いので fetch のみ
  return fetchMynaviJobsCountViaFetch(url, prefCode);
}

/** =========================
 * 公開 API: マイナビ件数取得（複数都道府県）
 * ========================= */

/**
 * 1つの「職種条件（sr_occ_l_cd / sr_occ_cd）」に対して、
 * 複数の都道府県の件数をまとめて取得する。
 *
 * 優先：
 *   1. Playwright で 47都道府県＋職種のページを開き、
 *      searchTable 内の都道府県チェックボックスの ON/OFF 差分から件数を取得
 *   2. 失敗した場合は、従来通り「pref ごとに /list/pXX + クエリ」で fetch して HTML 解析
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
    return results;
  }

  // ① Playwright 差分ロジックを優先的に試す
  try {
    const diffResults = await fetchMynaviJobsCountViaPlaywrightDiff(
      condBase,
      stringPrefs
    );

    const hasAnyValid = Object.values(diffResults).some(
      (r) => r && typeof r.total === "number" && !Number.isNaN(r.total)
    );

    if (hasAnyValid) {
      return diffResults;
    }

    console.warn(
      "[mynavi] playwright diff returned no usable counts; falling back to fetch+HTML parse"
    );
  } catch (err) {
    console.error("mynavi playwright diff outer error", err, {
      condBase,
      prefectures,
    });
  }

  // ② Playwright が使えない / すべて null → pref ごとに fetch でフォールバック
  const params = buildMynaviJobQueryParams(condBase);
  params.set("jobsearchType", JOBSEARCH_TYPE);
  params.set("searchType", SEARCH_TYPE);

  for (const prefName of stringPrefs) {
    const prefCode = getMynaviPrefCodeFromName(prefName);

    if (!prefCode) {
      results[prefName] = {
        total: null,
        source: "none",
        url: `${BASE_LIST_URL}/list/?${params.toString()}`,
        prefCode: null,
        modalCount: null,
        headerCount: null,
      };
      continue;
    }

    const url = buildMynaviListUrl(params, prefCode);
    const r = await fetchMynaviJobsCountViaFetch(url, prefCode);
    results[prefName] = r;
  }

  return results;
}
