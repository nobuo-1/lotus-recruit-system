// web/src/server/job-boards/mynavi.ts

import type { ManualCondition } from "./types";
import { chromium, Browser, Page } from "playwright";

/**
 * マイナビの検索結果ページ HTML から
 * 「条件に合う求人 ○○件を検索する」の ○○件 を抜き出す
 *
 * ※ 都道府県が未指定のときだけ使う（全体件数用フォールバック）。
 */
export function parseMynaviJobsCount(html: string): number | null {
  // ① js__searchRecruit--count を最優先
  const m1 = html.match(
    /<span[^>]*class=["'][^"']*js__searchRecruit--count[^"']*["'][^>]*>\s*([\d,]+)\s*<\/span>/i
  );
  if (m1?.[1]) {
    const n = Number(m1[1].replace(/,/g, ""));
    if (!Number.isNaN(n)) return n;
  }

  // ② 「条件に合う求人 ○○件を検索する」
  const m2 = html.match(/条件に合う求人\s*([\d,]+)\s*件を検索する/);
  if (m2?.[1]) {
    const n = Number(m2[1].replace(/,/g, ""));
    if (!Number.isNaN(n)) return n;
  }

  // ③ 「該当求人数 ○○件中」
  const m3 = html.match(/該当求人数\s*([\d,]+)\s*件中/);
  if (m3?.[1]) {
    const n = Number(m3[1].replace(/,/g, ""));
    if (!Number.isNaN(n)) return n;
  }

  // ④ 「該当の求人 ○○件」
  const m4 = html.match(/該当の求人\s*([\d,]+)\s*件/);
  if (m4?.[1]) {
    const n = Number(m4[1].replace(/,/g, ""));
    if (!Number.isNaN(n)) return n;
  }

  return null;
}

/**
 * Pコード（P13 など） → 地域コード（data-large-cd="04" など）の対応
 *
 * 「勤務地を選ぶ」モーダルで左側の地域タブ（北海道 / 東北 / … / 首都圏 など）を
 * クリックするために使用する。
 */
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

function safeParseCount(raw: string | undefined | null): number | null {
  if (!raw) return null;
  const n = Number(raw.replace(/,/g, ""));
  if (Number.isNaN(n)) return null;
  return n;
}

/**
 * 「勤務地を選ぶ」モーダル内の
 *   ・data-middle-cd="P13" 付近
 *   ・name/id="mcatareaP13" 付近
 *   ・「東京都 / 東京」などのテキスト付近
 * にある <span class="labelNumber">○○件</span> を拾う。
 *
 * ※ こちらは「モーダル HTML が最初から埋め込まれている場合」用の
 *   フォールバック関数で、基本的な取得方法は
 *   Playwright で画面を開いてから DOM から読む（後述）ように変更している。
 */
function parseMynaviPrefectureCountFromModal(
  html: string,
  prefCode: string | null,
  rawPrefName?: string | null
): number | null {
  // 1. data-middle-cd="P13" 〜 labelNumber
  if (prefCode) {
    const prefEscaped = prefCode.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");

    const reMiddle = new RegExp(
      `data-middle-cd=["']${prefEscaped}["'][\\s\\S]{0,400}?<span[^>]*class=["'][^"']*labelNumber[^"']*["'][^>]*>\\s*([\\d,]+)\\s*<\\/span>`,
      "i"
    );
    const mMiddle = html.match(reMiddle);
    const nMiddle = safeParseCount(mMiddle?.[1]);
    if (nMiddle != null) return nMiddle;

    // 2. name/id="mcatareaP13" 〜 labelNumber（保険）
    const reInput = new RegExp(
      `(?:name|id)=["']mcatarea${prefEscaped}["'][^>]*>[\\s\\S]{0,200}?<span[^>]*class=["'][^"']*labelNumber[^"']*["'][^>]*>\\s*([\\d,]+)\\s*<\\/span>`,
      "i"
    );
    const mInput = html.match(reInput);
    const nInput = safeParseCount(mInput?.[1]);
    if (nInput != null) return nInput;

    // 3. 地域ブロック（data-large-cd="xx"）が取れる場合は、その中だけを対象に再検索（ゆるめ）
    const upperPref = prefCode.toUpperCase();
    const areaLarge = PREF_CODE_TO_AREA_LARGE[upperPref];
    if (areaLarge) {
      const areaEscaped = areaLarge.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
      const reAreaBlock = new RegExp(
        `<div[^>]*class=["'][^"']*js__selectCondition--large[^"']*["'][^>]*data-large-cd=["']${areaEscaped}["'][^>]*>[\\s\\S]*?<\\/div>`,
        "i"
      );
      const areaMatch = html.match(reAreaBlock);
      if (areaMatch?.[0]) {
        const areaHtml = areaMatch[0];
        const mAreaMiddle = areaHtml.match(
          new RegExp(
            `data-middle-cd=["']${prefEscaped}["'][\\s\\S]{0,400}?<span[^>]*class=["'][^"']*labelNumber[^"']*["'][^>]*>\\s*([\\d,]+)\\s*<\\/span>`,
            "i"
          )
        );
        const nArea = safeParseCount(mAreaMiddle?.[1]);
        if (nArea != null) return nArea;
      }
    }
  }

  // 4. 都道府県名ベースでのゆるい検索（東京都 / 東京 など）
  const prefName = rawPrefName?.trim();
  if (prefName) {
    const baseName =
      /[都道府県]$/.test(prefName) && prefName.length > 1
        ? prefName.slice(0, -1)
        : prefName;

    const nameEscaped = prefName.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
    const baseEscaped =
      baseName === prefName
        ? nameEscaped
        : baseName.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");

    const reName = new RegExp(
      `(${nameEscaped}|${baseEscaped})[\\s\\S]{0,200}?<span[^>]*class=["'][^"']*labelNumber[^"']*["'][^>]*>\\s*([\\d,]+)\\s*<\\/span>`,
      "i"
    );
    const mName = html.match(reName);
    const nName = safeParseCount(mName?.[2]);
    if (nName != null) return nName;
  }

  return null;
}

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
  /** どこから取れたか: modal=勤務地モーダル / header=ページ上部 / none=取得失敗 */
  source: "modal" | "header" | "none";
  /** 実際に叩いた URL */
  url: string;
  /** 使用した P コード（例: P13） */
  prefCode: string | null;
  /** モーダルから読めた件数（null の場合はヒットなし） */
  modalCount: number | null;
  /** ページ上部（全体件数）から読めた件数（null の場合はヒットなし） */
  headerCount: number | null;
};

const JOBSEARCH_TYPE = "14";
const SEARCH_TYPE = "18";
const BASE_LIST_URL = "https://tenshoku.mynavi.jp/list/";

/** =========================
 * Playwright を使ったモーダル経由の件数取得
 * ========================= */

const PLAYWRIGHT_TIMEOUT_MS = 20000;

/**
 * 職種モーダルを開き、「内容を反映する」を押して条件を UI に反映
 * （sr_occ_l_cd / sr_occ_cd はクエリパラメータで渡している前提）
 */
async function applyJobConditionsViaModal(page: Page): Promise<void> {
  // 職種モーダルを開くボタン（タグは a / button 等の可能性があるのでクラス指定）
  const jobButton = page.locator(
    ".searchTable .js__jobCheckbox, .js__jobCheckbox"
  );

  if (!(await jobButton.count())) {
    // 職種モーダルが無いページ構成の場合はスキップ
    return;
  }

  await jobButton.first().click();

  const jobModalSelector = "section.modalChoice.js__modal--jobCheckbox";
  await page.waitForSelector(jobModalSelector, { state: "visible" });

  // 職種チェックボックス群の読み込みを軽く待つ
  await page.waitForTimeout(300);

  // ここでは「URL で渡した職種」が既に選択済みであることを前提に、
  // 単に「内容を反映する」を押して状態を確定させる。
  const applyButton = page.locator(
    `${jobModalSelector} .modalChoice__submit .modalChoice__btn .js__modal--apply`
  );
  if (await applyButton.count()) {
    await applyButton.first().click();
    // 反映後の再レンダリング待ち
    await page.waitForLoadState("networkidle");
    await page.waitForSelector(".searchTable", { state: "visible" });
  }
}

/**
 * 1つの都道府県に対して、Playwright 上の勤務地モーダルから labelNumber を拾う
 */
async function getLabelNumberForPrefOnPage(
  page: Page,
  modalSelector: string,
  prefCode: string,
  rawPrefName?: string | null
): Promise<number | null> {
  let labelText: string | null = null;

  const middleSelector = `${modalSelector} .js__selectCondition--middle[data-middle-cd="${prefCode}"]`;
  const middle = page.locator(middleSelector);

  if (await middle.count()) {
    const label = middle
      .first()
      .locator(".choiceContent__sectionTitle .labelNumber");
    if (await label.count()) {
      labelText = (await label.first().innerText()).trim();
    }
  }

  // Pコードで見つからない場合、都道府県名ベースで拾う（東京都 / 東京 など）
  if (!labelText && rawPrefName) {
    const prefName = rawPrefName.trim();
    const baseName =
      /[都道府県]$/.test(prefName) && prefName.length > 1
        ? prefName.slice(0, -1)
        : prefName;

    const sectionByName = page.locator(
      `${modalSelector} .js__selectCondition--middle h4.choiceContent__sectionTitle`,
      { hasText: prefName }
    );

    if (await sectionByName.count()) {
      const label = sectionByName.first().locator("span.labelNumber").first();
      if (await label.count()) {
        labelText = (await label.innerText()).trim();
      }
    } else if (baseName !== prefName) {
      const sectionByBase = page.locator(
        `${modalSelector} .js__selectCondition--middle h4.choiceContent__sectionTitle`,
        { hasText: baseName }
      );
      if (await sectionByBase.count()) {
        const label = sectionByBase.first().locator("span.labelNumber").first();
        if (await label.count()) {
          labelText = (await label.innerText()).trim();
        }
      }
    }
  }

  return safeParseCount(labelText);
}

/**
 * 既存：単一都道府県用（Playwright）
 */
async function fetchMynaviPrefCountViaPlaywright(
  url: string,
  prefCode: string,
  rawPrefName?: string | null
): Promise<number | null> {
  let browser: Browser | null = null;

  try {
    browser = await chromium.launch({
      headless: true,
    });

    const page: Page = await browser.newPage({
      viewport: { width: 1280, height: 720 },
    });

    page.setDefaultTimeout(PLAYWRIGHT_TIMEOUT_MS);

    await page.goto(url, {
      waitUntil: "domcontentloaded",
    });

    // 検索テーブルが表示されるまで待機
    await page.waitForSelector(".searchTable", {
      state: "visible",
    });

    // 1. 職種モーダルを開いて「内容を反映する」を押し、条件を確定させる
    await applyJobConditionsViaModal(page);

    // 2. 「勤務地」モーダルを開く
    const areaButton = page.locator(
      ".searchTable .js__areaCheckbox, .js__areaCheckbox"
    );
    if (!(await areaButton.count())) {
      // ボタンが見つからない場合は取得不可
      return null;
    }

    await areaButton.first().click();

    const modalSelector = "section.modalChoice.js__modal--areaCheckbox";
    await page.waitForSelector(modalSelector, { state: "visible" });

    const upperPref = prefCode.toUpperCase();
    const areaLarge = PREF_CODE_TO_AREA_LARGE[upperPref] ?? null;

    // 3. 地域タブを選択（首都圏 / 関西 など）
    if (areaLarge) {
      const areaTab = page.locator(
        `${modalSelector} .modalChoice__list .modalChoice__item[data-large-cd="${areaLarge}"]`
      );
      if (await areaTab.count()) {
        await areaTab.first().click();
        // タブ切り替え後の DOM 展開待ち
        await page.waitForTimeout(300);
      }
    }

    // 4. 指定都道府県の labelNumber を取得
    const count = await getLabelNumberForPrefOnPage(
      page,
      modalSelector,
      prefCode,
      rawPrefName
    );

    return count;
  } catch (err) {
    console.error("mynavi playwright error", err, { url, prefCode });
    return null;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

/**
 * 複数都道府県用：Playwright で一度に複数都道府県の labelNumber を取得
 *
 * - 地域タブ（data-large-cd）ごとにまとめて処理
 * - 同一地域内の都道府県は、タブ切り替え1回でまとめて読み込む
 */
type PrefBatchItem = { name: string; code: string };

async function fetchMynaviPrefCountsViaPlaywrightBatch(
  url: string,
  items: PrefBatchItem[]
): Promise<Record<string, number | null>> {
  let browser: Browser | null = null;
  const resultByCode: Record<string, number | null> = {};

  try {
    browser = await chromium.launch({
      headless: true,
    });

    const page: Page = await browser.newPage({
      viewport: { width: 1280, height: 720 },
    });

    page.setDefaultTimeout(PLAYWRIGHT_TIMEOUT_MS);

    await page.goto(url, {
      waitUntil: "domcontentloaded",
    });

    await page.waitForSelector(".searchTable", { state: "visible" });

    // 1. 職種モーダル → 内容を反映する
    await applyJobConditionsViaModal(page);

    // 2. 「勤務地」モーダルを開く
    const areaButton = page.locator(
      ".searchTable .js__areaCheckbox, .js__areaCheckbox"
    );
    if (!(await areaButton.count())) {
      for (const item of items) {
        resultByCode[item.code] = null;
      }
      return resultByCode;
    }

    await areaButton.first().click();

    const modalSelector = "section.modalChoice.js__modal--areaCheckbox";
    await page.waitForSelector(modalSelector, { state: "visible" });

    // 3. 地域コードごとにグルーピング
    const groups = new Map<string, PrefBatchItem[]>();

    for (const item of items) {
      const upper = item.code.toUpperCase();
      const areaLarge = PREF_CODE_TO_AREA_LARGE[upper] ?? "ALL"; // 万一マップがなければ ALL グループ

      const arr = groups.get(areaLarge) ?? [];
      arr.push(item);
      groups.set(areaLarge, arr);
    }

    // 4. 地域タブごとに切り替え → 同一地域内の都道府県を一度に読み込む
    for (const [areaLarge, list] of groups.entries()) {
      if (areaLarge !== "ALL") {
        const areaTab = page.locator(
          `${modalSelector} .modalChoice__list .modalChoice__item[data-large-cd="${areaLarge}"]`
        );
        if (await areaTab.count()) {
          await areaTab.first().click();
          await page.waitForTimeout(300);
        }
      }

      for (const item of list) {
        const count = await getLabelNumberForPrefOnPage(
          page,
          modalSelector,
          item.code,
          item.name
        );
        resultByCode[item.code] = count;
      }
    }

    return resultByCode;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

/** =========================
 * 既存 fetch ベースのフォールバック実装
 * ========================= */

/**
 * マイナビの検索件数を取得するメイン関数（fetch 版）
 *
 * ※ 都道府県指定ありの場合も header の件数は total には使わず、
 *   モーダル HTML からの値のみを total に採用する。
 */
async function fetchMynaviJobsCountViaFetch(
  cond: ManualCondition,
  url: string,
  prefCode: string | null
): Promise<MynaviJobsCountResult> {
  const controller = new AbortController();
  const timeoutMs = 15000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let modalCount: number | null = null;
  let headerCount: number | null = null;

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36",
        "accept-language": "ja-JP,ja;q=0.9,en;q=0.8",
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

    // 都道府県指定あり: モーダルの HTML からのみ取得を試みる
    if (prefCode || cond.prefecture) {
      modalCount = parseMynaviPrefectureCountFromModal(
        html,
        prefCode,
        cond.prefecture ?? null
      );

      // ヘッダーの件数は「都道府県未フィルタの全体件数」の可能性が高いので
      // ログ用に読みつつ、結果には使わないようにする。
      headerCount = parseMynaviJobsCount(html);

      return {
        total: modalCount, // 取れなければ null のまま
        source: modalCount != null ? "modal" : "none",
        url,
        prefCode,
        modalCount,
        headerCount,
      };
    }

    // 都道府県指定なし: 全体件数としてヘッダーの数字を使う
    headerCount = parseMynaviJobsCount(html);
    return {
      total: headerCount,
      source: headerCount != null ? "header" : "none",
      url,
      prefCode: null,
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
      modalCount,
      headerCount,
    };
  } finally {
    clearTimeout(timer);
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

  const url = `${BASE_LIST_URL}?${params.toString()}`;

  const prefCode = getMynaviPrefectureCode(cond);

  // 都道府県指定あり → まず Playwright でモーダルの labelNumber を取りに行く
  if (prefCode || cond.prefecture) {
    const code = prefCode ?? null;

    let modalCount: number | null = null;

    if (code) {
      modalCount = await fetchMynaviPrefCountViaPlaywright(
        url,
        code,
        cond.prefecture ?? null
      );
    }

    if (modalCount != null) {
      return {
        total: modalCount,
        source: "modal",
        url,
        prefCode: code,
        modalCount,
        headerCount: null,
      };
    }

    // Playwright で失敗した場合、従来の fetch ベースでフォールバック
    return fetchMynaviJobsCountViaFetch(cond, url, code);
  }

  // 都道府県指定なし → これまで通り fetch + ヘッダーの数字だけで OK
  return fetchMynaviJobsCountViaFetch(cond, url, null);
}

/** =========================
 * 公開 API: マイナビ件数取得（複数都道府県）
 * ========================= */

/**
 * 1つの「職種条件（sr_occ_l_cd / sr_occ_cd）」に対して、
 * 複数の都道府県の件数をまとめて取得する。
 *
 * - 職種モーダル：Playwright で「内容を反映する」まで実行
 * - 勤務地モーダル：地域タブを切り替えながら、同一地域の都道府県を一度に読み込む
 * - Playwright 失敗時は 1回の fetch + HTML 解析でフォールバック
 */
export async function fetchMynaviJobsCountForPrefectures(
  condBase: ManualCondition,
  prefectures: string[]
): Promise<Record<string, MynaviJobsCountResult>> {
  const params = buildMynaviJobQueryParams(condBase);
  params.set("jobsearchType", JOBSEARCH_TYPE);
  params.set("searchType", SEARCH_TYPE);

  const url = `${BASE_LIST_URL}?${params.toString()}`;

  const results: Record<string, MynaviJobsCountResult> = {};

  // prefecture 名 → Pコード 変換
  const items: PrefBatchItem[] = [];
  for (const name of prefectures) {
    const code = getMynaviPrefCodeFromName(name);
    if (!code) {
      results[name] = {
        total: null,
        source: "none",
        url,
        prefCode: null,
        modalCount: null,
        headerCount: null,
      };
      continue;
    }
    items.push({ name, code });
  }

  if (items.length === 0) {
    return results;
  }

  // 1. Playwright でまとめて取得（職種モーダル + 勤務地モーダル）
  try {
    const countsByCode = await fetchMynaviPrefCountsViaPlaywrightBatch(
      url,
      items
    );

    for (const item of items) {
      const count = countsByCode[item.code] ?? null;
      results[item.name] = {
        total: count,
        source: count != null ? "modal" : "none",
        url,
        prefCode: item.code,
        modalCount: count,
        headerCount: null,
      };
    }

    return results;
  } catch (err) {
    console.error("mynavi playwright batch error", err, {
      url,
      prefectures,
    });
  }

  // 2. Playwright 失敗時は 1回の fetch + HTML 解析でフォールバック
  const controller = new AbortController();
  const timeoutMs = 15000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36",
        "accept-language": "ja-JP,ja;q=0.9,en;q=0.8",
      },
      signal: controller.signal,
    });

    if (!res.ok) {
      console.error("mynavi list fetch failed (batch)", res.status, {
        url,
      });
      return results;
    }

    const html = await res.text();

    for (const item of items) {
      const modalCount = parseMynaviPrefectureCountFromModal(
        html,
        item.code,
        item.name
      );
      results[item.name] = {
        total: modalCount,
        source: modalCount != null ? "modal" : "none",
        url,
        prefCode: item.code,
        modalCount,
        headerCount: null,
      };
    }

    return results;
  } catch (err) {
    console.error("mynavi fetch batch error", err, { url });
    return results;
  } finally {
    clearTimeout(timer);
  }
}
