// web/src/app/api/form-outreach/companies/crawl/route.ts
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 15; // 504回避のため短め

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { NTA_TOWN_SEEDS } from "@/constants/ntaTownSeeds.generated";

/** ========= Types ========= */
type Filters = { prefectures?: string[] };
type RawRow = {
  corporate_number: string; // 13桁
  name: string; // 商号又は名称
  address: string | null; // 所在地
  detail_url: string | null;
};

/** ========= ENV ========= */
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

/** ========= HTTP helpers ========= */
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)";
const LANG = "ja-JP,ja;q=0.9";

function okUuid(s: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(s || "").trim()
  );
}
const clamp = (n: any, min: number, max: number) =>
  Math.max(min, Math.min(max, Math.floor(Number(n) || 0)));

async function fetchWithTimeout(url: string, init: any = {}, ms = 8000) {
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
        ...(init?.headers || {}),
      },
    });
  } finally {
    clearTimeout(id);
  }
}

/** ========= Keyword seeds（高速モード向けに少量） ========= */
function buildFastKeywords(filters: Filters, seedNum: number, take = 4) {
  const prefCand = (
    filters.prefectures?.length ? filters.prefectures : ["東京都", "大阪府"]
  ) // 既定は高密度地域
    .filter((p) => !!(NTA_TOWN_SEEDS as any)[p]);

  const pool: Array<{
    keyword: string;
    pref: string;
    city: string;
    town?: string;
  }> = [];

  for (const pref of prefCand) {
    const cityMap: Record<string, string[]> =
      (NTA_TOWN_SEEDS as any)[pref] || {};
    const cityList = Object.keys(cityMap);
    for (const city of cityList) {
      const towns: string[] = (cityMap[city] || []).filter(Boolean);
      if (towns.length) {
        const pickCount = Math.min(
          3,
          Math.max(1, Math.floor(towns.length / 20))
        );
        for (let i = 0; i < pickCount; i++) {
          const idx = (seedNum + i * 17) % towns.length;
          const town = normalizeTown(towns[idx] ?? "");
          pool.push({ keyword: `${pref}${city}${town}`, pref, city, town });
        }
      } else {
        pool.push({ keyword: `${pref}${city}`, pref, city });
      }
    }
  }
  return shuffle(pool, seedNum).slice(0, take);
}

function normalizeTown(t: string | undefined) {
  const s = (t ?? "")
    .replace(/\d+丁目?/g, "")
    .replace(/ビル|マンション|タワー|号館?|Annex|ANNEX/gi, "")
    .trim();
  return s;
}

function shuffle<T>(arr: T[], seed: number) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = (seed + i) % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** ========= HTML parse for <table class="fixed normal"> ========= */
function parseResultTable(html: string): RawRow[] {
  const out: RawRow[] = [];

  const tableMatch =
    /<table[^>]*class=["'][^"']*\bfixed\s+normal\b[^"']*["'][^>]*>([\s\S]*?)<\/table>/i.exec(
      html
    );
  if (!tableMatch) return out;
  const table = tableMatch[1];

  const rows: string[] = table.match(/<tr[\s\S]*?<\/tr>/gi) ?? [];
  for (const tr of rows) {
    // 明示的に string[] にして、indexing安全化
    const tds: string[] = tr.match(/<td[\s\S]*?<\/td>/gi) ?? [];
    if (tds.length < 3) continue;

    // ★ 修正: strip の引数を安全に（undefinedを渡さない & strip側でも防御）
    const numTxt = strip(tds[0]);
    const num = (numTxt.match(/\b\d{13}\b/) || [])[0] || "";

    const nameTxt = strip(tds[1]).slice(0, 200);
    const addrTxt = strip(tds[2]).slice(0, 300);

    if (/^\d{13}$/.test(num) && nameTxt) {
      const linkRel = /href=["'](\/number\/\d{13})["']/.exec(tr)?.[1] || null;
      const detail = linkRel
        ? new URL(linkRel, "https://www.houjin-bangou.nta.go.jp").toString()
        : null;
      out.push({
        corporate_number: num,
        name: nameTxt.trim(),
        address: addrTxt || null,
        detail_url: detail,
      });
    }
  }
  return out;
}

// ★ 修正: 引数を optional にして undefined を許容
function strip(fragment?: string): string {
  const f = fragment ?? "";
  return f
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** ========= 検索：フォーム指定に近い形で叩く ========= */
async function crawlOnce(keyword: string, page = 1) {
  const tries = [
    `https://www.houjin-bangou.nta.go.jp/kensaku-kekka.html?location=${encodeURIComponent(
      keyword
    )}&page=${page}`,
    `https://www.houjin-bangou.nta.go.jp/kensaku-kekka.html?searchString=${encodeURIComponent(
      keyword
    )}&page=${page}`,
  ];
  for (const url of tries) {
    try {
      const r = await fetchWithTimeout(url, {}, 8000);
      if (!r.ok) continue;
      const html = await r.text();
      const rows = parseResultTable(html);
      if (rows.length) return rows;
    } catch {
      // 次候補へ
    }
  }
  return [];
}

/** ========= Supabase ========= */
function getAdmin(): { sb: any; usingServiceRole: boolean } {
  if (!SUPABASE_URL) throw new Error("NEXT_PUBLIC_SUPABASE_URL is missing");
  if (SERVICE_ROLE)
    return {
      sb: createClient(SUPABASE_URL, SERVICE_ROLE) as any,
      usingServiceRole: true,
    };
  if (!ANON_KEY)
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_ANON_KEY are both missing"
    );
  return {
    sb: createClient(SUPABASE_URL, ANON_KEY) as any,
    usingServiceRole: false,
  };
}

/** ========= Handler ========= */
export async function POST(req: Request) {
  const trace: string[] = [];
  try {
    const tenantId = req.headers.get("x-tenant-id") || "";
    if (!tenantId || !okUuid(tenantId)) {
      return NextResponse.json(
        { error: "x-tenant-id required (uuid)", trace },
        { status: 400 }
      );
    }

    const body: any = await req.json().catch(() => ({}));
    const filters: Filters = body?.filters ?? {};
    const want: number = clamp(body?.want ?? 20, 1, 200);
    const seedStr: string = String(body?.seed || Math.random()).slice(2);
    const seedNum = Number((seedStr || "").replace(/\D/g, "")) || Date.now();
    const hops: number = clamp(body?.hops ?? 1, 0, 3);
    const fast: boolean = body?.fast !== false;

    trace.push(`want=${want} seed=${seedStr} hops=${hops} fast=${fast}`);

    // ---- キーワード（少量）----
    const keywords = buildFastKeywords(filters, seedNum, fast ? 4 : 8);
    if (!keywords.length) {
      return NextResponse.json(
        {
          new_cache: 0,
          to_insert_count: 0,
          step: { a2_crawled: 0, a3_picked: 0, a4_filled: 0, a5_inserted: 0 },
          rows_preview: [],
          keywords_used: [],
          trace,
        },
        { status: 200 }
      );
    }

    // ---- クロール（各キーワードで 1ページ + paginate hops）----
    const bag: RawRow[] = [];
    const keywords_used: string[] = [];
    for (const k of keywords) {
      keywords_used.push(k.keyword);
      for (let p = 1; p <= 1 + hops; p++) {
        const rows = await crawlOnce(k.keyword, p);
        for (const r of rows) {
          if (!/^\d{13}$/.test(r.corporate_number)) continue;
          if (!r.name) continue; // company_name NOT NULL 対応
          bag.push(r);
        }
        if (bag.length >= Math.max(80, want * 3)) break;
      }
      if (bag.length >= Math.max(80, want * 3)) break;
    }

    const a2_crawled = bag.length;

    // ---- 重複除去（corporate_number）----
    const map = new Map<string, RawRow>();
    for (const r of bag)
      if (!map.has(r.corporate_number)) map.set(r.corporate_number, r);
    const deduped = Array.from(map.values());
    const a3_picked = deduped.length;

    // ---- 詳細補完は高速モードではスキップ ----
    const a4_filled = 0;

    if (!deduped.length) {
      return NextResponse.json(
        {
          new_cache: 0,
          to_insert_count: 0,
          step: { a2_crawled, a3_picked, a4_filled, a5_inserted: 0 },
          rows_preview: [],
          keywords_used,
          trace,
        },
        { status: 200 }
      );
    }

    // ---- DB insert（SELECT→INSERTで重複回避）----
    const { sb, usingServiceRole } = getAdmin();
    const nums = deduped.map((r) => r.corporate_number);

    const { data: existedRows, error: exErr } = (sb as any)
      .from("nta_corporates_cache")
      .select("corporate_number")
      .eq("tenant_id", tenantId)
      .in("corporate_number", nums);

    if (exErr) {
      return NextResponse.json(
        {
          error: exErr.message,
          hint: "重複チェックに失敗",
          step: { a2_crawled, a3_picked, a4_filled, a5_inserted: 0 },
          trace,
        },
        { status: 500 }
      );
    }

    const existed = new Set<string>(
      (existedRows || []).map((r: any) => String(r.corporate_number))
    );
    const now = new Date().toISOString();
    const toInsert = deduped
      .filter((r) => !existed.has(r.corporate_number))
      .slice(0, want * 2)
      .map((r) => ({
        tenant_id: tenantId,
        corporate_number: r.corporate_number,
        company_name: r.name, // 非NULL
        address: r.address ?? null,
        detail_url: r.detail_url ?? null,
        source: "nta-crawl",
        scraped_at: now,
      }));

    let inserted_new = 0;
    if (toInsert.length) {
      const { data, error } = (sb as any)
        .from("nta_corporates_cache")
        .insert(toInsert)
        .select("corporate_number");
      if (error) {
        const rlsBlocked =
          !usingServiceRole &&
          /row-level security|permission denied|RLS/i.test(error.message || "");
        return NextResponse.json(
          {
            error: error.message,
            rls_blocked: rlsBlocked || undefined,
            hint: rlsBlocked
              ? "SUPABASE_SERVICE_ROLE_KEY をサーバに設定するか、RLSで匿名INSERTを許可してください。"
              : "権限/カラム制約を確認してください。",
            step: { a2_crawled, a3_picked, a4_filled, a5_inserted: 0 },
            keywords_used,
            trace,
          },
          { status: 500 }
        );
      }
      inserted_new = (data || []).length;
    }

    const rows_preview = deduped.slice(0, 12).map((r) => ({
      corporate_number: r.corporate_number,
      name: r.name,
      address: r.address,
      detail_url: r.detail_url,
    }));

    return NextResponse.json(
      {
        new_cache: inserted_new,
        to_insert_count: toInsert.length,
        step: { a2_crawled, a3_picked, a4_filled, a5_inserted: inserted_new },
        rows_preview,
        using_service_role: usingServiceRole,
        keywords_used,
        trace,
      },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { error: String(e?.message || e) },
      { status: 500 }
    );
  }
}
