// web/src/server/job-boards/type.ts

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
 * HTML から type の求人件数を抜き出す内部処理
 *
 * 優先度:
 *  0. <span class="whole-num"> ... <span class="num">123</span>件...</span>
 *  1. 「この条件の求人 123 件」
 *  2. 「123 件中 1～50 件を表示」
 *  3. 緩めのフォールバック
 */
function parseTypeJobsCountInternal(html: string): {
  count: number | null;
  hint: string | null;
} {
  // 0. span.whole-num 配下の span.num
  {
    const m = html.match(
      /<span[^>]*class=["'][^"']*whole-num[^"']*["'][^>]*>[\s\S]*?<span[^>]*class=["'][^"']*num[^"']*["'][^>]*>\s*([\d,]+)\s*<\/span>[\s\S]*?件/s
    );
    const n = safeParseCount(m?.[1]);
    if (n != null) {
      return { count: n, hint: "span.whole-num span.num" };
    }
  }

  // 1. 「この条件の求人 123 件」
  {
    const m = html.match(/この条件の求人[\s　]*([\d,]+)[\s　]*件/);
    const n = safeParseCount(m?.[1]);
    if (n != null) {
      return { count: n, hint: "text:この条件の求人○件" };
    }
  }

  // 2. 「123 件中 1～50 件を表示」
  {
    const m = html.match(
      /([\d,]+)[\s　]*件中[\s　]*[\d,]+[\s　]*～[\s　]*[\d,]+[\s　]*件を表示/
    );
    const n = safeParseCount(m?.[1]);
    if (n != null) {
      return { count: n, hint: "text:○件中○～○件を表示" };
    }
  }

  // 3. ゆるい fallback
  {
    const m = html.match(
      /(この条件の求人|件中)[\s\S]{0,120}?([\d,]+)[\s　]*件/
    );
    const n = safeParseCount(m?.[2]);
    if (n != null) {
      return { count: n, hint: "text:ゆるい近傍マッチ" };
    }
  }

  return { count: null, hint: null };
}

/** 旧来互換: HTML 全体から件数だけ返す */
export function parseTypeJobsCount(html: string): number | null {
  return parseTypeJobsCountInternal(html).count;
}

/** =========================
 * 都道府県名 → type workplaceIdList コード
 * ========================= */
/**
 * ManualCondition.prefecture に入ってくる文字列
 *   - 「北海道」「東京都」「大阪府」「神奈川県」など
 *   - もしくは "10" などの workplaceId 数値文字列
 *
 * 「都道府県単位」でしか検索しない前提なので、
 *   - 東京都  : 東京23区(23) ＋ 東京都(23区を除く)(22)
 *   - 神奈川県: 横浜市(25) ＋ 川崎市(26) ＋ 神奈川県(横浜市、川崎市を除く)(24)
 *   - 大阪府  : 大阪市(40) ＋ 大阪府(大阪市を除く)(39)
 * をまとめて投げる。
 *
 * 実際の URL 生成時に "22,23" のような文字列を分解し、
 * ?workplaceIdList=22&workplaceIdList=23 のように複数指定する。
 *
 * 海外(61〜67)は不要なのでマッピングしない。
 */
const PREF_NAME_TO_TYPE_CODE: Record<string, string> = {
  // place-1（北海道・東北）
  北海道: "10",
  青森県: "11",
  岩手県: "12",
  宮城県: "13",
  秋田県: "14",
  山形県: "15",
  福島県: "16",

  // place-2（北関東）
  茨城県: "17",
  栃木県: "18",
  群馬県: "19",

  // place-3（首都圏）
  // 細分された元の名称も一応残しておく
  東京23区: "23",
  "東京都(23区を除く)": "22",
  東京都: "22,23", // ★ 都道府県単位指定 → 23区＋それ以外をまとめて検索

  "神奈川県(横浜市、川崎市を除く)": "24",
  横浜市: "25",
  川崎市: "26",
  神奈川県: "24,25,26", // ★ 神奈川県全体

  埼玉県: "20",
  千葉県: "21",

  // place-4（甲信越・北陸）
  新潟県: "27",
  山梨県: "28",
  長野県: "29",
  富山県: "30",
  石川県: "31",
  福井県: "32",

  // place-5（東海）
  岐阜県: "33",
  静岡県: "34",
  愛知県: "35",
  三重県: "36",

  // place-6（関西）
  "大阪府(大阪市を除く)": "39",
  大阪市: "40",
  大阪府: "39,40", // ★ 大阪府全体

  滋賀県: "37",
  京都府: "38",
  兵庫県: "41",
  奈良県: "42",
  和歌山県: "43",

  // place-7（中国・四国）
  鳥取県: "44",
  島根県: "45",
  岡山県: "46",
  広島県: "47",
  山口県: "48",
  徳島県: "49",
  香川県: "50",
  愛媛県: "51",
  高知県: "52",

  // place-8（九州・沖縄）
  福岡県: "53",
  佐賀県: "54",
  長崎県: "55",
  熊本県: "56",
  大分県: "57",
  宮崎県: "58",
  鹿児島県: "59",
  沖縄県: "60",
};

/**
 * ManualCondition.prefecture（「北海道」「東京都」「23」など）から
 * type の workplaceIdList コード（カンマ区切り文字列）を返す
 */
function getTypeWorkplaceCode(cond: ManualCondition): string | null {
  const raw = cond.prefecture?.trim();
  if (!raw) return null;

  // すでに数値コードっぽいときはそのまま使う（"10" / "22,23" など）
  if (/^\d+(?:[,+]\d+)*$/.test(raw)) {
    return raw;
  }

  const mapped = PREF_NAME_TO_TYPE_CODE[raw];
  return mapped ?? null;
}

/** =========================
 * 職種（external_small_code）→ job3IdList
 * ========================= */
/**
 * cond.internalSmall には job_board_mappings.external_small_code が入る想定。
 * 「3,140」や「3+140」のように複数IDが入るケースも考慮し、
 * カンマ or プラス区切りで分割して job3IdList に展開する。
 */
function buildTypeJob3IdList(cond: ManualCondition): string[] {
  const raw = cond.internalSmall?.trim();
  if (!raw) return [];

  const out: string[] = [];
  for (const piece of raw.split(/[,+]/)) {
    const id = piece.trim();
    if (!id) continue;
    // 数字のみを残す（念のため）
    const digits = id.replace(/[^0-9]/g, "");
    if (!digits) continue;
    out.push(digits);
  }
  return out;
}

/** =========================
 * URL 組み立て
 * ========================= */

const TYPE_BASE_URL = "https://type.jp/job/search/";

/**
 * ManualCondition から type の検索 URL を組み立てる。
 *
 * 例:
 *   https://type.jp/job/search/
 *     ?job3IdList=3&job3IdList=140
 *     &workplaceIdList=10
 *     &pathway=37
 *     &isFirstPage=true
 *     &isLogin=false
 *     &keyword=
 *
 * prefCode が "22,23" のような場合は、
 *   ?workplaceIdList=22&workplaceIdList=23
 * として付与する。
 */
function buildTypeListUrl(
  cond: ManualCondition,
  prefCode: string | null
): { url: string; job3Ids: string[] } {
  const params = new URLSearchParams();

  const job3Ids = buildTypeJob3IdList(cond);
  for (const id of job3Ids) {
    params.append("job3IdList", id);
  }

  if (prefCode) {
    for (const piece of prefCode.split(/[,+]/)) {
      const code = piece.trim();
      if (!code) continue;
      params.append("workplaceIdList", code);
    }
  }

  // 参考URLに合わせた固定パラメータ
  params.set("pathway", "37");
  params.set("isFirstPage", "true");
  params.set("isLogin", "false");
  params.set("keyword", "");

  const url = `${TYPE_BASE_URL}?${params.toString()}`;
  return { url, job3Ids };
}

/** =========================
 * fetch 実装
 * ========================= */

export type TypeJobsCountResult = {
  /** 最終的に返した件数（null の場合は取得失敗） */
  total: number | null;
  /** 実際に叩いた URL */
  url: string;
  /** 使用した勤務地コード（例: "10" や "22,23"） */
  prefCode: string | null;
  /** 使用した職種コード群（例: ["3","140"]） */
  job3Ids: string[];
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
  referer: "https://type.jp/",
};

/**
 * Vercel (Next.js) から type に直接アクセスして件数を取得する実装
 */
async function fetchTypeJobsCountViaDirectFetch(
  url: string,
  prefCode: string | null,
  job3Ids: string[]
): Promise<TypeJobsCountResult> {
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
      const msg = `type list fetch failed: ${res.status} ${res.statusText}`;
      console.error(msg, { url });
      return {
        total: null,
        url,
        prefCode,
        job3Ids,
        httpStatus,
        parseHint: null,
        errorMessage: msg,
      };
    }

    const html = await res.text();
    const { count, hint } = parseTypeJobsCountInternal(html);

    if (count == null) {
      const msg = "type fetch could not parse jobs count";
      console.error(msg, {
        url,
        htmlSnippet: html.slice(0, 2000),
      });
      return {
        total: null,
        url,
        prefCode,
        job3Ids,
        httpStatus,
        parseHint: hint,
        errorMessage: msg,
      };
    }

    return {
      total: count,
      url,
      prefCode,
      job3Ids,
      httpStatus,
      parseHint: hint,
      errorMessage: null,
    };
  } catch (err: any) {
    const msg =
      err?.name === "AbortError"
        ? "type fetch aborted (timeout)"
        : `type fetch error: ${err?.message ?? String(err)}`;

    console.error("type fetch error", err, { url });

    return {
      total: null,
      url,
      prefCode,
      job3Ids,
      httpStatus: null,
      parseHint: null,
      errorMessage: msg,
    };
  } finally {
    clearTimeout(timer);
  }
}

/** =========================
 * 公開 API: type 件数取得（単一条件）
 * ========================= */

/**
 * run-batch/route.ts から呼び出される公開関数。
 *
 * - job_board_mappings でマッピング済みの ManualCondition を受け取り
 * - 職種コード（job3IdList）＋勤務地コード（workplaceIdList）入りの URL を叩き
 * - HTML から該当求人数を抜き出して結果オブジェクトを返す
 */
export async function fetchTypeJobsCount(
  cond: ManualCondition
): Promise<TypeJobsCountResult> {
  const prefCode = getTypeWorkplaceCode(cond);
  const { url, job3Ids } = buildTypeListUrl(cond, prefCode);

  const result = await fetchTypeJobsCountViaDirectFetch(url, prefCode, job3Ids);

  if (result.errorMessage) {
    console.error("type jobs count error (direct)", result);
  } else {
    console.info("type jobs count ok (direct)", {
      url: result.url,
      total: result.total,
      prefCode: result.prefCode,
      job3Ids: result.job3Ids,
      hint: result.parseHint,
      httpStatus: result.httpStatus,
    });
  }

  return result;
}
