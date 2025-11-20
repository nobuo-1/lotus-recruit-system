// web/src/server/job-boards/mynavi.ts

import type { ManualCondition } from "./types";

/**
 * マイナビの検索結果ページ HTML から
 * 「条件に合う求人 ○○件を検索する」の ○○件 を抜き出す
 *
 * 対象要素：
 *   <span class="js__searchRecruit--count">45035</span>
 */
export function parseMynaviJobsCount(html: string): number | null {
  // ① ユーザー指定の .js__searchRecruit--count に限定して取得
  const m1 = html.match(
    /<span[^>]*class=["'][^"']*js__searchRecruit--count[^"']*["'][^>]*>\s*([\d,]+)\s*<\/span>/i
  );
  if (m1?.[1]) {
    const n = Number(m1[1].replace(/,/g, ""));
    if (!Number.isNaN(n)) return n;
  }

  // ② 念のためのフォールバック（将来仕様変更などに備えて）
  const m2 = html.match(/該当求人数\s*([\d,]+)\s*件中/);
  if (m2?.[1]) {
    const n = Number(m2[1].replace(/,/g, ""));
    if (!Number.isNaN(n)) return n;
  }

  return null;
}

/**
 * マイナビ用の検索 URL を条件から組み立てる。
 *
 * ⚠️ ここはプロジェクトごとの実装差が大きいので、
 *    すでに「正しく動いている URL 生成ロジック」がある場合は、
 *    必ずそちらで上書きしてください。
 */
function buildMynaviUrl(cond: ManualCondition): string {
  // ★ダミー実装：必要最低限の形だけ用意
  // すでに別の URL 生成処理があるなら、この関数の中身を
  // 既存ロジックで丸ごと置き換えてください。
  const base = "https://tenshoku.mynavi.jp/list/";

  const params = new URLSearchParams();

  // 例として、キーワードにまとめて投げる
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
    params.set("fw", kwParts.join(" "));
  }

  const query = params.toString();
  return query ? `${base}?${query}` : base;
}

/**
 * マイナビの検索件数を取得するメイン関数
 *
 * - 既存実装に login / cookie などがある場合は、
 *   fetch 部分を既存のものに差し替えて OK。
 */
export async function fetchMynaviJobsCount(
  cond: ManualCondition
): Promise<number | null> {
  const url = buildMynaviUrl(cond);

  const res = await fetch(url, {
    method: "GET",
    headers: {
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36",
      "accept-language": "ja-JP,ja;q=0.9,en;q=0.8",
    },
  });

  if (!res.ok) {
    console.error("mynavi fetch failed", res.status, res.statusText);
    return null;
  }

  const html = await res.text();
  return parseMynaviJobsCount(html);
}
