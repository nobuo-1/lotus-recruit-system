/**
 * scripts/scrape-nta-corporates.ts
 *
 * 使い方:
 *   pnpm tsx scripts/scrape-nta-corporates.ts --pref "東京都" --city "渋谷区" --limit 200 --seed 123
 *
 * 概要:
 *  - 国税庁 Web-API v4（住所検索）を利用して、都道府県＋市区町村＋町丁名シードから法人候補を収集
 *  - 乱択 & 重複排除
 *  - Supabase の `nta_corporates_cache` に保存
 *    カラム: id(uuid/DB既定), tenant_id(null), corporate_number, company_name, address, detail_url(null可), source, scraped_at
 *
 * 必須環境変数:
 *  - NEXT_PUBLIC_SUPABASE_URL
 *  - SUPABASE_SERVICE_ROLE_KEY
 *  - NTA_CORP_API_KEY  … 国税庁 Web-API キー
 */

import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";

type CliArgs = {
  pref?: string;
  city?: string;
  limit: number;
  seed: string;
  outfile?: string;
};

type Candidate = {
  corporate_number: string;
  company_name: string;
  address: string | null;
  detail_url: string | null;
};

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SB_SVC = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const NTA_KEY = process.env.NTA_CORP_API_KEY || "";

if (!SB_URL || !SB_SVC) {
  console.error("[ERR] Supabase 環境変数が未設定です。");
  process.exit(1);
}
if (!NTA_KEY) {
  console.error("[ERR] NTA_CORP_API_KEY が未設定です。");
  process.exit(1);
}

function parseArgs(argv: string[]): CliArgs {
  const arg = (k: string) => {
    const i = argv.findIndex((x) => x === k);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const n = Number(arg("--limit") || "120");
  return {
    pref: arg("--pref"),
    city: arg("--city"),
    limit: Number.isFinite(n) && n > 0 ? Math.min(5000, Math.floor(n)) : 120,
    seed: String(arg("--seed") || Date.now()),
    outfile: arg("--outfile"),
  };
}

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

const SHIBUYA_TOWNS = [
  "宇田川町",
  "道玄坂",
  "円山町",
  "猿楽町",
  "恵比寿",
  "恵比寿西",
  "恵比寿南",
  "元代々木町",
  "広尾",
  "笹塚",
  "初台",
  "松濤",
  "上原",
  "神宮前",
  "神山町",
  "神泉町",
  "神南",
  "西原",
  "千駄ヶ谷",
  "代々木",
  "代々木神園町",
  "代官山町",
  "大山町",
  "東",
  "南平台町",
  "幡ヶ谷",
  "鉢山町",
  "富ヶ谷",
  "本町",
  "鶯谷町",
  "渋谷",
];

const MUNICIPALITY_SEEDS: Record<string, Record<string, string[]>> = {
  東京都: {
    渋谷区: SHIBUYA_TOWNS,
    新宿区: [
      "西新宿",
      "歌舞伎町",
      "四谷",
      "新小川町",
      "神楽坂",
      "高田馬場",
      "早稲田",
    ],
    港区: ["芝", "麻布", "六本木", "白金", "台場", "高輪", "赤坂", "青山"],
    // 必要に応じて増やす
  },
  大阪府: {
    大阪市北区: ["梅田", "堂島", "中之島", "曽根崎", "天神橋"],
    大阪市中央区: ["本町", "心斎橋", "難波", "内本町", "農人橋"],
  },
};

function randInt(max: number, seedN: number) {
  return Math.floor(seedN % max);
}

function shuffleInPlace<T>(arr: T[], seedN: number) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = (seedN + i) % (i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  ms = 12000
) {
  const ctl = new AbortController();
  const id = setTimeout(() => ctl.abort(), ms);
  try {
    return await fetch(url, {
      ...init,
      signal: ctl.signal,
      headers: {
        "user-agent":
          (init.headers as any)?.["user-agent"] ||
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });
  } finally {
    clearTimeout(id);
  }
}

function deepCollectCorporateLike(root: any): any[] {
  const out: any[] = [];
  const st = [root];
  while (st.length) {
    const cur = st.pop();
    if (!cur) continue;
    if (Array.isArray(cur)) {
      for (const v of cur) st.push(v);
      continue;
    }
    if (typeof cur === "object") {
      const keys = Object.keys(cur);
      const hasNum = keys.some((k) => /corporate[_]?number/i.test(k));
      const hasName = keys.some((k) => /(name|corporationName)/i.test(k));
      if (hasNum && hasName) out.push(cur);
      for (const k of keys) st.push(cur[k]);
    }
  }
  return out;
}

/** 国税庁 v4 住所検索（divide=1） */
async function ntaAddressSearch(
  address: string,
  take = 400
): Promise<Candidate[]> {
  const base = "https://api.houjin-bangou.nta.go.jp/4/address";
  // ※ API の細かい仕様差に備えて冗長に指定
  const qs = new URLSearchParams({
    id: NTA_KEY,
    address,
    type: "12", // 住所検索
    mode: "2", // 緩めの一致
    target: "1", // 現在情報
    divide: "1", // ページ分割あり（サーバ側都合で無視される可能性あり）
  });
  const url = `${base}?${qs.toString()}`;
  const r = await fetchWithTimeout(url);
  const txt = await r.text();
  if (!r.ok) {
    console.warn(
      `[WARN] NTA API error ${r.status} for "${address}": ${txt.slice(0, 150)}`
    );
    return [];
  }
  let j: any = {};
  try {
    j = JSON.parse(txt);
  } catch {
    return [];
  }
  const rows = deepCollectCorporateLike(j);
  const out: Candidate[] = rows
    .slice(0, take)
    .map((x) => {
      const num = String(
        x?.corporate_number ?? x?.corporateNumber ?? ""
      ).trim();
      const nm = String(x?.name ?? x?.corporationName ?? "").trim();
      const ad = String(x?.address ?? x?.location ?? "").trim() || null;
      return {
        corporate_number: num,
        company_name: nm,
        address: ad,
        detail_url: null,
      };
    })
    .filter((c) => c.corporate_number && c.company_name);
  return out;
}

async function main() {
  const args = parseArgs(process.argv);
  const pref = (args.pref || "").trim();
  const city = (args.city || "").trim();
  const limit = args.limit;
  const seedNum = Number(String(args.seed).replace(/\D/g, "")) || Date.now();

  if (!pref || !JP_PREFS.includes(pref)) {
    console.error(`[ERR] --pref は必須です（例: 東京都）`);
    process.exit(1);
  }

  const seedsByCity = MUNICIPALITY_SEEDS[pref] || {};
  const towns = city && seedsByCity[city] ? seedsByCity[city] : [];
  const seedTowns = towns.length ? towns.slice() : [city || pref];

  // 乱択で順序を変える
  shuffleInPlace(seedTowns, seedNum);

  console.log(
    `[INFO] Start scrape: ${pref}/${
      city || "(city unspecified)"
    } limit=${limit}`
  );
  const bag: Candidate[] = [];
  const seen = new Set<string>();

  // シードごとに収集（過剰呼び出しを避けるため控えめ）
  for (const t of seedTowns) {
    if (bag.length >= limit * 5) break;
    const addr = city
      ? `${pref}${city}${t.replace(/丁目.*/, "")}`
      : `${pref}${t}`;
    const rows = await ntaAddressSearch(addr, 600);
    for (const r of rows) {
      const k = `${r.corporate_number}__${r.company_name.toLowerCase()}`;
      if (!seen.has(k)) {
        seen.add(k);
        bag.push(r);
      }
    }
  }

  // 乱択して上限まで
  shuffleInPlace(bag, seedNum);
  const picks = bag.slice(0, limit);

  console.log(`[INFO] Collected raw=${bag.length}, unique=${picks.length}`);

  // Supabase 保存
  const sb = createClient(SB_URL, SB_SVC);
  const rows = picks.map((c) => ({
    tenant_id: null,
    corporate_number: c.corporate_number,
    company_name: c.company_name,
    address: c.address,
    detail_url: c.detail_url,
    source: `nta_api_v4_address:${pref}/${city || "-"}`,
    scraped_at: new Date().toISOString(),
  }));

  // `corporate_number` で upsert（同じ法人は上書き/更新）
  const { data, error } = await sb
    .from("nta_corporates_cache")
    .upsert(rows, { onConflict: "corporate_number" })
    .select("corporate_number");

  if (error) {
    console.error("[ERR] insert/upsert failed:", error.message);
    process.exit(1);
  }

  console.log(`[OK] Saved ${data?.length || 0} rows to nta_corporates_cache`);

  // 任意: JSONL にも書き出し（デバッグ用）
  if (args.outfile) {
    const file = path.resolve(args.outfile);
    const outdir = path.dirname(file);
    fs.mkdirSync(outdir, { recursive: true });
    const now = new Date().toISOString();
    const lines = picks
      .map((c) =>
        JSON.stringify({
          corporate_number: c.corporate_number,
          name: c.company_name,
          address: c.address || "",
          pref,
          city: city || "",
          source_url: "https://www.houjin-bangou.nta.go.jp/kensaku-kekka.html",
          scraped_at: now,
        })
      )
      .join("\n");
    fs.writeFileSync(file, lines);
    console.log(`[OK] Debug JSONL written: ${file}`);
  }
}

main().catch((e) => {
  console.error("[FATAL]", e?.message || e);
  process.exit(1);
});
