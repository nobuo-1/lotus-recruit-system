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

/** =========================
 * 都道府県名 → マイナビ P コード対応
 * =========================
 *
 * tenshoku.mynavi.jp の URL では
 *   /list/p13/   … 東京都
 * のように pXX が使われるため、名称や PXX を pXX に変換する。
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
 * /list/p27/ のようなパスを生成する。
 *
 * - prefecture が未指定 → "/list/"
 * - "大阪府" など名称     → PREF_NAME_TO_CODE で Pxx に変換 → "/list/pxx/"
 * - "P27" など Pxx        → "/list/p27/"
 * - それ以外（市区町村コードなど）は、現状はパス指定せず "/list/" に落とす
 */
function buildMynaviPathFromPrefecture(cond: ManualCondition): string {
  const raw = cond.prefecture?.trim();
  if (!raw) return "/list/";

  let code = raw;

  // コード形式でなければ都道府県名として Pxx に変換を試みる
  if (!/^P\d{2}$/i.test(raw)) {
    const mapped = PREF_NAME_TO_CODE[raw];
    if (!mapped) {
      // マッピングできない場合は都道府県条件は無視（フリーワードなどで拾われるケースのみ）
      return "/list/";
    }
    code = mapped;
  }

  // P13 → p13 に
  const num = code.slice(1);
  if (!/^\d{2}$/.test(num)) return "/list/";

  return `/list/p${num}/`;
}

/**
 * internalLarge / internalSmall から
 * マイナビの「職種」用クエリパラメータを組み立てる。
 *
 * - 大分類コード: sr_occ_l_cd=13 など
 * - 小分類コード: sr_occ_cd=1303 など（仮定：small はこちらに載せる）
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
 * 以前は:
 *   ① /list/ を GET -> hidden や token をパース
 *   ② /search/list/ に POST
 * という複雑なフローだったが、
 *
 * 現在は、
 *   https://tenshoku.mynavi.jp/list/pg4/?jobsearchType=4&searchType=8&sr_occ_l_cd=13
 * のようなクエリで職種指定が行われているため、
 *
 *   - 職種:  sr_occ_l_cd / sr_occ_cd
 *   - 勤務地: /list/p13/ のようなパス
 *
 * を直接組み立てて /list/ を GET し、その HTML から
 * js__searchRecruit--count をパースするようにする。
 */
export async function fetchMynaviJobsCount(
  cond: ManualCondition
): Promise<number | null> {
  // jobsearchType / searchType は検索条件付き一覧の基本的な値
  const jobsearchType = "4";
  const searchType = "8";

  // 1) 勤務地から /list/ or /list/p13/ のパスを決定
  const path = buildMynaviPathFromPrefecture(cond);

  // 2) 職種コードからクエリパラメータを組み立て
  const params = buildMynaviJobQueryParams(cond);
  params.set("jobsearchType", jobsearchType);
  params.set("searchType", searchType);

  const url = `https://tenshoku.mynavi.jp${path}?${params.toString()}`;

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
    return parseMynaviJobsCount(html);
  } catch (err) {
    console.error("mynavi fetch error", err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
