// doda-proxy/doda-parser.js

function safeParseCount(raw) {
  if (!raw) return null;
  const n = Number(String(raw).replace(/,/g, ""));
  if (Number.isNaN(n)) return null;
  return n;
}

/**
 * Doda の HTML から求人件数を抜き出す
 * （Next.js 側の parseDodaJobsCountInternal と同じロジック）
 */
function parseDodaJobsCountInternal(html) {
  // 0-1. サイドバー上部の件数
  {
    const m = html.match(
      /<span[^>]*class=["'][^"']*search-sidebar__total-count__number[^"']*["'][^>]*>\s*([\d,]+)\s*<\/span>/i
    );
    const n = safeParseCount(m && m[1]);
    if (n != null) {
      return {
        count: n,
        hint: "class:search-sidebar__total-count__number",
      };
    }
  }

  // 0-2. 検索結果ヘッダー部の件数
  {
    const m = html.match(
      /<span[^>]*class=["'][^"']*displayJobCount__totalNum[^"']*["'][^>]*>\s*([\d,]+)\s*<\/span>/i
    );
    const n = safeParseCount(m && m[1]);
    if (n != null) {
      return {
        count: n,
        hint: "class:displayJobCount__totalNum",
      };
    }
  }

  // ① 「該当求人数 91 件中 1～50件 を表示」
  {
    const m = html.match(/該当求人数[\s\S]{0,80}?([\d,]+)\s*件/);
    const n = safeParseCount(m && m[1]);
    if (n != null) {
      return { count: n, hint: "text:該当求人数○件" };
    }
  }

  // ② 「この条件の求人数 91 件」
  {
    const m = html.match(/この条件の求人数[\s\S]{0,80}?([\d,]+)\s*件/);
    const n = safeParseCount(m && m[1]);
    if (n != null) {
      return { count: n, hint: "text:この条件の求人数○件" };
    }
  }

  // ③ 「公開求人数 58 件」
  {
    const m = html.match(/公開求人数[\s\S]{0,80}?([\d,]+)\s*件/);
    const n = safeParseCount(m && m[1]);
    if (n != null) {
      return { count: n, hint: "text:公開求人数○件" };
    }
  }

  // ④ <meta name="description" content="…公開求人数58件…">
  {
    const m = html.match(
      /<meta[^>]+name=["']description["'][^>]+content=["'][^"'>]*?([\d,]+)\s*件[^"'>]*["'][^>]*>/i
    );
    const n = safeParseCount(m && m[1]);
    if (n != null) {
      return { count: n, hint: "meta[name=description]" };
    }
  }

  // ⑤ ゆるい fallback
  {
    const m = html.match(
      /(該当求人数|この条件の求人数|求人)[\s\S]{0,120}?([\d,]+)\s*件/
    );
    const n = safeParseCount(m && m[2]);
    if (n != null) {
      return { count: n, hint: "text:ゆるい近傍マッチ" };
    }
  }

  return { count: null, hint: null };
}

module.exports = {
  parseDodaJobsCountInternal,
};
