// web/src/app/api/form-outreach/companies/crawl/route.ts
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { NTA_TOWN_SEEDS } from "@/constants/ntaTownSeeds.generated";

/** ---------- Types ---------- */
type Filters = {
  prefectures?: string[];
  capital_min?: number | null;
  capital_max?: number | null;
  established_from?: string | null;
  established_to?: string | null;
  max?: number;
};

type CacheRow = {
  tenant_id: string;
  corporate_number: string | null;
  company_name: string | null;
  address: string | null;
  detail_url: string | null;
  source: string | null;
  scraped_at: string | null;
};

/** ---------- ENV ---------- */
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/** ---------- Tunables ---------- */
const HARD_BUDGET_MS = Number(process.env.FO_CRAWL_BUDGET_MS ?? 22_000);
const MAX_ADDR_KEYS = Number(process.env.FO_CRAWL_MAX_ADDR_KEYS ?? 4);
const MAX_PAGES_PER_KEY = Number(process.env.FO_CRAWL_MAX_PAGES ?? 2);

/** ---------- Utils ---------- */
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)";
const LANG = "ja-JP,ja;q=0.9";

function deadlineGuard(ms = HARD_BUDGET_MS) {
  const deadline = Date.now() + ms;
  return {
    left: () => deadline - Date.now(),
    ok: (reserve = 0) => Date.now() + reserve < deadline,
  };
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  ms = 10_000
): Promise<Response> {
  const ctl = new AbortController();
  const id = setTimeout(() => ctl.abort(), ms);
  try {
    return await fetch(url, {
      ...init,
      signal: ctl.signal,
      headers: {
        "user-agent": UA,
        "accept-language": LANG,
        referer: "https://www.houjin-bangou.nta.go.jp/",
        ...(init.headers || {}),
      },
    });
  } finally {
    clearTimeout(id);
  }
}

function pick<T>(arr: T[], n: number, seed: number): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = (seed + i) % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, n);
}

/** 住所キーワードプール（市/町をランダム化） */
const SPECIAL_TOWN_LEVEL: Record<string, string[]> = {
  東京都: ["渋谷区", "千代田区", "中央区", "港区", "新宿区", "世田谷区"],
  大阪府: ["大阪市中央区"],
};
function buildAddressKeywords(
  filters: Filters,
  seedNum: number
): Array<{ keyword: string; pref: string; city: string; town?: string }> {
  const out: Array<{
    keyword: string;
    pref: string;
    city: string;
    town?: string;
  }> = [];

  const prefPool: string[] = (
    filters.prefectures && filters.prefectures.length
      ? filters.prefectures
      : Object.keys(NTA_TOWN_SEEDS).filter((p) =>
          ["東京都", "大阪府"].includes(p)
        )
  ).filter((p) => !!NTA_TOWN_SEEDS[p]);

  for (const pref of prefPool) {
    const cityMap = NTA_TOWN_SEEDS[pref] || {};
    const cityList = Object.keys(cityMap);
    for (const city of cityList) {
      const isSpecial = (SPECIAL_TOWN_LEVEL[pref] || []).includes(city);
      if (isSpecial) {
        const towns = (cityMap[city] || []).filter(Boolean);
        for (const town of towns)
          out.push({ keyword: `${pref}${city}${town}`, pref, city, town });
      } else {
        out.push({ keyword: `${pref}${city}`, pref, city });
      }
    }
  }
  return pick(out, out.length, seedNum);
}

/** 検索結果HTML→（法人番号/名称/住所/詳細URL） */
function parseSearchHtml(html: string): Array<{
  corporate_number: string | null;
  name: string | null;
  address: string | null;
  detail_url: string | null;
}> {
  const out: Array<{
    corporate_number: string | null;
    name: string | null;
    address: string | null;
    detail_url: string | null;
  }> = [];
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

    const name =
      />(?:名称|商号|法人名)[^<]{0,10}<\/[^>]*>\s*<[^>]*>([^<]{2,160})<\//i
        .exec(ctx)?.[1]
        ?.trim() ||
      />\s*([^<]{2,160})\s*<\/a>/.exec(ctx)?.[1]?.trim() ||
      /<strong[^>]*>([^<]{2,160})<\/strong>/.exec(ctx)?.[1]?.trim() ||
      null;

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

async function crawlByAddressKeyword(keyword: string, page = 1) {
  const tries: string[] = [
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
      const r = await fetchWithTimeout(url, {}, 8_000);
      if (!r.ok) continue;
      const html = await r.text();
      const rows = parseSearchHtml(html);
      if (rows.length) return rows;
    } catch {}
  }
  return [];
}

/** 詳細ページ（/number/13桁）から名称・住所を補完 */
async function fetchDetailAndFill(row: {
  corporate_number: string;
  name: string | null;
  address: string | null;
  detail_url: string | null;
}) {
  if (!row.detail_url) return row;
  try {
    const r = await fetchWithTimeout(row.detail_url, {}, 8_000);
    if (!r.ok) return row;
    const html = await r.text();
    const name =
      /商号又は名称[^<]*<\/th>\s*<td[^>]*>([\s\S]{1,200}?)<\/td>/i
        .exec(html)?.[1]
        ?.replace(/<[^>]*>/g, " ")
        .trim() ||
      /<h1[^>]*>([\s\S]{1,200}?)<\/h1>/i
        .exec(html)?.[1]
        ?.replace(/<[^>]*>/g, " ")
        .trim() ||
      row.name;
    const addr =
      /(所在地|本店又は主たる事務所の所在地)[^<]*<\/th>\s*<td[^>]*>([\s\S]{1,300}?)<\/td>/i
        .exec(html)?.[2]
        ?.replace(/<[^>]*>/g, " ")
        .trim() || row.address;
    return { ...row, name: name || row.name, address: addr || row.address };
  } catch {
    return row;
  }
}

/** ---------- Handler: POST ---------- */
export async function POST(req: Request) {
  const trace: string[] = [];
  const budget = deadlineGuard();

  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json(
        { error: "Supabase service role not configured" },
        { status: 500 }
      );
    }
    const tenantId = req.headers.get("x-tenant-id") || "";
    if (!tenantId)
      return NextResponse.json(
        { error: "x-tenant-id required" },
        { status: 400 }
      );

    const body: any = await req.json().catch(() => ({}));
    const filters: Filters = body?.filters ?? {};
    const want: number = Math.max(
      1,
      Math.min(500, Math.floor(Number(body?.want) || 30))
    );
    const seed: string = String(body?.seed || Math.random()).slice(2);
    const seedNum = Number(seed.replace(/\D/g, "")) || Date.now();
    trace.push(`want=${want} seed=${seed} left=${budget.left()}ms`);

    const admin: any = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 既存（キャッシュの重複除去に使用）
    const { data: exCache, error: exCacheErr } = await admin
      .from("nta_corporates_cache")
      .select("corporate_number")
      .eq("tenant_id", tenantId)
      .not("corporate_number", "is", null);
    if (exCacheErr)
      return NextResponse.json({ error: exCacheErr.message }, { status: 500 });
    const existingCacheCorp = new Set(
      (exCache || [])
        .map((r: any) => String(r.corporate_number || "").trim())
        .filter(Boolean)
    );

    // キーワード
    let addrPool = buildAddressKeywords(filters, seedNum);
    addrPool = addrPool.slice(
      0,
      Math.max(1, Math.min(MAX_ADDR_KEYS, addrPool.length))
    );
    trace.push(`addrPool_used=${addrPool.length}`);

    let saved = 0;
    let triedSeeds = 0;
    const newRows: Array<Omit<CacheRow, "tenant_id" | "source">> = [];

    for (const k of addrPool) {
      if (!budget.ok(5_000)) break; // 稼働余裕がなければ打ち切り
      triedSeeds++;

      const rawRows: Array<{
        corporate_number: string;
        name: string | null;
        address: string | null;
        detail_url: string | null;
      }> = [];

      for (let page = 1; page <= MAX_PAGES_PER_KEY; page++) {
        if (!budget.ok(3_000)) break;
        const rows = await crawlByAddressKeyword(k.keyword, page);
        for (const r of rows) {
          const num = String(r.corporate_number || "").trim();
          if (!/^\d{13}$/.test(num)) continue;
          if (existingCacheCorp.has(num)) continue;
          rawRows.push({
            corporate_number: num,
            name: r.name || null,
            address: r.address || null,
            detail_url: r.detail_url || null,
          });
        }
        if (rawRows.length >= Math.max(want * 8, 200)) break;
      }

      // 詳細補完
      const DETAIL_CONC = 6;
      const filled: typeof rawRows = [];
      for (let i = 0; i < rawRows.length; i += DETAIL_CONC) {
        if (!budget.ok(2_000)) break;
        const chunk = rawRows.slice(i, i + DETAIL_CONC);
        const got = await Promise.all(chunk.map((r) => fetchDetailAndFill(r)));
        filled.push(...got);
        if (filled.length >= Math.max(want * 6, 150)) break;
      }

      // 新規だけpayload化
      const stamp = new Date().toISOString();
      const payload: CacheRow[] = [];
      for (const r of filled) {
        if (saved >= want) break;
        if (existingCacheCorp.has(r.corporate_number)) continue;
        existingCacheCorp.add(r.corporate_number);
        payload.push({
          tenant_id: tenantId,
          corporate_number: r.corporate_number,
          company_name: r.name ?? null,
          address: r.address ?? null,
          detail_url: r.detail_url ?? null,
          source: "nta-crawl",
          scraped_at: stamp,
        });
      }
      if (!payload.length) continue;

      if (!budget.ok(1_000)) break;
      const { data, error } = await admin
        .from("nta_corporates_cache")
        .upsert(payload as any, { onConflict: "tenant_id,corporate_number" })
        .select(
          "corporate_number, company_name, address, detail_url, scraped_at"
        );
      if (error) {
        trace.push(`cache_upsert_error: ${error.message}`);
        continue;
      }
      const returned = (data || []) as Array<{
        corporate_number: string;
        company_name: string | null;
        address: string | null;
        detail_url: string | null;
        scraped_at: string | null;
      }>;

      // ここでは「新規」をsavedとしてカウント（existingCacheCorpに入れる前にフィルタ済）
      saved += returned.length;
      newRows.push(...returned);
      trace.push(
        `seed=${k.keyword} +${returned.length} saved=${saved}/${want}`
      );

      if (saved >= want) break;
    }

    return NextResponse.json({
      tried_seeds: triedSeeds,
      new_cache: saved,
      rows: newRows, // 新規で入った分のみ
      trace,
    });
  } catch (e: unknown) {
    const msg = (e as Error)?.message || String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
