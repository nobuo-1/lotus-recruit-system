// web/src/app/api/form-outreach/companies/crawl/route.ts
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/** ========= Types ========= */
type Filters = { prefectures?: string[] }; // 例: ["東京都","大阪府"]
type RawRow = {
  corporate_number: string; // 13桁
  name: string; // 商号又は名称（NOT NULL）
  address: string | null; // 所在地
  detail_url: string | null; // 変更履歴ページ
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

/** ========= 共通ユーティリティ ========= */
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
    const j = (seed + i) % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** ========= 1) セッションCookie＋CSRFトークン取得 & 都道府県オプション抽出 ========= */
async function getSessionAndToken(): Promise<{
  cookie: string;
  tokenName: string;
  tokenValue: string;
  prefectures: PrefOpt[];
}> {
  const pairs: string[] = [];

  const collect = (setCookieHeader: string | null) => {
    if (!setCookieHeader) return;
    // 複数Set-Cookieヘッダをまとめて拾う
    const found = Array.from(
      setCookieHeader.matchAll(/(^|,)\s*([^=;,]+=[^;]+)/g)
    )
      .map((m) => (m[2] || "").trim())
      .filter(Boolean);
    for (const p of found) if (!pairs.includes(p)) pairs.push(p);
  };

  // トップページでCookieとトークンを得る
  const top = await fetchWithTimeout(
    "https://www.houjin-bangou.nta.go.jp/",
    {},
    7000
  );
  collect(top.headers.get("set-cookie"));
  const html = await top.text();

  // トークン名と値
  const tokenNameMatch = html.match(
    /name="([^"]*CNSFWTokenProcessor\.request\.token)"\s+value="([^"]+)"/
  );
  if (!tokenNameMatch) throw new Error("CSRF token not found");
  const tokenName = tokenNameMatch[1];
  const tokenValue = tokenNameMatch[2];

  // 都道府県 select のオプションを抽出（値=コード、テキスト=名称）
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

  return {
    cookie: pairs.join("; "),
    tokenName,
    tokenValue,
    prefectures,
  };
}

/** ========= 2) 市区町村リスト取得（/index.html?event=select, JSON） ========= */
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
      headers: {
        cookie,
        "content-type": "application/json",
      },
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

/** ========= 3) 検索本体 POST（/kensaku-kekka.html, form-urlencoded） ========= */
async function searchOnce(
  cookie: string,
  tokenName: string,
  tokenValue: string,
  prefCode: string,
  cityCode: string,
  page = 1,
  viewNum = 10
): Promise<{
  rows: RawRow[];
  htmlSig: Record<string, boolean>;
  resultCount?: number;
}> {
  const form = new URLSearchParams();
  form.set(tokenName, tokenValue);
  // 検索条件（実ページに合わせて必須最小限）
  form.set("houzinNmShTypeRbtn", "2"); // 部分一致
  form.set("houzinNmTxtf", ""); // 名称空
  form.set("houzinAddrShTypeRbtn", "1"); // 都道府県で検索
  form.set("prefectureLst", prefCode);
  form.set("cityLst", cityCode);
  form.set("tyoumeTxtf", ""); // 丁目番地空
  form.set("kokugaiTxtf", ""); // 国外空
  form.set("orderRbtn", "1"); // 商号等五十音順（昇順）
  form.set("closeCkbx", "1"); // 登記閉鎖等を含める
  form.set("historyCkbx", ""); // 変更履歴は既定OFF
  form.set("viewNumAnc", String(viewNum));
  form.set("viewPageNo", String(page));
  form.set("searchFlg", "1");

  const r = await fetchWithTimeout(
    "https://www.houjin-bangou.nta.go.jp/kensaku-kekka.html",
    {
      method: "POST",
      headers: {
        cookie,
        "content-type": "application/x-www-form-urlencoded",
      },
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

  // 件数
  const cm = /<p class="srhResult"><strong>([\d,]+)<\/strong>件/i.exec(html);
  const resultCount = cm ? Number((cm[1] || "0").replace(/,/g, "")) : undefined;

  return {
    rows: parseResultTable(html),
    htmlSig,
    resultCount,
  };
}

/** ========= 検索結果テーブルを実DOM仕様に合わせてパース ========= */
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
    const nameTxt = strip(tds[0] ?? "").slice(0, 200);
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

/** ========= Supabase 接続 ========= */
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
    const hops: number = clamp(body?.hops ?? 1, 0, 3);
    const seedStr: string = String(body?.seed || Math.random()).slice(2);
    const seedNum = Number((seedStr || "").replace(/\D/g, "")) || Date.now();

    trace.push(`want=${want} hops=${hops} seed=${seedStr}`);

    // 1) Cookie & Token & Pref一覧
    const { cookie, tokenName, tokenValue, prefectures } =
      await getSessionAndToken();
    trace.push(`pref_count=${prefectures.length}`);

    // フィルタに指定があれば優先、なければ東京都/大阪府
    const targetPrefNames =
      filters.prefectures && filters.prefectures.length
        ? filters.prefectures
        : ["東京都", "大阪府"];

    const targetPrefs = prefectures.filter((p) =>
      targetPrefNames.some((name) => p.name === name)
    );
    // 指定名がマッチしなければ、先頭から数件を使う
    const prefPool = targetPrefs.length ? targetPrefs : prefectures.slice(0, 3);

    // 2) Prefごとに City を取得
    const pickedCities: Array<{ pref: PrefOpt; city: CityOpt }> = [];
    for (const pref of prefPool) {
      const cities = await fetchCities(
        cookie,
        tokenName,
        tokenValue,
        pref.code
      );
      if (!cities.length) continue;
      const rnd = shuffle(cities, seedNum);
      // 取り過ぎない（高速にPDCA）
      for (const c of rnd.slice(0, 3)) pickedCities.push({ pref, city: c });
    }
    trace.push(`picked_pairs=${pickedCities.length}`);

    if (!pickedCities.length) {
      return NextResponse.json(
        {
          new_cache: 0,
          to_insert_count: 0,
          step: { a2_crawled: 0, a3_picked: 0, a4_filled: 0, a5_inserted: 0 },
          rows_preview: [],
          keywords_used: [], // 旧設計互換：今回はpref/cityペアなので空
          html_sig: {},
          trace,
        },
        { status: 200 }
      );
    }

    // 3) 検索POSTを実行（各Cityで 1..(1+hops)ページ）
    const bag: RawRow[] = [];
    let lastSig: Record<string, boolean> = {};
    let lastCount: number | undefined;

    // 上限（リクエストし過ぎで504にならないように）
    const MAX_HITS = Math.min(20, pickedCities.length * (1 + hops));
    let hits = 0;

    for (const pair of pickedCities) {
      for (let p = 1; p <= 1 + hops; p++) {
        const { rows, htmlSig, resultCount } = await searchOnce(
          cookie,
          tokenName,
          tokenValue,
          pair.pref.code,
          pair.city.code,
          p,
          10
        );
        lastSig = htmlSig;
        if (typeof resultCount === "number") lastCount = resultCount;

        for (const r of rows) {
          if (!/^\d{13}$/.test(r.corporate_number)) continue;
          if (!r.name) continue;
          bag.push(r);
        }
        hits++;
        if (bag.length >= Math.max(80, want * 3)) break;
        if (hits >= MAX_HITS) break;
      }
      if (bag.length >= Math.max(80, want * 3)) break;
      if (hits >= MAX_HITS) break;
    }

    const a2_crawled = bag.length;

    // 4) 重複除去
    const map = new Map<string, RawRow>();
    for (const r of bag)
      if (!map.has(r.corporate_number)) map.set(r.corporate_number, r);
    const deduped = Array.from(map.values());
    const a3_picked = deduped.length;
    const a4_filled = 0; // 高速モード：詳細補完なし

    if (!deduped.length) {
      return NextResponse.json(
        {
          new_cache: 0,
          to_insert_count: 0,
          step: { a2_crawled, a3_picked, a4_filled, a5_inserted: 0 },
          rows_preview: [],
          using_service_role: SERVICE_ROLE ? true : false,
          html_sig: { ...lastSig, resultCount: lastCount },
          trace,
        },
        { status: 200 }
      );
    }

    // 5) DB Insert（SELECT→INSERT）
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
          html_sig: { ...lastSig, resultCount: lastCount },
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
        company_name: r.name,
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
            html_sig: { ...lastSig, resultCount: lastCount },
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
