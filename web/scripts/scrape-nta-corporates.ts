// web/scripts/scrape-nta-corporates.ts
//
// 都道府県→市区町村→町丁名（丁目なし）の粒度で
// 国税庁 法人番号公表サイトを Playwright で操作して
// 「法人番号 / 商号又は名称 / 所在地」を取得して JSONL に保存します。
// （NTA APIは未使用 / 将来切替予定）
//
// 使い方：
//   pnpm tsx scripts/scrape-nta-corporates.ts --pref "東京都" --city "渋谷区" --limit 20 --headful
//   DEBUG=1 pnpm tsx scripts/scrape-nta-corporates.ts --pref "東京都" --city "渋谷区" --limit 5
//
// 変更点：
// - CSS.escape 依存を排除
// - ラベル探索をやめ、<select> の option 内容を走査して目的のセレクトを特定
// - 町丁名も <select> があれば選択、なければ入力欄へ type
// - 検索フォームが iframe 内でも自動でフレームに入る
// - 抽出器の堅牢化、HTMLスナップショット出力（DEBUG=1）
//

import { chromium, Page, Frame } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { listSeedTowns } from "@/constants/ntaTownSeeds.generated";

type Cli = { pref: string; city: string; limit: number; headful: boolean };
function parseArgs(): Cli {
  const get = (k: string, d?: string) => {
    const i = process.argv.indexOf(`--${k}`);
    return i >= 0 ? process.argv[i + 1] : d;
  };
  const flag = (k: string) => process.argv.includes(`--${k}`);
  const pref = get("pref") || "";
  const city = get("city") || "";
  const limit = Number(get("limit", "150")) || 150;
  const headful = flag("headful");
  if (!pref || !city) {
    console.error(
      'Usage: tsx scripts/scrape-nta-corporates.ts --pref "<都道府県>" --city "<市区町村>" [--limit 150] [--headful]'
    );
    process.exit(1);
  }
  return { pref, city, limit, headful };
}

type CorporateRow = {
  corporate_number: string;
  name: string;
  address: string;
  pref: string;
  city: string;
  town_seed: string;
  source_url: string;
  scraped_at: string;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const outDir = path.resolve(__dirname, "../data/cache");
const tsIso = () => new Date().toISOString();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const DEBUG = process.env.DEBUG === "1";

function ensureDir(p: string) {
  fs.mkdirSync(p, { recursive: true });
}
function sanitizeTownSeed(town: string): string | null {
  const s = town.trim();
  if (!s) return null;
  if (/[()（）]|\d+階|地階|階層不明|次のビルを除く/.test(s)) return null;
  return s.replace(/\d+丁目?$/g, "").trim() || null;
}

// ============ Scope helpers (Page or Frame) ============
type Scope = Page | Frame;
async function resolveFormScope(page: Page): Promise<Scope> {
  // 1) 現在のページに <select> があればそのまま
  if (
    await page
      .locator("select")
      .count()
      .catch(() => 0)
  )
    return page;

  // 2) iframe を探索（src 内に 'search' / 'houjin' などを含むもの優先）
  const frames = page.frames();
  const prio = frames.find((f) =>
    /houjin|search|kensaku|result/i.test(f.url() || "")
  );
  if (prio) return prio;

  // 3) どれでも最初のサブフレーム
  const sub = frames.find((f) => f !== page.mainFrame());
  return sub || page;
}

// SELECT の中から「目的の option を含む」ものを見つける
async function findSelectHavingOption(scope: Scope, optionIncludes: string) {
  const selects = scope.locator("select");
  const count = await selects.count().catch(() => 0);
  for (let i = 0; i < count; i++) {
    const sel = selects.nth(i);
    const texts = await sel
      .locator("option")
      .allTextContents()
      .catch(() => []);
    if (texts.some((t) => t.trim().includes(optionIncludes))) {
      return sel;
    }
  }
  return null;
}

// 町丁名の入力欄 or セレクト候補を探す
async function findTownField(scope: Scope) {
  // まずは町丁の <select> を探す（city 選択後に動的追加されがち）
  const sel = await findSelectHavingOption(scope, "町");
  if (sel) return { type: "select" as const, el: sel };

  // プレースホルダやラベルから入力欄候補を拾う
  const inputs = scope.locator(
    'input, input[type="search"], input[type="text"]'
  );
  const n = await inputs.count().catch(() => 0);
  for (let i = 0; i < n; i++) {
    const el = inputs.nth(i);
    const ph = (await el.getAttribute("placeholder")) || "";
    const name = (await el.getAttribute("name")) || "";
    const aria = (await el.getAttribute("aria-label")) || "";
    const title = (await el.getAttribute("title")) || "";
    const id = (await el.getAttribute("id")) || "";
    const joined = `${ph} ${name} ${aria} ${title} ${id}`;
    if (/[町域|町名|町丁|町]/.test(joined)) {
      return { type: "input" as const, el };
    }
  }
  // 最後の保険：最初のテキスト入力
  if (n > 0) return { type: "input" as const, el: inputs.first() };
  return null;
}

async function findSearchButton(scope: Scope) {
  const btns = scope.locator(
    'button, input[type="submit"], a[role="button"], a'
  );
  const n = await btns.count().catch(() => 0);
  for (let i = 0; i < n; i++) {
    const el = btns.nth(i);
    const text = ((await el.innerText().catch(() => "")) || "").trim();
    const val = (await el.getAttribute("value")) || "";
    if (
      /検索|照会|表示|検索する|確定|この条件で/.test(text) ||
      /検索|照会|表示|確定/.test(val)
    ) {
      return el;
    }
  }
  return btns.first();
}

async function debugDump(scope: Scope, tag: string) {
  if (!DEBUG) return;
  const html = await scope.content().catch(() => "");
  const dumpDir = path.resolve(__dirname, "../data/debug");
  ensureDir(dumpDir);
  fs.writeFileSync(path.join(dumpDir, `dump_${tag}.html`), html, "utf8");
}

// ====== 検索結果抽出 ======
async function extractResults(
  scope: Scope,
  url: string
): Promise<CorporateRow[]> {
  const out: CorporateRow[] = [];

  // テーブル解析
  const tables = scope.locator("table");
  const tCount = await tables.count().catch(() => 0);
  for (let ti = 0; ti < tCount; ti++) {
    const t = tables.nth(ti);
    const head = ((await t.innerText().catch(() => "")) || "").replace(
      /\s+/g,
      ""
    );
    if (!/法人番号/.test(head) || !/商号又は名称/.test(head)) continue;

    const rows = t.locator("tr");
    const rCount = await rows.count().catch(() => 0);
    for (let ri = 1; ri < rCount; ri++) {
      const cells = rows.nth(ri).locator("th,td");
      const cCount = await cells.count().catch(() => 0);
      const cols: string[] = [];
      for (let ci = 0; ci < cCount; ci++) {
        cols.push(
          (
            (await cells
              .nth(ci)
              .innerText()
              .catch(() => "")) || ""
          ).trim()
        );
      }
      const joined = cols.join(" ").replace(/\s+/g, " ");
      const corporate_number = (joined.match(/\b\d{13}\b/) || [])[0] || "";
      let name =
        cols
          .find((c) => /商号又は名称/.test(c))
          ?.replace(/商号又は名称[:：]?\s*/g, "") ||
        cols.find((c) =>
          /(株式会社|合名会社|合資会社|合同会社|有限会社|社団|財団|学校|医療|社会福祉)/.test(
            c
          )
        ) ||
        "";
      let address =
        cols
          .find((c) => /所在地|住所/.test(c))
          ?.replace(/所在地[:：]?\s*|住所[:：]?\s*/g, "") || "";
      if (corporate_number && name) {
        out.push({
          corporate_number,
          name,
          address,
          pref: "",
          city: "",
          town_seed: "",
          source_url: url,
          scraped_at: tsIso(),
        });
      }
    }
    if (out.length) return out;
  }

  // カード/リスト保険
  const items = scope.locator("li, div");
  const iCount = await items.count().catch(() => 0);
  for (let i = 0; i < iCount; i++) {
    const el = items.nth(i);
    const txt = ((await el.innerText().catch(() => "")) || "").replace(
      /\s+/g,
      " "
    );
    const corporate_number = (txt.match(/\b\d{13}\b/) || [])[0] || "";
    if (!corporate_number) continue;
    const name =
      (txt.match(/(株式会社|合名会社|合資会社|合同会社|有限会社)[^\s　]+/) ||
        [])[0] || "";
    const address =
      (txt.match(/(東京都|北海道|(?:京都|大阪)府|..県)[^。;\n\r]+/) || [])[0] ||
      "";
    if (corporate_number && name) {
      out.push({
        corporate_number,
        name,
        address,
        pref: "",
        city: "",
        town_seed: "",
        source_url: url,
        scraped_at: tsIso(),
      });
    }
  }
  return out;
}

// ====== Supabase（任意） ======
async function upsertToSupabase(rows: CorporateRow[]) {
  const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!URL || !KEY) return;
  const sb = createClient(URL, KEY);
  const payload = rows.map((r) => ({
    corporate_number: r.corporate_number,
    name: r.name,
    address: r.address,
    pref: r.pref,
    city: r.city,
    town_seed: r.town_seed,
    source_url: r.source_url,
    scraped_at: r.scraped_at,
  }));
  const { error } = await sb.from("nta_corp_cache").upsert(payload, {
    onConflict: "corporate_number",
  });
  if (error) console.warn("[WARN] Supabase upsert failed:", error.message);
}

// ====== main ======
(async () => {
  const { pref, city, limit, headful } = parseArgs();
  ensureDir(outDir);

  console.log(`Start scrape: ${pref}/${city} -> limit=${limit}`);
  const outPath = path.join(outDir, `nta_${pref}_${city}_${Date.now()}.jsonl`);
  console.log(`Output: ${outPath}`);

  const towns = (listSeedTowns(pref, city) || [])
    .map(sanitizeTownSeed)
    .filter(Boolean) as string[];
  if (!towns.length) {
    console.error(
      `No town seeds for ${pref}/${city}. Check your generated seeds.`
    );
    process.exit(2);
  }

  const browser = await chromium.launch({
    headless: !headful,
    args: ["--disable-blink-features=AutomationControlled"],
  });
  const ctx = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome Safari/537.36",
    locale: "ja-JP",
    viewport: { width: 1366, height: 900 },
  });
  await ctx.addInitScript(() => {
    // @ts-ignore
    Object.defineProperty(navigator, "webdriver", { get: () => false });
  });
  const page = await ctx.newPage();

  // トップ → 検索フォームへ
  const baseUrl = "https://www.houjin-bangou.nta.go.jp/";
  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });

  // ① 直接フォームがあるか
  let scope: Scope = await resolveFormScope(page);
  await debugDump(scope, "landing");

  // ② 見つからなければ「検索」リンク/ボタンをクリックして遷移
  if (
    !(await scope
      .locator("select")
      .count()
      .catch(() => 0))
  ) {
    const link = page.locator("a", { hasText: /検索|法人番号|照会/ });
    if (await link.count().catch(() => 0)) {
      await link
        .first()
        .click({ timeout: 10_000 })
        .catch(() => {});
      await page
        .waitForLoadState("domcontentloaded", { timeout: 20_000 })
        .catch(() => {});
      scope = await resolveFormScope(page);
      await debugDump(scope, "after_click_search");
    } else {
      // 最後の保険：/search/ へ遷移（存在しなくても無害）
      await page
        .goto(baseUrl + "search/", {
          waitUntil: "domcontentloaded",
          timeout: 45_000,
        })
        .catch(() => {});
      scope = await resolveFormScope(page);
      await debugDump(scope, "after_direct_search");
    }
  }

  let total = 0;
  for (const town of towns) {
    if (total >= limit) break;

    try {
      // 毎周回、フォームのあるスコープを再解決（遷移で frame が変わる可能性）
      scope = await resolveFormScope(page);

      // 都道府県 select を option 内容で特定
      const selPref = await findSelectHavingOption(scope, pref);
      if (!selPref) throw new Error("都道府県 select が見つかりません");
      await selPref.selectOption({ label: pref }).catch(async () => {
        // 一部サイトは value=数字 のことがあるのでテキストで fallback
        const opts = await selPref.locator("option").allTextContents();
        const idx = opts.findIndex((t) => t.includes(pref));
        if (idx >= 0) {
          const val = await selPref
            .locator("option")
            .nth(idx)
            .getAttribute("value");
          if (val != null) await selPref.selectOption(val);
        }
      });

      // 市区町村 select（都道府県選択後に更新）
      await page.waitForTimeout(500);
      const selCity = await findSelectHavingOption(scope, city);
      if (!selCity) throw new Error("市区町村 select が見つかりません");
      await selCity.selectOption({ label: city }).catch(async () => {
        const opts = await selCity.locator("option").allTextContents();
        const idx = opts.findIndex((t) => t.includes(city));
        if (idx >= 0) {
          const val = await selCity
            .locator("option")
            .nth(idx)
            .getAttribute("value");
          if (val != null) await selCity.selectOption(val);
        }
      });

      // 町丁名：select があれば選択、なければ入力欄にタイプ
      await page.waitForTimeout(500);
      const townField = await findTownField(scope);
      if (!townField) throw new Error("町丁名の入力/選択欄が見つかりません");

      if (townField.type === "select") {
        // option 一覧から完全一致 or 前方一致で選ぶ
        const opts = await townField.el.locator("option").allTextContents();
        let idx = opts.findIndex((t) => t.trim() === town);
        if (idx < 0) idx = opts.findIndex((t) => t.trim().startsWith(town));
        if (idx >= 0) {
          const val = await townField.el
            .locator("option")
            .nth(idx)
            .getAttribute("value");
          if (val != null) await townField.el.selectOption(val);
        } else {
          // 入力欄 fallback がある場合に備えて入力も試す
          const anyInput = scope
            .locator('input, input[type="search"], input[type="text"]')
            .first();
          if (await anyInput.count().catch(() => 0)) {
            await anyInput.fill("");
            await anyInput.type(town, { delay: 15 });
          }
        }
      } else {
        await townField.el.fill("");
        await townField.el.type(town, { delay: 15 });
      }

      await debugDump(scope, `form_filled_${town}`);

      // 検索ボタン
      const btn = await findSearchButton(scope);
      await Promise.allSettled([
        btn.click({ timeout: 10_000 }),
        page.waitForLoadState("domcontentloaded", { timeout: 20_000 }),
      ]);
      await page.waitForTimeout(800);

      // 結果抽出
      let got = await extractResults(scope, page.url());
      if (!got.length) {
        await page.waitForTimeout(1000);
        got = await extractResults(scope, page.url());
      }

      if (got.length) {
        const stamped = got.map((r) => ({
          ...r,
          pref,
          city,
          town_seed: town,
          scraped_at: tsIso(),
        }));
        const lines = stamped.map((x) => JSON.stringify(x)).join("\n") + "\n";
        fs.appendFileSync(outPath, lines, "utf8");
        total += stamped.length;
        console.log(
          `[OK] ${pref}/${city}/${town}: +${stamped.length} (total=${total})`
        );
      } else {
        console.log(`[..] ${pref}/${city}/${town}: 0 result`);
      }

      if (total >= limit) break;
      await sleep(300 + Math.floor(Math.random() * 300));
    } catch (e: any) {
      console.warn(
        `[WARN] search failed ${pref}/${city}/${town}: ${e?.message || e}`
      );
      if (DEBUG) await debugDump(scope, `error_${pref}_${city}_${town}`);
    }
  }

  if (total) {
    const file = fs
      .readFileSync(outPath, "utf8")
      .trim()
      .split("\n")
      .filter(Boolean);
    const rows = file.map((l) => JSON.parse(l) as CorporateRow);
    await upsertToSupabase(rows).catch(() => {});
  }

  console.log(`Done. Collected = ${total}/${limit}`);
  await browser.close();
  process.exit(0);
})().catch(async (e) => {
  console.error("[FATAL]", e?.message || e);
  process.exit(1);
});
