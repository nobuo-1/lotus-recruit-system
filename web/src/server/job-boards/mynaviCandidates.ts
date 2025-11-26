// web/src/server/job-boards/mynaviCandidates.ts

import type { MynaviLoginSession } from "./mynaviLogin";

/** 数字文字列（カンマ付き）→ number | null */
function safeParseCount(raw: string | undefined | null): number | null {
  if (!raw) return null;
  const n = Number(raw.replace(/,/g, ""));
  if (Number.isNaN(n)) return null;
  return n;
}

/**
 * 候補者検索ページの HTML から「該当会員数」を抽出する
 *
 * 想定されるパターン:
 * - 「該当会員 1,234 名」
 * - 「条件に合う会員 1,234名」
 * - 「検索対象 1,234名」
 */
function parseMynaviScoutCount(html: string): {
  count: number | null;
  hint: string | null;
} {
  // ① 「該当会員 1,234 名」
  {
    const m = html.match(/該当会員[\s　]*([\d,]+)[\s　]*(名|人)/);
    const n = safeParseCount(m?.[1]);
    if (n != null) return { count: n, hint: "text:該当会員○名" };
  }

  // ② 「条件に合う会員 1,234 名」
  {
    const m = html.match(/条件に合う会員[\s　]*([\d,]+)[\s　]*(名|人)/);
    const n = safeParseCount(m?.[1]);
    if (n != null) return { count: n, hint: "text:条件に合う会員○名" };
  }

  // ③ 「検索対象 1,234 名」
  {
    const m = html.match(/検索対象[\s　]*([\d,]+)[\s　]*(名|人)/);
    const n = safeParseCount(m?.[1]);
    if (n != null) return { count: n, hint: "text:検索対象○名" };
  }

  // ④ ゆるい近傍マッチ（「会員」「対象」「検索結果」付近の ○名）
  {
    const m = html.match(/(会員|対象|検索結果)[\s\S]{0,80}?([\d,]+)\s*(名|人)/);
    const n = safeParseCount(m?.[2]);
    if (n != null) return { count: n, hint: "text:ゆるい近傍マッチ" };
  }

  return { count: null, hint: null };
}

/** マイナビ候補者数取得の結果構造 */
export type MynaviScoutCountResult = {
  /** 抽出できた候補者数（null の場合は失敗） */
  total: number | null;
  /** 実際に叩いた URL */
  url: string;
  /** HTTP ステータスコード */
  httpStatus?: number | null;
  /** どのパターンでパースできたか */
  parseHint?: string | null;
  /** 失敗時メッセージ */
  errorMessage?: string | null;
};

/**
 * ログイン済みセッション (Cookie) を使って、指定されたスカウトURLの
 * 「該当会員数」を取得する。
 *
 * 例:
 *   https://tenshoku.mynavi.jp/client/scout/index.cfm?chkcd=...&job_seq_no=1&...
 */
export async function fetchMynaviScoutCount(
  session: MynaviLoginSession,
  url: string
): Promise<MynaviScoutCountResult> {
  const controller = new AbortController();
  const timeoutMs = 15000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        cookie: session.cookieHeader,
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36",
        "accept-language": "ja-JP,ja;q=0.9,en;q=0.8",
        accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        referer: "https://tenshoku.mynavi.jp/client/",
      },
      signal: controller.signal,
    });

    const httpStatus = res.status;

    if (!res.ok) {
      const msg = `mynavi scout fetch failed: ${res.status} ${res.statusText}`;
      console.error(msg, { url });
      return {
        total: null,
        url,
        httpStatus,
        parseHint: null,
        errorMessage: msg,
      };
    }

    const html = await res.text();
    const { count, hint } = parseMynaviScoutCount(html);

    if (count == null) {
      const msg = "候補者数をページからパースできませんでした。";
      console.error(msg, {
        url,
        htmlSnippet: html.slice(0, 2000),
      });
      return {
        total: null,
        url,
        httpStatus,
        parseHint: hint,
        errorMessage: msg,
      };
    }

    return {
      total: count,
      url,
      httpStatus,
      parseHint: hint,
      errorMessage: null,
    };
  } catch (err: any) {
    const msg = `mynavi scout fetch error: ${err?.message ?? String(err)}`;
    console.error("mynavi scout fetch error", err, { url });
    return {
      total: null,
      url,
      httpStatus: null,
      parseHint: null,
      errorMessage: msg,
    };
  } finally {
    clearTimeout(timer);
  }
}
