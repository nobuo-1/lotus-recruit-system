// web/src/server/job-boards/mynavi.ts

import type { ManualCondition } from "./types";
import { chromium } from "playwright";

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
 * （※今回の実装では「近くの labelNumber」を取るので、
 *     areaLarge が取れなくても致命的にはならない）
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
 * ※ Playwright で実際に「勤務地モーダル」を開いたあとの HTML を
 *   page.content() で取得して、この関数に渡す。
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
        `<div[^>]*data-large-cd=["']${areaEscaped}["'][^>]*>[\\s\\S]*?<\\/div>`,
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
      `(${nameEscaped}|${baseEscaped})[\\s\\S]{0,160}?<span[^>]*class=["'][^"']*labelNumber[^"']*["'][^>]*>\\s*([\\d,]+)\\s*<\\/span>`,
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

/**
 * internalLarge / internalSmall から
 * マイナビの「職種」用クエリパラメータを組み立てる。
 *
 * ※ internalLarge/internalSmall には、すでに
 *   「マイナビの大分類・小分類コード（例: 11 / 11105）」が
 *   セットされている前提。
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

/**
 * internalSmall から、マイナビ職種モーダル内で選択すべき
 * 「小分類コード」の配列を返すユーティリティ。
 *
 * ここでは最小限として「internalSmall をそのまま 1 件だけ使う」
 * 実装にしているが、必要に応じて
 *   - DB や別テーブルからのマッピング
 *   - 1 つの自社小分類 → 複数のマイナビ小分類コード
 * などに拡張する想定。
 */
function getMynaviSmallCodesFromCondition(cond: ManualCondition): string[] {
  const small = cond.internalSmall?.trim();
  if (!small) return [];
  if (!/^[0-9A-Z]+$/i.test(small)) return [];
  return [small];
}

/**
 * マイナビの検索件数を取得するメイン関数（Playwright版）
 *
 * - 一覧ページを Playwright で開く
 * - 「職種を指定する」ボタンから職種モーダルを開き、
 *   このシステムで定義した職種の小分類コードに対応する
 *   チェックボックスをすべてクリック（選択）する
 * - 「内容を反映する」でモーダルを閉じて職種条件を反映する
 * - 「勤務地を指定する」ボタンから勤務地モーダルを開き、
 *   都道府県（Pコード or 名称）に対応するラベル（labelNumber）の件数を取得する
 * - 都道府県指定がない場合は、ヘッダーの「条件に合う求人 ○○件」を返す
 *
 * ※ 以前は fetch + 正規表現で静的 HTML を解析していたが、
 *   モーダル内の HTML や件数が JavaScript で後読みされるため、
 *   Playwright で実際の画面操作を行うように変更している。
 */
export async function fetchMynaviJobsCount(
  cond: ManualCondition
): Promise<MynaviJobsCountResult> {
  // 実際の画面と同じ値に合わせる（ユーザー指定のURL）
  //   https://tenshoku.mynavi.jp/list/?jobsearchType=14&searchType=18
  const jobsearchType = "14";
  const searchType = "18";

  const params = buildMynaviJobQueryParams(cond);
  params.set("jobsearchType", jobsearchType);
  params.set("searchType", searchType);

  const url = `https://tenshoku.mynavi.jp/list/?${params.toString()}`;

  const prefCode = getMynaviPrefectureCode(cond);
  let modalCount: number | null = null;
  let headerCount: number | null = null;

  const browser = await chromium.launch({
    headless: true,
  });

  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36",
    locale: "ja-JP",
  });

  const page = await context.newPage();

  try {
    // 一覧ページを表示
    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 15000,
    });

    // 検索テーブルが描画されるまで待つ
    await page.waitForSelector("div.searchTable", { timeout: 15000 });

    // ===== 1. 職種モーダルを開いて、小分類チェックボックスを選択 =====
    const smallCodes = getMynaviSmallCodesFromCondition(cond);

    if (smallCodes.length > 0) {
      // 「職種」→「指定する」ボタン
      await page.click("button.js__jobCheckbox");
      await page.waitForSelector("section.modalChoice.js__modal--jobCheckbox", {
        state: "visible",
        timeout: 10000,
      });

      // モーダル内で該当する小分類コードのチェックボックスをすべて ON
      await page.evaluate((codes: string[]) => {
        const modal = document.querySelector<HTMLElement>(
          "section.modalChoice.js__modal--jobCheckbox"
        );
        if (!modal) return;

        codes.forEach((code) => {
          const inputs = modal.querySelectorAll<HTMLInputElement>(
            `input[type="checkbox"][value="${code}"]`
          );
          inputs.forEach((input) => {
            if (!input.checked) {
              input.click();
            }
          });
        });
      }, smallCodes);

      // 「内容を反映する」ボタンで職種条件を反映
      await page.click(
        "section.modalChoice.js__modal--jobCheckbox button.js__modal--apply"
      );

      // 反映が UI に効くまで少し待機
      await page.waitForTimeout(1000);
    }

    // ===== 2. 都道府県指定がある場合は、勤務地モーダルから件数を取得 =====
    if (prefCode || cond.prefecture) {
      // 「勤務地」→「指定する」ボタン
      await page.click("button.js__areaCheckbox");
      await page.waitForSelector(
        "section.modalChoice.js__modal--areaCheckbox",
        {
          state: "visible",
          timeout: 10000,
        }
      );

      // モーダルの中身（labelNumber）が更新されるのを待つ
      // ※ 具体的なセレクタが取れないケースでもタイムアウトしないよう、
      //   ゆるめの待機にしている
      await page.waitForTimeout(1500);

      // 現在の HTML 全体を取得し、その中から都道府県の labelNumber を拾う
      const htmlWithModal = await page.content();
      modalCount = parseMynaviPrefectureCountFromModal(
        htmlWithModal,
        prefCode,
        cond.prefecture ?? null
      );

      // モーダルを閉じる（件数取得だけなので実質不要だが、後続の安全のため）
      try {
        await page.click(
          "section.modalChoice.js__modal--areaCheckbox button.js__modal--apply",
          { timeout: 3000 }
        );
      } catch {
        // 閉じに失敗しても致命的ではないので握りつぶす
      }

      if (modalCount != null) {
        return {
          total: modalCount,
          source: "modal",
          url,
          prefCode,
          modalCount,
          headerCount: null,
        };
      }

      // モーダルから取れなかった場合は、同じ HTML からヘッダーの件数をフォールバック
      headerCount = parseMynaviJobsCount(htmlWithModal);

      return {
        total: headerCount,
        source: headerCount != null ? "header" : "none",
        url,
        prefCode,
        modalCount,
        headerCount,
      };
    }

    // ===== 3. 都道府県指定なし → 全体件数としてヘッダーの数字を使う =====
    const html = await page.content();
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
    console.error("mynavi fetch (Playwright) error", err, { url });
    return {
      total: null,
      source: "none",
      url,
      prefCode,
      modalCount,
      headerCount,
    };
  } finally {
    await browser.close();
  }
}
