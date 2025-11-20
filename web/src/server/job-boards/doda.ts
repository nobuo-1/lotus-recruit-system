// web/src/server/job-boards/doda.ts

import type { ManualCondition } from "./types";

/**
 * doda の検索結果ページ HTML から件数を抜き出す
 *
 * 優先順：
 *   1. <p class="overlay-search-area__total">
 *        この条件の求人数<span class="overlay-search-area__number">753</span>件
 *      </p>
 *   2. <p class="search-sidebar__total-count">
 *        この条件の求人数<span class="search-sidebar__total-count__number">753</span>件
 *      </p>
 *   3. 「該当求人数 753 件中 ...」パターン
 */
export function parseDodaJobsCount(html: string): number | null {
  // ① overlay-search-area__number
  let m = html.match(
    /<span[^>]*class=["'][^"']*overlay-search-area__number[^"']*["'][^>]*>\s*([\d,]+)\s*<\/span>/i
  );
  if (m?.[1]) {
    const n = Number(m[1].replace(/,/g, ""));
    if (!Number.isNaN(n)) return n;
  }

  // ② search-sidebar__total-count__number
  m = html.match(
    /<span[^>]*class=["'][^"']*search-sidebar__total-count__number[^"']*["'][^>]*>\s*([\d,]+)\s*<\/span>/i
  );
  if (m?.[1]) {
    const n = Number(m[1].replace(/,/g, ""));
    if (!Number.isNaN(n)) return n;
  }

  // ③ フォールバック：該当求人数 753 件中 ...
  m = html.match(/該当求人数\s*([\d,]+)\s*件中/);
  if (m?.[1]) {
    const n = Number(m[1].replace(/,/g, ""));
    if (!Number.isNaN(n)) return n;
  }

  return null;
}

/**
 * doda 検索 URL を条件から組み立てる。
 *
 * 参考にいただいた URL:
 * https://doda.jp/DodaFront/View/JobSearchList.action?sid=TopSearch&usrclk=PC_logout_kyujinSearchArea_searchButton
 *
 * まずは「キーワードにまとめて投げる」簡易版。
 * internalLarge / internalSmall / prefecture / ageBand / employmentType / salaryBand
 * に入っている文字列を keyword として連結している。
 */
function buildDodaUrl(cond: ManualCondition): string {
  const base = "https://doda.jp/DodaFront/View/JobSearchList.action";

  const u = new URL(base);

  // ベースパラメータ（指定があれば合わせる）
  u.searchParams.set("sid", "TopSearch");
  u.searchParams.set("usrclk", "PC_logout_kyujinSearchArea_searchButton");

  const kwParts = [
    cond.internalLarge,
    cond.internalSmall,
    cond.prefecture,
    cond.ageBand,
    cond.employmentType,
    cond.salaryBand,
  ]
    .filter((v): v is string => !!v)
    .map((v) => v.trim())
    .filter(Boolean);

  if (kwParts.length > 0) {
    u.searchParams.set("keyword", kwParts.join(" "));
  }

  return u.toString();
}

/**
 * doda の検索件数を取得するメイン関数
 *
 * - fetch は AbortController + try/catch でラップ
 * - 通信エラーやタイムアウト時は例外を投げず null を返す
 */
export async function fetchDodaJobsCount(
  cond: ManualCondition
): Promise<number | null> {
  const url = buildDodaUrl(cond);

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
      console.error("doda fetch failed", res.status, res.statusText);
      return null;
    }

    const html = await res.text();
    return parseDodaJobsCount(html);
  } catch (err) {
    // fetch 失敗時は例外を上に投げず null にする
    console.error("doda fetch error", err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
