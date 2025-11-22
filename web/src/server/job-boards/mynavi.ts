// web/src/server/job-boards/mynavi.ts

import type { ManualCondition } from "./types";

/**
 * マイナビの検索結果ページ HTML から
 * 「条件に合う求人 ○○件を検索する」の ○○件 を抜き出す
 *
 * 最優先ターゲット：
 *   <span class="js__searchRecruit--count">45035</span>
 *
 * それが見つからない場合は、「該当求人数 ○○件中」「該当の求人 ○○件」など
 * テキストパターンもフォールバックで見る。
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
 * 地域リスト：
 *  01: 北海道
 *  02: 東北
 *  03: 北関東
 *  04: 首都圏
 *  15: 甲信越
 *  14: 北陸
 *  08: 東海
 *  09: 関西
 *  10: 中国
 *  11: 四国
 *  12: 九州（＋沖縄）
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

/**
 * 「勤務地を選ぶ」モーダル内の
 *   ① 地域（data-large-cd="04" など）
 *   ② その地域の中の都道府県（data-middle-cd="P13" など）
 *   ③ その中の <span class="labelNumber">○○件</span>
 * を 1 回のパースで取得する。
 *
 * 例：
 * <div class="js__selectCondition--large" data-large-cd="04" ...>
 *   ...
 *   <section class="choiceContent__section js__selectCondition--middle" data-middle-cd="P13" ...>
 *     <h4 class="choiceContent__sectionTitle">
 *       <label ...>東京都</label>
 *       <span class="labelNumber">2732</span>
 *     </h4>
 *     ...
 *   </section>
 *   ...
 * </div>
 */
function parseMynaviPrefectureCountFromModal(
  html: string,
  prefCode: string
): number | null {
  // prefCode は "P13" のような形式を想定
  const prefEscaped = prefCode.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
  const upperPref = prefCode.toUpperCase();

  const areaLarge = PREF_CODE_TO_AREA_LARGE[upperPref];

  // ① 地域コードが分かっている場合は、
  //    data-large-cd="XX" ブロックの中にある data-middle-cd="Pxx" を探す
  if (areaLarge) {
    const areaEscaped = areaLarge.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");

    const reAreaAndPref = new RegExp(
      `<div[^>]*class=["'][^"']*js__selectCondition--large[^"']*["'][^>]*data-large-cd=["']${areaEscaped}["'][^>]*>[\\s\\S]*?<section[^>]*class=["'][^"']*choiceContent__section[^"']*js__selectCondition--middle[^"']*["'][^>]*data-middle-cd=["']${prefEscaped}["'][^>]*>[\\s\\S]*?<span[^>]*class=["'][^"']*labelNumber[^"']*["'][^>]*>\\s*([\\d,]+)\\s*<\\/span>`,
      "i"
    );

    const mArea = html.match(reAreaAndPref);
    if (mArea?.[1]) {
      const n = Number(mArea[1].replace(/,/g, ""));
      if (!Number.isNaN(n)) return n;
    }
  }

  // ② フォールバック:
  //   地域が判別できない / マッチしなかった場合は、
  //   これまで通り「都道府県セクションだけを見る」パターンで検索する。
  const reSectionOnly = new RegExp(
    `<section[^>]*class=["'][^"']*choiceContent__section[^"']*js__selectCondition--middle[^"']*["'][^>]*data-middle-cd=["']${prefEscaped}["'][^>]*>[\\s\\S]*?<span[^>]*class=["'][^"']*labelNumber[^"']*["'][^>]*>\\s*([\\d,]+)\\s*<\\/span>`,
    "i"
  );
  const m1 = html.match(reSectionOnly);
  if (m1?.[1]) {
    const n = Number(m1[1].replace(/,/g, ""));
    if (!Number.isNaN(n)) return n;
  }

  // ③ さらにフォールバック:
  //   input name="mcatareaP13" の直後から labelNumber を探すパターンも残しておく。
  const reInput = new RegExp(
    `<input[^>]*name=["']mcatarea${prefEscaped}["'][^>]*>[\\s\\S]*?<span[^>]*class=["'][^"']*labelNumber[^"']*["'][^>]*>\\s*([\\d,]+)\\s*<\\/span>`,
    "i"
  );
  const m2 = html.match(reInput);
  if (m2?.[1]) {
    const n = Number(m2[1].replace(/,/g, ""));
    if (!Number.isNaN(n)) return n;
  }

  return null;
}

/** =========================
 * 都道府県名 → マイナビ P コード対応
 * =========================
 *
 * tenshoku.mynavi.jp の URL / モーダル内では
 *   data-middle-cd="P13"   … 東京都
 *   value="P13"            … 東京都
 * のように PXX が使われるため、名称から PXX を引く。
 */
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
 *
 * - 未指定・不明 → null
 */
function getMynaviPrefectureCode(cond: ManualCondition): string | null {
  const raw = cond.prefecture?.trim();
  if (!raw) return null;

  // すでに P コード形式ならそれを使う
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
 * - 大分類コード: sr_occ_l_cd=11 など
 * - 小分類コード: sr_occ_cd=11105 など
 *
 *  ※ job_board_mappings の external_large_code / external_small_code に
 *     マイナビの職種コードを入れておく前提。
 */
function buildMynaviJobQueryParams(cond: ManualCondition): URLSearchParams {
  const params = new URLSearchParams();

  const large = cond.internalLarge?.trim() || "";
  const small = cond.internalSmall?.trim() || "";

  // 小分類コードがあれば sr_occ_cd を優先
  if (small && /^[0-9A-Z]+$/.test(small)) {
    params.set("sr_occ_cd", small);
  }

  // 大分類コードがあれば sr_occ_l_cd を付与
  if (large && /^[0-9A-Z]+$/.test(large)) {
    params.set("sr_occ_l_cd", large);
  }

  return params;
}

/**
 * マイナビの検索件数を取得するメイン関数
 *
 * 以前:
 *   /list/p13/?... のように勤務地付き URL を組み立てて
 *   検索結果の件数をそのまま読んでいた。
 *
 * 修正後:
 *   ① 職種だけを付けて /list/?jobsearchType=4&searchType=8&sr_occ_l_cd=.. などを GET
 *   ② 取得した HTML から
 *        - 都道府県指定がある場合:
 *          「勤務地を選ぶ」モーダルの
 *            地域(data-large-cd="XX") → 都道府県(data-middle-cd="Pxx")
 *          の順で labelNumber を取得
 *        - 取れなかった場合 / 都道府県未指定の場合:
 *          従来通り「条件に合う求人 ○○件を検索する」などから件数を読む
 */
export async function fetchMynaviJobsCount(
  cond: ManualCondition
): Promise<number | null> {
  // jobsearchType / searchType は検索条件付き一覧の基本的な値
  const jobsearchType = "4";
  const searchType = "8";

  // 1) 職種コードからクエリパラメータを組み立て
  const params = buildMynaviJobQueryParams(cond);
  params.set("jobsearchType", jobsearchType);
  params.set("searchType", searchType);

  // ※勤務地は URL パス / クエリには付けない。
  //   ページ内の「勤務地を選ぶ」モーダルの地域→都道府県ごとの件数(labelNumber)を使う。
  const url = `https://tenshoku.mynavi.jp/list/?${params.toString()}`;

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
      console.error("mynavi list fetch failed", res.status, res.statusText, {
        url,
      });
      return null;
    }

    const html = await res.text();

    // 2) 都道府県が指定されている場合は
    //    「地域を選択した上で都道府県を選ぶ」イメージで labelNumber を取得
    const prefCode = getMynaviPrefectureCode(cond);
    if (prefCode) {
      const countFromModal = parseMynaviPrefectureCountFromModal(
        html,
        prefCode
      );
      if (countFromModal != null) return countFromModal;
    }

    // 3) フォールバック: 一覧ページ上部の「条件に合う求人 ○○件」などから取得
    return parseMynaviJobsCount(html);
  } catch (err) {
    console.error("mynavi fetch error", err, { url });
    return null;
  } finally {
    clearTimeout(timer);
  }
}
