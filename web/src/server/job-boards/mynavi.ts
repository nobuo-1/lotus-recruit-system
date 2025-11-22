// web/src/server/job-boards/mynavi.ts

import type { ManualCondition } from "./types";

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
 * ※ 完全に UI と同じ「ボタンを押してモーダルを開く」ことは
 *   サーバー側ではできないので、
 *   「モーダルに埋め込まれているHTMLを直接パース」する方針です。
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

/**
 * マイナビの検索件数を取得するメイン関数
 *
 * - 職種条件のみ付けて一覧を開く
 * - 都道府県指定がある場合: 「勤務地を選ぶ」モーダルの都道府県横の labelNumber を返す
 * - 都道府県指定なし: 一覧上部の「条件に合う求人 ○○件」などから全体件数を返す
 */
export async function fetchMynaviJobsCount(
  cond: ManualCondition
): Promise<number | null> {
  // ★ 実際の画面と同じ値に合わせる（ユーザー指定のURL）
  //   https://tenshoku.mynavi.jp/list/?jobsearchType=14&searchType=18
  const jobsearchType = "14";
  const searchType = "18";

  const params = buildMynaviJobQueryParams(cond);
  params.set("jobsearchType", jobsearchType);
  params.set("searchType", searchType);

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

    const prefCode = getMynaviPrefectureCode(cond);

    if (prefCode || cond.prefecture) {
      // ✅ 都道府県指定がある場合は、まず「勤務地モーダルの都道府県横の数字」を強制的に取りにいく
      const countFromModal = parseMynaviPrefectureCountFromModal(
        html,
        prefCode,
        cond.prefecture ?? null
      );
      if (countFromModal != null) {
        return countFromModal;
      }

      // どうしてもモーダルの数字が拾えない場合の最後の保険として、
      // ページ上部の全体件数を返す（≒ UI とは少し違うが数値ゼロよりはマシ）
      const fallback = parseMynaviJobsCount(html);
      if (fallback != null) {
        return fallback;
      }

      return null;
    }

    // ✅ 都道府県指定なしのときだけ、全体件数としてヘッダーの数字を使う
    return parseMynaviJobsCount(html);
  } catch (err) {
    console.error("mynavi fetch error", err, { url });
    return null;
  } finally {
    clearTimeout(timer);
  }
}
