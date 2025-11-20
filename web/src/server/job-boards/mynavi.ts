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
 * そうでない場合は、buildMynaviUrl 内で fw（フリーワード）側に回します。
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

/**
 * prefecture から勤務地（都道府県）用パラメータを組み立てる
 *
 * モーダルの DOM より：
 * - 中分類（都道府県など）: <input name="mcatareaP01" value="P01" ...>
 *   → mcatarea{code} = code
 * - 小分類（市区町村など）: <input name="scatareaC01100" value="C01100" ...>
 *   → scatarea{code} = code
 *
 * prefecture に "P01" / "C01100" などのコードが入っている前提。
 * そうでない（「北海道」「大阪府」などの名称）場合は、
 * buildMynaviUrl 内で fw（フリーワード）に回します。
 */
function buildAreaParams(
  cond: ManualCondition
): { name: string; value: string }[] {
  const out: { name: string; value: string }[] = [];
  const raw = cond.prefecture?.trim() || "";

  if (!raw) return out;

  // コード形式（P01, C01100 など）の場合のみモーダル相当パラメータにする
  if (/^[PC][0-9A-Z]+$/i.test(raw)) {
    if (raw.startsWith("C")) {
      // 市区町村などの小分類
      out.push({
        name: `scatarea${raw}`,
        value: raw,
      });
    } else {
      // P01 などの中分類（都道府県）
      out.push({
        name: `mcatarea${raw}`,
        value: raw,
      });
    }
  }

  return out;
}

/**
 * マイナビ用の検索 URL を条件から組み立てる。
 *
 * - 職種 / 勤務地は、モーダルのチェックボックス name に対応する
 *   クエリパラメータ（lcatareaXX / mcatareaXXX / scatareaXXXXX）を付与
 *   → モーダルで選んで「内容を反映する」を押した結果と同等の状態を URL で再現
 * - それ以外、またはコードではない文字列（「営業」「大阪府」など）は fw にまとめる
 */
function buildMynaviUrl(cond: ManualCondition): string {
  const base = "https://tenshoku.mynavi.jp/list/";

  const search = new URLSearchParams();

  // --- 職種 / 勤務地（モーダル相当） ---
  const jobParams = buildJobParams(cond);
  const areaParams = buildAreaParams(cond);

  for (const p of jobParams) {
    search.set(p.name, p.value);
  }
  for (const p of areaParams) {
    search.set(p.name, p.value);
  }

  // --- フリーワード ---
  const fwParts: string[] = [];

  const pushIfFreeText = (v: string | null | undefined) => {
    const s = v?.trim();
    if (!s) return;
    // 既に「コードとして」使っているものは fw に入れない
    if (/^[0-9A-Z]+$/.test(s) || /^[PC][0-9A-Z]+$/i.test(s)) return;
    fwParts.push(s);
  };

  // internalLarge / internalSmall が「コードではない（名称など）」場合はこちらに入る
  if (jobParams.length === 0) {
    pushIfFreeText(cond.internalLarge);
    pushIfFreeText(cond.internalSmall);
  }

  // prefecture が「コードではない（都道府県名など）」場合はこちら
  if (areaParams.length === 0) {
    pushIfFreeText(cond.prefecture);
  }

  // その他の条件（必要に応じてキーワード化）
  pushIfFreeText(cond.ageBand);
  pushIfFreeText(cond.employmentType);
  pushIfFreeText(cond.salaryBand);

  if (fwParts.length > 0) {
    search.set("fw", fwParts.join(" "));
  }

  const query = search.toString();
  return query ? `${base}?${query}` : base;
}

/**
 * マイナビの検索件数を取得するメイン関数
 *
 * - fetch は AbortController + try/catch でラップ
 * - 通信エラーやタイムアウト時は例外を投げず null を返す
 */
export async function fetchMynaviJobsCount(
  cond: ManualCondition
): Promise<number | null> {
  const url = buildMynaviUrl(cond);

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
      console.error("mynavi fetch failed", res.status, res.statusText);
      return null;
    }

    const html = await res.text();
    return parseMynaviJobsCount(html);
  } catch (err) {
    // fetch 失敗時は例外を上に投げず null にする
    console.error("mynavi fetch error", err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
