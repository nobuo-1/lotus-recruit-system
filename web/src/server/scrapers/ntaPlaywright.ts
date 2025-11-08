// src/server/scrapers/ntaPlaywright.ts
// Playwright を使って「丁目番地等の入力欄を開く」をクリック → 住所で検索 → 結果HTMLをパース
// 返り値は route.ts と同じ構造で返す

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)";
const LANG = "ja-JP,ja;q=0.9";

export type NtaRow = {
  corporate_number: string | null;
  name: string | null;
  address: string | null;
  detail_url: string | null;
};

function parseSearchHtml(html: string): NtaRow[] {
  const out: NtaRow[] = [];
  const linkRe = /href=["'](\/number\/(\d{13}))[#"']/g;
  let m: RegExpExecArray | null;
  const seen = new Set<string>();
  while ((m = linkRe.exec(html))) {
    const rel = m[1];
    const num = m[2];
    if (!rel || !num || seen.has(num)) continue;
    seen.add(num);

    const ctxStart = Math.max(0, m.index - 1200);
    const ctxEnd = Math.min(html.length, m.index + 1200);
    const ctx = html.slice(ctxStart, ctxEnd).replace(/\s+/g, " ");

    const n1 =
      />(?:名称|商号|法人名)[^<]{0,10}<\/[^>]*>\s*<[^>]*>([^<]{2,120})<\//i
        .exec(ctx)?.[1]
        ?.trim() || null;
    const n2 = />\s*([^<]{2,120})\s*<\/a>/i.exec(ctx)?.[1]?.trim() || null;
    const n3 =
      /<strong[^>]*>([^<]{2,180})<\/strong>/i.exec(ctx)?.[1]?.trim() || null;
    const name = n1 || n2 || n3;

    const addr =
      /(所在地|本店|本社)[^<]{0,20}<\/[^>]*>\s*<[^>]*>([^<]{6,200})<\//i
        .exec(ctx)?.[2]
        ?.trim() ||
      /(所在地|本店|本社)[^\u4e00-\u9fafA-Za-z0-9]{0,5}([^<>{}]{6,200})/i
        .exec(ctx)?.[2]
        ?.trim() ||
      null;

    out.push({
      corporate_number: num,
      name: name || null,
      address: addr || null,
      detail_url: new URL(
        rel,
        "https://www.houjin-bangou.nta.go.jp"
      ).toString(),
    });
  }

  // 予備：裸の法人番号
  const loose = Array.from(new Set(html.match(/\b\d{13}\b/g) || []));
  for (const num of loose) {
    if (seen.has(num)) continue;
    seen.add(num);
    out.push({
      corporate_number: num,
      name: null,
      address: null,
      detail_url: `https://www.houjin-bangou.nta.go.jp/number/${num}`,
    });
  }
  return out;
}

export async function searchNtaByAddressPW(args: {
  keyword: string; // "東京都 渋谷区 代々木" など
  timeoutMs?: number;
}): Promise<NtaRow[]> {
  const timeout = args.timeoutMs ?? 12000;

  // 動的 import（必要時だけ読み込む）
  const { chromium } = await import("playwright");

  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const page = await browser.newPage({
    userAgent: UA,
    locale: "ja-JP",
  });

  try {
    // 検索画面へ
    await page.goto("https://www.houjin-bangou.nta.go.jp/kensaku.html", {
      timeout,
      waitUntil: "domcontentloaded",
    });

    // 「丁目番地等の入力欄を開く」を試す（存在しない場合もあるので try）
    try {
      const link = page.locator(
        'a.rs_preserve:has-text("丁目番地等の入力欄を開く")'
      );
      if (await link.first().isVisible({ timeout: 1500 })) {
        await link.first().click({ timeout: 1500 });
      }
    } catch {}

    // 入力欄の候補（サイト変更に強いフォールバック順）
    const candidates = [
      'input[name="searchString"]',
      "#searchString",
      'input[name="q"]',
      'input[name="location"]',
    ];
    let filled = false;
    for (const sel of candidates) {
      const loc = page.locator(sel);
      if (await loc.count()) {
        await loc.fill(args.keyword, { timeout: 1500 });
        filled = true;
        break;
      }
    }
    if (!filled) {
      // ラベルベースの保険
      const loc = page.getByLabel(/所在地|住所|所在地（住所）|住所で検索/);
      if (await loc.count()) {
        await loc.fill(args.keyword, { timeout: 1500 });
        filled = true;
      }
    }
    if (!filled) return [];

    // 検索ボタン押下
    const btn = (await page
      .getByRole("button", { name: /検索|検索する/ })
      .count())
      ? page.getByRole("button", { name: /検索|検索する/ }).first()
      : page.locator('input[type="submit"]');
    if (await btn.count()) await btn.click({ timeout: 1500 });

    await page.waitForLoadState("networkidle", { timeout });
    const html = await page.content();
    return parseSearchHtml(html);
  } catch {
    return [];
  } finally {
    await page.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}
