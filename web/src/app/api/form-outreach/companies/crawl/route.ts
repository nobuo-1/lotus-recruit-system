// web/src/app/api/form-outreach/companies/crawl/route.ts
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/** ========= Types ========= */
type Filters = { prefectures?: string[] };
type RawRow = {
  corporate_number: string;
  name: string;
  address: string | null;
  detail_url: string | null;
};
type PrefOpt = { code: string; name: string };
type CityOpt = { code: string; name: string };

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

/** ========= Utils ========= */
function strip(fragment: string) {
  return (fragment || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function shuffle<T>(arr: T[], seed: number) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = (seed + i * 9301 + 49297) % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function range(n: number) {
  return Array.from({ length: n }, (_, i) => i + 1);
}

/** ========= 1) Cookie/Token/Pref ========= */
async function getSessionAndToken(): Promise<{
  cookie: string;
  tokenName: string;
  tokenValue: string;
  prefectures: PrefOpt[];
}> {
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
    7000
  );
  collect(top.headers.get("set-cookie"));
  const html = await top.text();

  const tokenNameMatch = html.match(
    /name="([^"]*CNSFWTokenProcessor\.request\.token)"\s+value="([^"]+)"/
  );
  if (!tokenNameMatch) throw new Error("CSRF token not found");
  const tokenName = tokenNameMatch[1];
  const tokenValue = tokenNameMatch[2];

  const prefBlockMatch = html.match(
    /<select[^>]+id=["']addr_pref["'][\s\S]*?<\/select>/i
  );
  const prefectures: PrefOpt[] = [];
  if (prefBlockMatch) {
    const optRe = /<option\s+value="([^"]*)"\s*>([^<]+)<\/option>/gi;
    let m: RegExpExecArray | null;
    while ((m = optRe.exec(prefBlockMatch[0]))) {
      const code = (m[1] || "").trim();
      const name = strip(m[2] || "");
      if (code && name && code !== "99" && code !== "") {
        prefectures.push({ code, name });
      }
    }
  }
  return { cookie: pairs.join("; "), tokenName, tokenValue, prefectures };
}

/** ========= 2) City list ========= */
async function fetchCities(
  cookie: string,
  tokenName: string,
  tokenValue: string,
  prefCode: string
): Promise<CityOpt[]> {
  const body = JSON.stringify({
    [tokenName]: tokenValue,
    prefectureLst: prefCode,
  });
  const r = await fetchWithTimeout(
    "https://www.houjin-bangou.nta.go.jp/index.html?event=select",
    {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body,
    },
    8000
  );
  if (!r.ok) return [];
  const j = await r.json().catch(() => ({}));
  const list: any[] = Array.isArray(j?.cityInfLst) ? j.cityInfLst : [];
  const out: CityOpt[] = [];
  for (const it of list) {
    const code = String(it?.code ?? "").trim();
    const name = String(it?.name ?? "").trim();
    if (code && name) out.push({ code, name });
  }
  return out;
}

/** ========= 3) POST search ========= */
async function searchOnce(
  cookie: string,
  tokenName: string,
  tokenValue: string,
  prefCode: string,
  cityCode: string,
  page: number,
  viewNum: number,
  order: number
): Promise<{
  rows: RawRow[];
  htmlSig: Record<string, boolean>;
  resultCount?: number;
}> {
  const form = new URLSearchParams();
  form.set(tokenName, tokenValue);
  form.set("houzinNmShTypeRbtn", "2"); // 名称: 部分一致
  form.set("houzinNmTxtf", "");
  form.set("houzinAddrShTypeRbtn", "1"); // 所在地: 都道府県
  form.set("prefectureLst", prefCode);
  form.set("cityLst", cityCode);
  form.set("tyoumeTxtf", "");
  form.set("kokugaiTxtf", "");
  form.set("orderRbtn", String(order)); // ★ ランダム順序
  form.set("closeCkbx", "1");
  form.set("historyCkbx", "");
  form.set("viewNumAnc", String(viewNum));
  form.set("viewPageNo", String(page));
  form.set("searchFlg", "1");

  const r = await fetchWithTimeout(
    "https://www.houjin-bangou.nta.go.jp/kensaku-kekka.html",
    {
      method: "POST",
      headers: { cookie, "content-type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    },
    10000
  );
  if (!r.ok) return { rows: [], htmlSig: {} };
  const html = await r.text();

  const htmlSig = {
    hasResultTitle:
      /<title>検索結果一覧｜国税庁法人番号公表サイト<\/title>/.test(html),
    hasTableFixedNormal:
      /<table[^>]*class=["'][^"']*(?:\bfixed\b[^"']*\bnormal\b|\bnormal\b[^"']*\bfixed\b)[^"']*["'][^>]*>/i.test(
        html
      ),
    hasPaginate: /<div class="paginate">/i.test(html),
    robotsNoindex:
      /<meta[^>]+name=["']robots["'][^>]+content=["']noindex,nofollow,noarchive["']/i.test(
        html
      ),
  };
  const cm = /<p class="srhResult"><strong>([\d,]+)<\/strong>件/i.exec(html);
  const resultCount = cm ? Number((cm[1] || "0").replace(/,/g, "")) : undefined;

  return { rows: parseResultTable(html), htmlSig, resultCount };
}

/** ========= parse (フリガナ除去対応) ========= */
function parseResultTable(html: string): RawRow[] {
  const out: RawRow[] = [];
  const tableMatch =
    /<table[^>]*class=["'][^"']*(?:\bfixed\b[^"']*\bnormal\b|\bnormal\b[^"']*\bfixed\b)[^"']*["'][^>]*>([\s\S]*?)<\/table>/i.exec(
      html
    );
  if (!tableMatch) return out;
  const table = tableMatch[1];

  const rows = table.match(/<tr[\s\S]*?<\/tr>/gi) || [];
  for (const tr of rows) {
    const ths = tr.match(/<th[\s\S]*?<\/th>/gi) || [];
    const tds = tr.match(/<td[\s\S]*?<\/td>/gi) || [];
    if (!ths.length || tds.length < 2) continue;

    const numTxt = strip(ths[0] ?? "");
    const num = ((numTxt.match(/\b\d{13}\b/) || [])[0] || "").trim();

    // ★ フリガナ(div.furigana...) を nameセルから除去してからstrip
    const nameCellHtml = (tds[0] ?? "").replace(
      /<div[^>]*class=["'][^"']*\bfurigana\b[^"']*["'][^>]*>[\s\S]*?<\/div>/gi,
      ""
    );
    const nameTxt = strip(nameCellHtml).slice(0, 200);

    const addrTxt = strip(tds[1] ?? "").slice(0, 300);

    if (/^\d{13}$/.test(num) && nameTxt) {
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
      "SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_ANON_KEY missing"
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
    const hops: number = clamp(body?.hops ?? 1, 0, 3);
    const seedStr: string = String(body?.seed || Math.random()).slice(2);
    const seedNum = Number((seedStr || "").replace(/\D/g, "")) || Date.now();
    trace.push(`want=${want} hops=${hops} seed=${seedStr}`);

    const { cookie, tokenName, tokenValue, prefectures } =
      await getSessionAndToken();
    trace.push(`pref_count=${prefectures.length}`);

    // ★ 都道府県ランダム選定（フィルタがあればその中からランダム、無ければ全体から）
    const prefCandidates =
      filters.prefectures && filters.prefectures.length
        ? prefectures.filter((p) => filters.prefectures!.includes(p.name))
        : prefectures;
    const prefPool = shuffle(prefCandidates, seedNum).slice(
      0,
      Math.min(6, prefCandidates.length || 3)
    );

    const pickedCities: Array<{ pref: PrefOpt; city: CityOpt }> = [];
    for (const [idx, pref] of prefPool.entries()) {
      const cities = await fetchCities(
        cookie,
        tokenName,
        tokenValue,
        pref.code
      );
      if (!cities.length) continue;
      // 都市もランダムに1〜3件
      for (const c of shuffle(cities, seedNum + idx * 101).slice(0, 3)) {
        pickedCities.push({ pref, city: c });
      }
    }
    trace.push(`picked_pairs=${pickedCities.length}`);

    if (!pickedCities.length) {
      return NextResponse.json(
        {
          new_cache: 0,
          to_insert_count: 0,
          step: { a2_crawled: 0, a3_picked: 0, a4_filled: 0, a5_inserted: 0 },
          rows_preview: [],
          keywords_used: [],
          html_sig: {},
          trace,
          using_service_role: !!SERVICE_ROLE,
        },
        { status: 200 }
      );
    }

    const bag: RawRow[] = [];
    let lastSig: Record<string, any> = {};
    let lastCount: number | undefined;

    const VIEW_NUM = 10;

    // ★ ランダム順序（1:昇順, 2:降順, 3:所在地順, 4:法人番号順）
    const ORDERS = [1, 2, 3, 4];

    for (const [i, pair] of pickedCities.entries()) {
      const order = ORDERS[(seedNum + i) % ORDERS.length];

      // まず1回叩いて件数を把握
      const pre = await searchOnce(
        cookie,
        tokenName,
        tokenValue,
        pair.pref.code,
        pair.city.code,
        1,
        VIEW_NUM,
        order
      );
      lastSig = pre.htmlSig;
      if (typeof pre.resultCount === "number") lastCount = pre.resultCount;
      for (const r of pre.rows) {
        if (/^\d{13}$/.test(r.corporate_number) && r.name) bag.push(r);
      }

      // 総ページ数→ランダムページ選定
      const totalPages =
        typeof pre.resultCount === "number" && pre.resultCount > 0
          ? Math.ceil(pre.resultCount / VIEW_NUM)
          : 1;

      const pages = shuffle(range(totalPages), seedNum + i * 13)
        .slice(0, Math.max(1, 1 + hops))
        .sort((a, b) => a - b); // （順不同でも良い）

      // 既に1ページ目は取得済みなので省く
      const uniquePages = Array.from(new Set(pages.filter((p) => p !== 1)));

      for (const p of uniquePages) {
        const { rows, htmlSig, resultCount } = await searchOnce(
          cookie,
          tokenName,
          tokenValue,
          pair.pref.code,
          pair.city.code,
          p,
          VIEW_NUM,
          order
        );
        lastSig = htmlSig;
        if (typeof resultCount === "number") lastCount = resultCount;
        for (const r of rows) {
          if (!/^\d{13}$/.test(r.corporate_number)) continue;
          if (!r.name) continue;
          bag.push(r);
        }
        if (bag.length >= Math.max(80, want * 3)) break;
      }
      if (bag.length >= Math.max(80, want * 3)) break;
    }

    const a2_crawled = bag.length;
    const map = new Map<string, RawRow>();
    for (const r of bag)
      if (!map.has(r.corporate_number)) map.set(r.corporate_number, r);
    const deduped = Array.from(map.values());
    const a3_picked = deduped.length;
    const a4_filled = 0;

    const rows_preview = deduped.slice(0, 12).map((r) => ({
      corporate_number: r.corporate_number,
      name: r.name,
      address: r.address,
      detail_url: r.detail_url,
    }));

    const { sb, usingServiceRole } = getAdmin();
    let inserted_new = 0;
    let rlsWarning: string | undefined;
    let toInsert: any[] = [];

    if (deduped.length) {
      const nums = deduped.map((r) => r.corporate_number);

      const { data: existedRows, error: exErr } = await (sb as any)
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
            html_sig: { ...lastSig, resultCount: lastCount },
            trace,
            using_service_role: usingServiceRole,
          },
          { status: 500 }
        );
      }

      const existed = new Set<string>(
        (existedRows || []).map((r: any) => String(r.corporate_number))
      );
      const now = new Date().toISOString();
      toInsert = deduped
        .filter((r) => !existed.has(r.corporate_number))
        .slice(0, want * 2)
        .map((r) => ({
          tenant_id: tenantId,
          corporate_number: r.corporate_number,
          company_name: r.name, // ★ フリガナ無しの正式名称のみ
          address: r.address ?? null,
          detail_url: r.detail_url ?? null,
          source: "nta-crawl",
          scraped_at: now,
        }));

      if (toInsert.length) {
        const tryUpsert = async () => {
          const { data, error } = await (sb as any)
            .from("nta_corporates_cache")
            .upsert(toInsert, {
              onConflict: "tenant_id,corporate_number",
              ignoreDuplicates: true,
            })
            .select("corporate_number");
          return { data, error };
        };

        let { data, error } = await tryUpsert();

        if (error && /no unique|ON CONFLICT/i.test(error.message || "")) {
          const ins = await (sb as any)
            .from("nta_corporates_cache")
            .insert(toInsert)
            .select("corporate_number");
          data = ins.data;
          error = ins.error;
        }

        if (error) {
          const rlsBlocked = /row-level security|permission denied|RLS/i.test(
            error.message || ""
          );
          return NextResponse.json(
            {
              error: error.message,
              rls_blocked: rlsBlocked || undefined,
              hint: rlsBlocked
                ? "RLSによりINSERTが拒否。SERVICE_ROLE か RLS緩和を設定してください。"
                : "テーブルのユニーク制約/権限/制約を確認してください。",
              step: { a2_crawled, a3_picked, a4_filled, a5_inserted: 0 },
              html_sig: { ...lastSig, resultCount: lastCount },
              trace,
              using_service_role: usingServiceRole,
            },
            { status: 500 }
          );
        }

        inserted_new = Array.isArray(data) ? data.length : 0;

        if (!usingServiceRole && toInsert.length > 0 && inserted_new === 0) {
          rlsWarning =
            "新規候補は検出されましたが保存できませんでした。RLSにより匿名INSERT拒否の可能性。SERVICE_ROLEの設定を推奨。";
        }
      }
    }

    return NextResponse.json(
      {
        new_cache: inserted_new,
        to_insert_count: toInsert.length,
        step: { a2_crawled, a3_picked, a4_filled, a5_inserted: inserted_new },
        rows_preview,
        using_service_role: usingServiceRole,
        html_sig: { ...lastSig, resultCount: lastCount },
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
