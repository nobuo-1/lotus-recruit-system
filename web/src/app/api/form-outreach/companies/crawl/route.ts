// web/scripts/scrape-nta-corporates.ts
/**
 * 目的:
 *  - 国税庁「法人番号公表サイト」の検索結果ページを “住所キーワード” でクロール（※API未使用）
 *  - 会社名 / 法人番号 / 本店所在地 / 詳細ページURL を抽出
 *  - Supabase の nta_corporates_cache に upsert（tenant_id 付き）
 *
 * 使い方:
 *  node -r esbuild-register scripts/scrape-nta-corporates.ts --tenant <UUID> --pref 東京都 --city 渋谷区 --limit 500
 *
 * 備考:
 *  - 住所キーワードは「都道府県 + 市区町村 + 町丁名（丁目・マンション名除去）」の seed を利用。
 *  - 検索UIのクエリ仕様は公開されていないため、複数の候補パラメータを試すフォールバック実装。
 *  - 結果件数が少ない seed はスキップし、別 seed に回る。
 *  - サイト側構造変更に強いよう、詳細ページURL (/number/13桁) を主キーとして抽出。
 */

import "dotenv/config";
import path from "node:path";
import fs from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

// 生成済み seed を利用
import { NTA_TOWN_SEEDS } from "@/constants/ntaTownSeeds.generated";

type CacheRow = {
  tenant_id: string;
  corporate_number: string | null;
  company_name: string | null;
  address: string | null;
  detail_url: string | null;
  source: string | null;
  scraped_at: string | null;
};

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Supabase 環境変数が未設定です。");
  process.exit(1);
}

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)";
async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  ms = 15000
) {
  const ctl = new AbortController();
  const id = setTimeout(() => ctl.abort(), ms);
  try {
    return await fetch(url, {
      ...init,
      signal: ctl.signal,
      headers: {
        "user-agent": UA,
        ...(init.headers || {}),
      },
    });
  } finally {
    clearTimeout(id);
  }
}

/** 検索結果HTMLから 会社名・法人番号・住所・詳細URL を抽出 */
function parseSearchHtml(html: string) {
  const out: Array<{
    corporate_number: string | null;
    name: string | null;
    address: string | null;
    detail_url: string | null;
  }> = [];

  // 1) 詳細ページリンク /number/13digits を軸に抽出
  const linkRe = /href=["'](\/number\/(\d{13}))[#"']/g;
  let m: RegExpExecArray | null;
  const seen = new Set<string>();
  while ((m = linkRe.exec(html))) {
    const rel = m[1];
    const num = m[2];
    if (!rel || !num || seen.has(num)) continue;
    seen.add(num);

    // 付近テキストから会社名・住所を緩く抽出
    const ctxStart = Math.max(0, m.index - 1200);
    const ctxEnd = Math.min(html.length, m.index + 1200);
    const ctx = html.slice(ctxStart, ctxEnd).replace(/\s+/g, " ");

    // 会社名候補: リンク近傍の <strong> or 太字 or 「名称」「商号」ラベル
    let name: string | null =
      />(?:名称|商号|法人名)[^<]{0,10}<\/[^>]*>\s*<[^>]*>([^<]{2,120})<\//i
        .exec(ctx)?.[1]
        ?.trim() ||
      />\s*([^<]{2,120})\s*<\/a>/.exec(ctx)?.[1]?.trim() ||
      /<strong[^>]*>([^<]{2,180})<\/strong>/.exec(ctx)?.[1]?.trim() ||
      null;

    // 住所候補: 「本店」や「所在地」ラベル近傍
    const addr =
      /(所在地|本店|本社)[^<]{0,20}<\/[^>]*>\s*<[^>]*>([^<]{6,200})<\//i
        .exec(ctx)?.[2]
        ?.trim() ||
      /(所在地|本店|本社)[^\u4e00-\u9fafA-Za-z0-9]{0,5}([^<>{}]{6,200})/i
        .exec(ctx)?.[2]
        ?.trim() ||
      null;

    const detailUrl = new URL(
      rel,
      "https://www.houjin-bangou.nta.go.jp"
    ).toString();
    out.push({
      corporate_number: num,
      name: name || null,
      address: addr || null,
      detail_url: detailUrl,
    });
  }

  // 2) リンクが拾えなかった残差のための保険（法人番号の裸テキスト）
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

/** 国税庁の検索結果を、住所のテキストで叩いて結果を得る（フォールバックを多段で試す） */
async function crawlByAddressKeyword(keyword: string, page = 1) {
  const tries: string[] = [
    // 公式のクエリ仕様は非公開のため、既知の実装から安全そうな候補を複数試す
    `https://www.houjin-bangou.nta.go.jp/kensaku-kekka.html?searchString=${encodeURIComponent(
      keyword
    )}&page=${page}`,
    `https://www.houjin-bangou.nta.go.jp/kensaku-kekka.html?q=${encodeURIComponent(
      keyword
    )}&page=${page}`,
    `https://www.houjin-bangou.nta.go.jp/kensaku-kekka.html?name=&location=${encodeURIComponent(
      keyword
    )}&page=${page}`,
  ];

  for (const url of tries) {
    try {
      const r = await fetchWithTimeout(url, {}, 15000);
      if (!r.ok) continue;
      const html = await r.text();
      const rows = parseSearchHtml(html);
      if (rows.length) return rows;
    } catch {}
  }
  return [];
}

function pick<T>(arr: T[], n: number, seed: number) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = (seed + i) % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, n);
}

function prefecturesFromAddress(addr?: string | null): string[] {
  if (!addr) return [];
  const JP_PREFS = [
    "北海道",
    "青森県",
    "岩手県",
    "宮城県",
    "秋田県",
    "山形県",
    "福島県",
    "茨城県",
    "栃木県",
    "群馬県",
    "埼玉県",
    "千葉県",
    "東京都",
    "神奈川県",
    "新潟県",
    "富山県",
    "石川県",
    "福井県",
    "山梨県",
    "長野県",
    "岐阜県",
    "静岡県",
    "愛知県",
    "三重県",
    "滋賀県",
    "京都府",
    "大阪府",
    "兵庫県",
    "奈良県",
    "和歌山県",
    "鳥取県",
    "島根県",
    "岡山県",
    "広島県",
    "山口県",
    "徳島県",
    "香川県",
    "愛媛県",
    "高知県",
    "福岡県",
    "佐賀県",
    "長崎県",
    "熊本県",
    "大分県",
    "宮崎県",
    "鹿児島県",
    "沖縄県",
  ];
  const hit = JP_PREFS.filter((p) => addr.includes(p));
  return hit.slice(0, 2);
}

async function main() {
  // ---- 引数
  const argv = process.argv.slice(2);
  const getArg = (k: string, def = "") => {
    const i = argv.indexOf(k);
    return i >= 0 ? String(argv[i + 1] || "") : def;
  };

  const tenantId = getArg("--tenant");
  const pref = getArg("--pref"); // 例: 東京都
  const city = getArg("--city"); // 例: 渋谷区
  const limit = Math.max(50, Math.min(5000, Number(getArg("--limit", "800"))));

  if (!tenantId) {
    console.error("--tenant <UUID> は必須です");
    process.exit(1);
  }

  // ---- seed 生成
  const seeds: Array<{ pref: string; city: string; town: string }> = [];
  const prefKeys = pref ? [pref] : Object.keys(NTA_TOWN_SEEDS);
  for (const p of prefKeys) {
    const cityMap = NTA_TOWN_SEEDS[p] || {};
    const cityKeys = city ? [city] : Object.keys(cityMap);
    for (const c of cityKeys) {
      const towns = (cityMap[c] || []).filter(Boolean);
      for (const t of towns) seeds.push({ pref: p, city: c, town: t });
    }
  }
  if (!seeds.length) {
    console.error(
      "シードが見つかりません。generate-nta-town-seeds-from-postal.ts を実行してください。"
    );
    process.exit(1);
  }

  const admin: any = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  let inserted = 0;
  let tried = 0;
  const stamp = new Date().toISOString();

  // シャッフルして順に叩く
  const seedNum = Date.now();
  const bag = pick(
    seeds,
    Math.min(seeds.length, Math.ceil(limit / 10) * 5),
    seedNum
  );

  for (const s of bag) {
    if (inserted >= limit) break;
    tried++;
    const keyword = `${s.pref}${s.city}${s.town}`;

    // ページ送り：最大3ページ
    let rows: any[] = [];
    for (let page = 1; page <= 3 && rows.length < 120; page++) {
      const one = await crawlByAddressKeyword(keyword, page);
      if (!one.length) break;
      rows.push(...one);
      await delay(100);
    }

    // クリーニング→upsert
    if (!rows.length) continue;
    const payload: CacheRow[] = rows
      .map((r) => ({
        tenant_id: tenantId,
        corporate_number: r.corporate_number || null,
        company_name: r.name || null,
        address: r.address || null,
        detail_url: r.detail_url || null,
        source: "nta-crawl",
        scraped_at: stamp,
      }))
      .filter((x) => x.corporate_number && x.company_name);

    if (!payload.length) continue;

    const { error } = await admin
      .from("nta_corporates_cache")
      .upsert(payload as any, { onConflict: "tenant_id,corporate_number" });

    if (!error) {
      inserted += payload.length;
      process.stdout.write(
        `\r[${inserted}/${limit}] ${s.pref}${s.city}${s.town} (+${payload.length})   `
      );
    } else {
      console.warn("\nUpsert error:", error.message);
    }
    await delay(60);
  }

  console.log(`\nDone. seeds_tried=${tried}, inserted~=${inserted}`);
}

main().catch((e) => {
  console.error(e?.stack || e?.message || String(e));
  process.exit(1);
});
