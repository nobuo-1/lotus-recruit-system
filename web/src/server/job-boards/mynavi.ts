// web/src/server/job-boards/mynavi.ts

import type { ManualCondition } from "./types";

/**
 * マイナビの検索結果ページ HTML から
 * 「条件に合う求人 ○○件を検索する」の ○○件 を抜き出す
 *
 * 対象要素：
 *   <span class="js__searchRecruit--count">45035</span>
 *
 * ※ /list/ でも /search/list/ でも同じクラスが使われている想定。
 *   念のため「該当求人数 ○○件中」パターンもフォールバックで見る。
 */
export function parseMynaviJobsCount(html: string): number | null {
  // ① js__searchRecruit--count を優先して取得
  const m1 = html.match(
    /<span[^>]*class=["'][^"']*js__searchRecruit--count[^"']*["'][^>]*>\s*([\d,]+)\s*<\/span>/i
  );
  if (m1?.[1]) {
    const n = Number(m1[1].replace(/,/g, ""));
    if (!Number.isNaN(n)) return n;
  }

  // ② 「該当求人数 ○○件中」のテキストから取得（検索結果一覧側）
  const m2 = html.match(/該当求人数\s*([\d,]+)\s*件中/);
  if (m2?.[1]) {
    const n = Number(m2[1].replace(/,/g, ""));
    if (!Number.isNaN(n)) return n;
  }

  return null;
}

/**
 * internalLarge / internalSmall から
 * マイナビの「職種」用パラメータを組み立てる
 *
 * - 大項目チェックボックス: <input name="lcatarea11" value="11" ...>
 *   → lcatarea{largeCd} = largeCd
 * - 小項目チェックボックス: <input name="scatarea11105" value="11105" ...>
 *   → scatarea{smallCd} = smallCd
 *
 * internalSmall / internalLarge に
 * マイナビのコード（例: "11", "11105"）を入れておく前提。
 * そうでない場合は、後続の処理で fw 等に回す。
 */
function buildJobParams(
  cond: ManualCondition
): { name: string; value: string }[] {
  const out: { name: string; value: string }[] = [];

  const large = cond.internalLarge?.trim() || "";
  const small = cond.internalSmall?.trim() || "";

  // 小分類コード（例: 11105）優先
  if (small && /^[0-9A-Z]+$/.test(small)) {
    out.push({
      name: `scatarea${small}`,
      value: small,
    });
    return out;
  }

  // 大分類コード（例: 11, 16, 1A...）
  if (large && /^[0-9A-Z]+$/.test(large)) {
    out.push({
      name: `lcatarea${large}`,
      value: large,
    });
  }

  return out;
}

/** =========================
 * 都道府県名 → マイナビコード対応
 * =========================
 *
 * マイナビの勤務地モーダルでは、
 *   中分類（都道府県）: <input name="mcatareaP01" value="P01" ...>
 * のように P01〜P47 が使われている。
 *
 * フロント（/job-boards/manual）では「北海道」「東京都」などの
 * 名称を渡しているので、ここで Pxx に変換する。
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
 * prefecture から勤務地（都道府県）用パラメータを組み立てる
 *
 * モーダルの DOM より：
 * - 中分類（都道府県など）: <input name="mcatareaP01" value="P01" ...>
 *   → mcatarea{code} = code
 * - 小分類（市区町村など）: <input name="scatareaC01100" value="C01100" ...>
 *   → scatarea{code} = code
 *
 * prefecture には
 *   - "P01" / "C01100" などのコード
 *   - または「北海道」「大阪府」などの名称
 * が入ってくる想定。
 *
 * 名称の場合は PREF_NAME_TO_CODE で Pxx に変換してから
 * モーダル相当パラメータにする。
 */
function buildAreaParams(
  cond: ManualCondition
): { name: string; value: string }[] {
  const out: { name: string; value: string }[] = [];
  const raw = cond.prefecture?.trim() || "";

  if (!raw) return out;

  let code = raw;

  // すでに Pxx / Cxxxxx などのコード形式ならそのまま扱う
  if (!/^[PC][0-9A-Z]+$/i.test(raw)) {
    // コード形式でなければ都道府県名として Pxx に変換を試みる
    const mapped = PREF_NAME_TO_CODE[raw];
    if (!mapped) {
      // マッピングできない場合は勤務地条件は指定せず、
      // （後続のフリーワード処理で必要なら拾われる）
      return out;
    }
    code = mapped;
  }

  if (code.startsWith("C")) {
    // 市区町村などの小分類
    out.push({
      name: `scatarea${code}`,
      value: code,
    });
  } else {
    // P01 などの中分類（都道府県）
    out.push({
      name: `mcatarea${code}`,
      value: code,
    });
  }

  return out;
}

/**
 * HTML から hidden input の value を抜き出すユーティリティ
 *
 * 例: <input type="hidden" name="token" value="xxxxx">
 */
function extractHiddenInputValue(html: string, name: string): string | null {
  const re = new RegExp(
    `<input[^>]*name=["']${name}["'][^>]*value=["']([^"']*)["'][^>]*>`,
    "i"
  );
  const m = html.match(re);
  return m?.[1] ?? null;
}

/**
 * マイナビの「検索フォーム（js__searchRecruit--form）」に対して、
 * 「職種モーダルで該当職種を選択して『内容を反映する』を押した後、
 *  そのまま『条件に合う求人○○件を検索する』ボタンを押した」
 * 状態を再現する form body を組み立てる。
 */
function buildMynaviFormBody(cond: ManualCondition, baseHtml: string): string {
  const params = new URLSearchParams();

  // --- hidden 系（token, jobsearchType, searchType, refLoc） ---
  const token = extractHiddenInputValue(baseHtml, "token");
  if (token) {
    params.set("token", token);
  }

  // jobsearchType / searchType / refLoc は HTML から取れればそれを優先、なければデフォルト値
  const jobsearchType =
    extractHiddenInputValue(baseHtml, "jobsearchType") ?? "4";
  const searchType = extractHiddenInputValue(baseHtml, "searchType") ?? "8";
  const refLoc = extractHiddenInputValue(baseHtml, "refLoc") ?? "fnc_sra";

  params.set("jobsearchType", jobsearchType);
  params.set("searchType", searchType);
  params.set("refLoc", refLoc);

  // 他の hidden（specialId など）は value="" が多く、省略しても実質同じ扱いになるため今回は省略

  // --- 職種 / 勤務地（モーダル相当のパラメータ） ---
  const jobParams = buildJobParams(cond);
  const areaParams = buildAreaParams(cond);

  for (const p of jobParams) {
    params.set(p.name, p.value);
  }
  for (const p of areaParams) {
    params.set(p.name, p.value);
  }

  // --- フリーワード相当（コードでない文字列をまとめる） ---
  const fwParts: string[] = [];

  const pushIfFreeText = (v: string | null | undefined) => {
    const s = v?.trim();
    if (!s) return;
    // コードとして扱っているパターンは除外
    if (/^[0-9A-Z]+$/.test(s) || /^[PC][0-9A-Z]+$/i.test(s)) return;
    fwParts.push(s);
  };

  // internalLarge / internalSmall が「コードではない（職種名など）」場合はフリーワードへ
  if (jobParams.length === 0) {
    pushIfFreeText(cond.internalLarge);
    pushIfFreeText(cond.internalSmall);
  }

  // 都道府県もコードでなければフリーワードへ、だが
  // buildAreaParams で名称 → コード変換するため、
  // ここに到達するのは「マッピングできなかった名称」のみ
  if (areaParams.length === 0) {
    pushIfFreeText(cond.prefecture);
  }

  // 年齢・雇用形態・年収帯など、現時点ではマイナビ固有の param にマッピングしていないので
  // ひとまずフリーワードとしてだけ連結する（必要なら今後 srEmpstyleCdList 等にマッピング拡張）
  pushIfFreeText(cond.ageBand);
  pushIfFreeText(cond.employmentType);
  pushIfFreeText(cond.salaryBand);

  if (fwParts.length > 0) {
    params.set("srFreeSearchKeyword", fwParts.join(" "));
    // 検索対象の指定（「掲載内容全体」）は初期値 4
    params.set("srFreeSearchCd", "4");
  }

  return params.toString();
}

/**
 * マイナビの検索件数を取得するメイン関数
 *
 * - ① まず https://tenshoku.mynavi.jp/list/ を GET して、
 *      token や jobsearchType など hidden 値 & Cookie を取得
 * - ② その HTML を元に、指定された職種 / 都道府県などを反映した
 *      form body を組み立てて /search/list/ に POST
 * - ③ 返ってきた HTML から js__searchRecruit--count をパースして件数を返す
 *
 * → 実質、
 *   「職種モーダルを開いて該当職種を選択して『内容を反映する』→
 *     そのまま『条件に合う求人○○件を検索する』ボタンを押した」
 *   のと同じ挙動になる。
 */
export async function fetchMynaviJobsCount(
  cond: ManualCondition
): Promise<number | null> {
  const listUrl = "https://tenshoku.mynavi.jp/list/";
  const searchUrl = "https://tenshoku.mynavi.jp/search/list/";

  const controller = new AbortController();
  const timeoutMs = 15000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    // ① /list/ を開いてフォーム初期状態と token / Cookie を取得
    const res1 = await fetch(listUrl, {
      method: "GET",
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36",
        "accept-language": "ja-JP,ja;q=0.9,en;q=0.8",
      },
      signal: controller.signal,
    });

    if (!res1.ok) {
      console.error("mynavi list fetch failed", res1.status, res1.statusText);
      return null;
    }

    const html1 = await res1.text();
    const setCookie = res1.headers.get("set-cookie") || "";

    // ② 職種モーダルでの選択を反映したフォーム body を組み立てて /search/list/ に POST
    const body = buildMynaviFormBody(cond, html1);

    const res2 = await fetch(searchUrl, {
      method: "POST",
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36",
        "accept-language": "ja-JP,ja;q=0.9,en;q=0.8",
        "content-type": "application/x-www-form-urlencoded",
        ...(setCookie ? { cookie: setCookie } : {}),
      },
      body,
      signal: controller.signal,
    });

    if (!res2.ok) {
      console.error("mynavi search fetch failed", res2.status, res2.statusText);
      return null;
    }

    const html2 = await res2.text();
    return parseMynaviJobsCount(html2);
  } catch (err) {
    // fetch 失敗時は例外を上に投げず null にする
    console.error("mynavi fetch error", err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
