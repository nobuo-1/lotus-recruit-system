// web/src/server/job-boards/womantype.ts

import type { ManualCondition } from "./types";

/** ======== 共通ユーティリティ ======== */

/** 数字文字列（カンマ付き）→ number | null */
function safeParseCount(raw: string | undefined | null): number | null {
  if (!raw) return null;
  const n = Number(String(raw).replace(/,/g, ""));
  if (Number.isNaN(n)) return null;
  return n;
}

/**
 * HTML から 女の転職type の求人件数を抜き出す内部処理
 *
 * 優先度というより「候補を全部集めて最大値を採用」する方式。
 *
 * 探索パターン:
 *  - <span id="result_count">123</span>
 *  - <span id="loading-count">123</span>
 *  - <span id="result-count">123</span>
 *  - 「該当の求人件数 123 件」
 *  - 「123 件中 1～40 を表示」
 *  - <meta name="description" content="…123件…">
 *  - 「検索結果」「該当の求人」「条件に合う求人」「求人情報」近傍の「○○件」
 *
 * それぞれ複数回出現する可能性があるので、すべて走査して
 * 「見つかった数値の最大値」を最終結果とする。
 *
 * ※ 初期 HTML で 0 が入っていても、他の場所に 230 件などがあれば
 *    そちらが優先されるようにしている。
 */
function parseWomanTypeJobsCountInternal(html: string): {
  count: number | null;
  hint: string | null;
} {
  let best: number | null = null;
  let bestHint: string | null = null;

  const consider = (candidate: number | null, hint: string) => {
    if (candidate == null) return;
    if (best == null || candidate > best) {
      best = candidate;
      bestHint = hint;
    }
  };

  // 0. <span id="result_count" ...>123</span>（今回ご提示のパターン・最有力候補）
  {
    const re =
      /<span[^>]*id=["']result_count["'][^>]*>\s*([\d,]+)\s*<\/span>/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
      consider(safeParseCount(m[1]), "span#result_count(max)");
    }
  }

  // 1. <span id="loading-count" ...>123</span>（旧パターン想定）
  {
    const re =
      /<span[^>]*id=["']loading-count["'][^>]*>\s*([\d,]+)\s*<\/span>/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
      consider(safeParseCount(m[1]), "span#loading-count(max)");
    }
  }

  // 2. <span id="result-count" ...>123</span>（旧パターン想定）
  {
    const re =
      /<span[^>]*id=["']result-count["'][^>]*>\s*([\d,]+)\s*<\/span>/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
      consider(safeParseCount(m[1]), "span#result-count(max)");
    }
  }

  // 3. 「該当の求人件数 123 件」テキスト周りから拾う
  // 例:
  // <p>該当の求人件数<span ...>230</span>件</p>
  {
    const re = /該当の求人件数[\s\S]{0,120}?([\d,]+)[\s　]*件/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
      consider(safeParseCount(m[1]), "text:該当の求人件数○件(max)");
    }
  }

  // 4. 「123 件中 1～40 を表示」 っぽいテキストから拾うゆるい fallback
  {
    const re =
      /([\d,]+)[\s　]*件中[\s　]*[\d,]+[\s　]*～[\s　]*[\d,]+[\s　]*を表示/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
      consider(safeParseCount(m[1]), "text:○件中○～○を表示(max)");
    }
  }

  // 5. <meta name="description" content="…123件…"> から拾うフォールバック
  {
    const re =
      /<meta[^>]+name=["']description["'][^>]+content=["'][^"'>]*?([\d,]+)\s*件[^"'>]*["'][^>]*>/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
      consider(safeParseCount(m[1]), "meta[name=description](max)");
    }
  }

  // 6. 「検索結果」「該当の求人」「条件に合う求人」「求人情報」周辺の ○○件（かなり緩い fallback）
  {
    const re =
      /(検索結果|該当の求人|条件に合う求人|求人情報)[\s\S]{0,120}?([\d,]+)\s*件/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
      consider(safeParseCount(m[2]), "text:ゆるい近傍マッチ(max)");
    }
  }

  return { count: best, hint: bestHint };
}

/** 旧来互換: HTML 全体から件数だけ返す */
export function parseWomanTypeJobsCount(html: string): number | null {
  return parseWomanTypeJobsCountInternal(html).count;
}

/** =========================
 * 職種（external_small_code）→ hopejob パラメータ
 * ========================= */
/**
 * cond.internalSmall には job_board_mappings.external_small_code が入る想定。
 *
 * - 例: "10101" や "10101,10102" や "10101+10102"
 * - カンマ/プラス区切りで分割して、それぞれを hopejob=◯◯ として付与する。
 *
 * internalSmall が空で、かつ internalLarge に "10100" のような
 * 大分類コードが入っている場合は、それを hopejob として使う。
 */
function buildWomanTypeJobCodes(cond: ManualCondition): string[] {
  const codes: string[] = [];

  const pushFromRaw = (raw: string | null | undefined) => {
    if (!raw) return;
    for (const piece of raw.split(/[,+]/)) {
      const digits = piece.trim().replace(/[^0-9]/g, "");
      if (!digits) continue;
      codes.push(digits);
    }
  };

  if (cond.internalSmall) {
    pushFromRaw(cond.internalSmall);
  } else if (cond.internalLarge) {
    // internalLarge 側に 10100 のようなコードを入れているケースの保険
    if (/^\d+(?:[,+]\d+)*$/.test(cond.internalLarge.trim())) {
      pushFromRaw(cond.internalLarge);
    }
  }

  return codes;
}

/** =========================
 * 勤務地（prefecture）→ hp パラメータ
 * ========================= */

/**
 * 女の転職type の「hp」コードマッピング
 *
 * - 01〜47: 都道府県コード
 * - 99    : 海外
 * - 13001/13007/14001/14002/14003/27001/27002: 東京・神奈川・大阪の細分エリア
 *
 * ※ キーは type.ts の PREF_NAME_TO_TYPE_CODE と揃えておくと、
 *    job_board_mappings 側で同じ prefecture 名をそのまま流用しやすい。
 */
const PREF_NAME_TO_WOMAN_HP_CODE: Record<string, string> = {
  // 北海道・東北
  北海道: "01",
  青森県: "02",
  岩手県: "03",
  宮城県: "04",
  秋田県: "05",
  山形県: "06",
  福島県: "07",

  // 北関東
  茨城県: "08",
  栃木県: "09",
  群馬県: "10",

  // 首都圏
  埼玉県: "11",
  千葉県: "12",
  東京都: "13", // 都道府県単位の「東京都」
  神奈川県: "14",

  // 「東京都」を 23区 / 23区外に分けて指定したい場合（type.ts と同じキー）
  東京23区: "13001",
  "東京都(23区を除く)": "13007",

  // 神奈川県の細分
  横浜市: "14001",
  川崎市: "14002",
  "神奈川県(横浜市、川崎市を除く)": "14003",

  // 北陸・甲信越
  新潟県: "15",
  富山県: "16",
  石川県: "17",
  福井県: "18",
  山梨県: "19",
  長野県: "20",

  // 東海
  岐阜県: "21",
  静岡県: "22",
  愛知県: "23",
  三重県: "24",

  // 関西
  滋賀県: "25",
  京都府: "26",
  大阪府: "27",
  兵庫県: "28",
  奈良県: "29",
  和歌山県: "30",

  // 「大阪府」を 大阪市 / 大阪市外 に分けて指定したい場合
  大阪市: "27001",
  "大阪府(大阪市を除く)": "27002",

  // 中国・四国
  鳥取県: "31",
  島根県: "32",
  岡山県: "33",
  広島県: "34",
  山口県: "35",
  徳島県: "36",
  香川県: "37",
  愛媛県: "38",
  高知県: "39",

  // 九州・沖縄
  福岡県: "40",
  佐賀県: "41",
  長崎県: "42",
  熊本県: "43",
  大分県: "44",
  宮崎県: "45",
  鹿児島県: "46",
  沖縄県: "47",

  // 海外
  海外: "99",
};

/**
 * hp コード文字列を Set に追加するユーティリティ
 *
 * - expr: "12" / "12,02,03" / "12+02+03" など
 */
function pushHpCodesFromExpr(expr: string, set: Set<string>) {
  for (const piece of expr.split(/[,+]/)) {
    const digits = piece.trim().replace(/[^0-9]/g, "");
    if (!digits) continue;
    set.add(digits);
  }
}

/**
 * ManualCondition.prefecture を元に hp コード配列を作る。
 */
function buildWomanTypeHpCodes(cond: ManualCondition): string[] {
  const raw = cond.prefecture?.trim();
  if (!raw) return [];

  const codes = new Set<string>();

  // 1) 純粋に「hp コード列」っぽい場合はそのまま使う
  if (/^\d+(?:[,+]\d+)*$/.test(raw)) {
    pushHpCodesFromExpr(raw, codes);
    return Array.from(codes);
  }

  // 2) 日本語名称 or 細分名称の場合
  for (const part of raw.split(/[,+]/)) {
    const key = part.trim();
    if (!key) continue;

    const mapped = PREF_NAME_TO_WOMAN_HP_CODE[key];
    if (!mapped) continue;

    pushHpCodesFromExpr(mapped, codes);
  }

  return Array.from(codes);
}

/** =========================
 * URL 組み立て（/job-search/? ...）
 * ========================= */

const WOMAN_TYPE_SEARCH_URL = "https://woman-type.jp/job-search/";

/**
 * ManualCondition から 女の転職type の検索 URL を組み立てる。
 */
function buildWomanTypeListUrl(cond: ManualCondition): {
  url: string;
  /** ログ用: hopejob に使ったコード（カンマ連結） */
  jobCode: string | null;
  /** ログ用: hp に使ったコード（カンマ連結） */
  areaSlug: string | null;
} {
  const jobCodes = buildWomanTypeJobCodes(cond);
  const hpCodes = buildWomanTypeHpCodes(cond);

  const params = new URLSearchParams();

  // ルートウェイ固定
  params.set("routeway", "79");
  // キーワードは未使用だが、例にならって空で付与
  params.set("keyword", "");

  // 職種 (hopejob)
  for (const code of jobCodes) {
    params.append("hopejob", code);
  }

  // 勤務地（hp）
  for (const code of hpCodes) {
    params.append("hp", code);
  }

  const url = `${WOMAN_TYPE_SEARCH_URL}?${params.toString()}`;

  return {
    url,
    jobCode: jobCodes.length ? jobCodes.join(",") : null,
    areaSlug: hpCodes.length ? hpCodes.join(",") : null,
  };
}

/** =========================
 * fetch 実装
 * ========================= */

export type WomanTypeJobsCountResult = {
  /** 最終的に返した件数（null の場合は取得失敗） */
  total: number | null;
  /** 実際に叩いた URL */
  url: string;
  /**
   * 使用した勤務地コード（hp）。
   * 例: "12,02,03,15"（複数ある場合はカンマ連結）
   */
  areaSlug: string | null;
  /**
   * 使用した職種コード（hopejob）。
   * 例: "10101,10102"（複数ある場合はカンマ連結）
   */
  jobCode: string | null;
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
  referer: "https://woman-type.jp/",
};

/**
 * Vercel (Next.js) から 女の転職type に直接アクセスして件数を取得する実装
 */
async function fetchWomanTypeJobsCountViaDirectFetch(
  url: string,
  areaSlug: string | null,
  jobCode: string | null
): Promise<WomanTypeJobsCountResult> {
  const controller = new AbortController();
  const timeoutMs = 15000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: COMMON_HEADERS as any,
      cache: "no-store",
      signal: controller.signal,
    });

    const httpStatus = res.status;

    if (!res.ok) {
      // 404 の場合は「条件に合う求人が存在しない」とみなして 0 件でフォールバック
      if (res.status === 404) {
        const msg = "woman-type list not found (404, treat as 0件)";
        console.warn(msg, { url });
        return {
          total: 0,
          url,
          areaSlug,
          jobCode,
          httpStatus,
          parseHint: "fallback:404->0",
          errorMessage: null,
        };
      }

      const msg = `woman-type list fetch failed: ${res.status} ${res.statusText}`;
      console.error(msg, { url });
      return {
        total: null,
        url,
        areaSlug,
        jobCode,
        httpStatus,
        parseHint: null,
        errorMessage: msg,
      };
    }

    const html = await res.text();
    const { count, hint } = parseWomanTypeJobsCountInternal(html);

    if (count == null) {
      const msg = "woman-type fetch could not parse jobs count";
      console.error(msg, {
        url,
        htmlSnippet: html.slice(0, 2000),
      });
      // パースできなかった場合も「0件」として扱う（バッチ全体をこけさないため）
      return {
        total: 0,
        url,
        areaSlug,
        jobCode,
        httpStatus,
        parseHint: hint ?? "fallback:parse-failed->0",
        errorMessage: null,
      };
    }

    return {
      total: count,
      url,
      areaSlug,
      jobCode,
      httpStatus,
      parseHint: hint ?? undefined,
      errorMessage: null,
    };
  } catch (err: any) {
    const msg =
      err?.name === "AbortError"
        ? "woman-type fetch aborted (timeout)"
        : `woman-type fetch error: ${err?.message ?? String(err)}`;

    console.error("woman-type fetch error", err, { url });

    return {
      total: null,
      url,
      areaSlug,
      jobCode,
      httpStatus: null,
      parseHint: null,
      errorMessage: msg,
    };
  } finally {
    clearTimeout(timer);
  }
}

/** =========================
 * 公開 API: 女の転職type 件数取得（単一条件）
 * ========================= */

/**
 * run-batch/route.ts から呼び出される公開関数。
 *
 * - job_board_mappings でマッピング済みの ManualCondition を受け取り
 * - 職種コード（hopejob）＋勤務地コード（hp）入りの URL を叩き
 * - HTML から該当求人数を抜き出して結果オブジェクトを返す
 */
export async function fetchWomanTypeJobsCount(
  cond: ManualCondition
): Promise<WomanTypeJobsCountResult> {
  const { url, jobCode, areaSlug } = buildWomanTypeListUrl(cond);

  const result = await fetchWomanTypeJobsCountViaDirectFetch(
    url,
    areaSlug,
    jobCode
  );

  if (result.errorMessage) {
    console.error("woman-type jobs count error (direct)", result);
  } else {
    console.info("woman-type jobs count ok (direct)", {
      url: result.url,
      total: result.total,
      areaSlug: result.areaSlug, // 実態は hp コード列
      jobCode: result.jobCode, // 実態は hopejob コード列
      hint: result.parseHint,
      httpStatus: result.httpStatus,
    });
  }

  return result;
}
