// web/src/app/api/form-outreach/companies/crawl/route.ts
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30; // 504回避のため少し余裕

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { NTA_TOWN_SEEDS } from "@/constants/ntaTownSeeds.generated";

/** ========= Types ========= */
type Filters = { prefectures?: string[] };
type RawRow = {
  corporate_number: string; // 13桁
  name: string; // 商号又は名称（NOT NULL）
  address: string | null; // 所在地
  detail_url: string | null; // 変更履歴ページ（/henkorireki-johoto.html?selHouzinNo=...）
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

async function fetchWithTimeout(url: string, init: any = {}, ms = 7000) {
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

/** ========= 実サイト仕様に合わせて Cookie を事前取得 =========
 *  トップ + 結果ページに軽く当てて、Set-Cookie を収集して次リクエストに付与
 */
async function getSessionCookie(): Promise<string> {
  const pairs: string[] = [];

  const collect = (setCookieHeader: string | null) => {
    if (!setCookieHeader) return;
    const found = Array.from(
      setCookieHeader.matchAll(/(^|,)\s*([^=;,]+=[^;]+)/g)
    )
      .map((m) => (m[2] || "").trim())
      .filter(Boolean);
    for (const p of found) if (!pairs.includes(p)) pairs.push(p);
  };

  const top = await fetchWithTimeout(
    "https://www.houjin-bangou.nta.go.jp/",
    {},
    6000
  );
  collect(top.headers.get("set-cookie"));

  // 結果ページにも一度hitしてcookieを増やす
  const init = await fetchWithTimeout(
    "https://www.houjin-bangou.nta.go.jp/kensaku-kekka.html",
    {
      headers: { cookie: pairs.join("; ") },
    },
    6000
  );
  collect(init.headers.get("set-cookie"));

  return pairs.join("; ");
}

/** ========= 文字処理 ========= */
function strip(htmlFragment: string): string {
  return (htmlFragment || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function ensure(s?: string | null): string {
  return (s ?? "").toString();
}

/** ========= キーワード生成（pref/city/townの種から location に詰める） ========= */
function buildFastKeywords(filters: Filters, seedNum: number, take = 6) {
  const prefCand = filters.prefectures?.length
    ? filters.prefectures
    : ["東京都", "大阪府"];
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

/** ========= 実DOM構造準拠のパーサ =========
 *  <table class="fixed normal"> の <tbody> 内の <tr>を走査
 *  - 法人番号：<th scope="row"> に 13桁
 *  - 商号/名称：1つ目の <td>
 *  - 所在地：   2つ目の <td>
 */
function parseResultTableNTA(html: string): RawRow[] {
  const out: RawRow[] = [];

  // class順が入れ替わってもマッチ
  const tableRe =
    /<table[^>]*class=["'][^"']*(?:\bfixed\b[^"']*\bnormal\b|\bnormal\b[^"']*\bfixed\b)[^"']*["'][^>]*>([\s\S]*?)<\/table>/i;
  const m = tableRe.exec(html);
  if (!m) return out;
  const table = m[1];

  const rows = table.match(/<tr[\s\S]*?<\/tr>/gi) || [];
  for (const tr of rows) {
    // まず<TH>（法人番号用）を拾う
    const ths = tr.match(/<th[\s\S]*?<\/th>/gi) || [];
    const tds = tr.match(/<td[\s\S]*?<\/td>/gi) || [];
    if (!ths.length || tds.length < 2) continue;

    const numTxt = strip(ths[0] ?? "");
    const num = ((numTxt.match(/\b\d{13}\b/) || [])[0] || "").trim();

    const nameTxt = strip(tds[0] ?? "").slice(0, 200);
    const addrTxt = strip(tds[1] ?? "").slice(0, 300);

    if (/^\d{13}$/.test(num) && nameTxt) {
      // 検索後画面の「履歴等」はJSで /henkorireki-johoto.html?selHouzinNo=... を開く
      const detail = `https://www.houjin-bangou.nta.go.jp/henkorireki-johoto.html?selHouzinNo=${num}`;
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

/** ========= 1回の検索試行（location / searchString） =========
 *  公式UIはPOSTだが、GETクエリ（location= / searchString=）でも一覧HTMLが返る挙動があるためまずはGETで高速叩き。
 *  取得HTMLの署名（シグネチャ）も返す。
 */
async function crawlOnceWithCookie(
  keyword: string,
  page = 1,
  cookie = ""
): Promise<{
  rows: RawRow[];
  htmlSig: Record<string, boolean>;
  resultCount?: number;
}> {
  const tries = [
    `https://www.houjin-bangou.nta.go.jp/kensaku-kekka.html?location=${encodeURIComponent(
      keyword
    )}&page=${page}`,
    `https://www.houjin-bangou.nta.go.jp/kensaku-kekka.html?searchString=${encodeURIComponent(
      keyword
    )}&page=${page}`,
  ];

  let lastSig: Record<string, boolean> = {};
  let lastCount: number | undefined;

  for (const url of tries) {
    try {
      const r = await fetchWithTimeout(
        url,
        { headers: cookie ? { cookie } : {} },
        7000
      );
      if (!r.ok) continue;
      const html = await r.text();

      // 検索結果画面の要素に基づくシグネチャ
      lastSig = {
        hasResultTitle:
          /<title>検索結果一覧｜国税庁法人番号公表サイト<\/title>/.test(html),
        hasTableFixedNormal:
          /\btable\b[^>]*\bclass=["'][^"']*(fixed\s+normal|normal\s+fixed)[^"']*["']/.test(
            html
          ),
        hasPaginate: /<div class="paginate">/i.test(html),
        noindexNofollow:
          /<meta[^>]+name=["']robots["'][^>]+content=["']noindex,nofollow,noarchive["']/i.test(
            html
          ),
        jsRequiredNotice:
          /このサイトではJavascript機能をOnにしてご利用ください。/i.test(html),
      };

      // 件数（「<p class="srhResult"><strong>13,378</strong>件 見つかりました。」）
      const cm = /<p class="srhResult"><strong>([\d,]+)<\/strong>件/.exec(html);
      if (cm) lastCount = Number(cm[1].replace(/,/g, "") || "0");

      const rows = parseResultTableNTA(html);
      if (rows.length)
        return { rows, htmlSig: lastSig, resultCount: lastCount };
    } catch {
      // 次の手に回す
    }
  }
  return { rows: [], htmlSig: lastSig, resultCount: lastCount };
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
    const hops: number = clamp(body?.hops ?? 2, 0, 3); // 既定 2ページ
    const fast: boolean = body?.fast !== false; // true=高速（キーワード少なめ）

    trace.push(`want=${want} seed=${seedStr} hops=${hops} fast=${fast}`);

    // ---- Cookie先取り（重要）----
    const cookie = await getSessionCookie();

    // ---- キーワード（location）----
    const keywords = buildFastKeywords(filters, seedNum, fast ? 6 : 10);
    if (!keywords.length) {
      return NextResponse.json(
        {
          new_cache: 0,
          to_insert_count: 0,
          step: { a2_crawled: 0, a3_picked: 0, a4_filled: 0, a5_inserted: 0 },
          rows_preview: [],
          keywords_used: [],
          html_sig: {},
          trace,
        },
        { status: 200 }
      );
    }

    // ---- クロール（各キーワード 1..(1+hops)ページ）----
    const bag: RawRow[] = [];
    const keywords_used: string[] = [];
    let lastHtmlSig: Record<string, boolean> = {};
    let lastResultCount: number | undefined;

    // 1呼び出しあたりのHTTP上限（安定性優先）
    const MAX_TOTAL_HITS = Math.min(18, (1 + hops) * keywords.length);

    let hitCount = 0;
    for (const k of keywords) {
      keywords_used.push(k.keyword);
      for (let p = 1; p <= 1 + hops; p++) {
        const { rows, htmlSig, resultCount } = await crawlOnceWithCookie(
          k.keyword,
          p,
          cookie
        );
        lastHtmlSig = htmlSig;
        if (typeof resultCount === "number") lastResultCount = resultCount;

        for (const r of rows) {
          if (!/^\d{13}$/.test(r.corporate_number)) continue;
          if (!r.name) continue; // company_name NOT NULL 対応
          bag.push(r);
        }
        hitCount++;
        if (bag.length >= Math.max(80, want * 3)) break;
        if (hitCount >= MAX_TOTAL_HITS) break;
      }
      if (bag.length >= Math.max(80, want * 3)) break;
      if (hitCount >= MAX_TOTAL_HITS) break;
    }

    const a2_crawled = bag.length;

    // ---- 重複除去（corporate_number一意）----
    const map = new Map<string, RawRow>();
    for (const r of bag)
      if (!map.has(r.corporate_number)) map.set(r.corporate_number, r);
    const deduped = Array.from(map.values());
    const a3_picked = deduped.length;

    // ---- 詳細補完（今回スキップ：高速モード）----
    const a4_filled = 0;

    if (!deduped.length) {
      return NextResponse.json(
        {
          new_cache: 0,
          to_insert_count: 0,
          step: { a2_crawled, a3_picked, a4_filled, a5_inserted: 0 },
          rows_preview: [],
          keywords_used,
          html_sig: { ...lastHtmlSig, resultCount: lastResultCount },
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
          keywords_used,
          html_sig: { ...lastHtmlSig, resultCount: lastResultCount },
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
      .slice(0, want * 2) // 取り過ぎ防止
      .map((r) => ({
        tenant_id: tenantId,
        corporate_number: r.corporate_number,
        company_name: r.name, // 非NULL
        address: r.address ?? null,
        detail_url: r.detail_url ?? null, // 変更履歴ページ
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
            html_sig: { ...lastHtmlSig, resultCount: lastResultCount },
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
        html_sig: { ...lastHtmlSig, resultCount: lastResultCount },
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
