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
  "Mozilla/5.0 (Windows NT 10.0; Win32; x32) AppleWebKit/537.36 (KHTML, like Gecko) Safari/537.36";
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
    seed = (seed * 9301 + 49297) % 233280;
    const r = seed / 233280;
    const j = Math.floor(r * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
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
  page = 1,
  viewNum = 10,
  town?: string | ""
): Promise<{
  rows: RawRow[];
  htmlSig: Record<string, boolean>;
  resultCount?: number;
}> {
  const form = new URLSearchParams();
  form.set(tokenName, tokenValue);
  form.set("houzinNmShTypeRbtn", "2");
  form.set("houzinNmTxtf", "");
  form.set("houzinAddrShTypeRbtn", "1");
  form.set("prefectureLst", prefCode);
  form.set("cityLst", cityCode);
  form.set("tyoumeTxtf", town || ""); // ← 指定区は丁目まで
  form.set("kokugaiTxtf", "");
  form.set("orderRbtn", "1");
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

/** ========= parse ========= */
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

    const nameCell = (tds[0] || "").replace(
      /<div[^>]*class=["']?furigana["']?[^>]*>[\s\S]*?<\/div>/gi,
      ""
    );
    const nameTxt = strip(nameCell).slice(0, 200);

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
function getAdmin(): {
  sb: any;
  usingServiceRole: boolean;
  project_ref: string | null;
  db_url_host: string | null;
} {
  if (!SUPABASE_URL) throw new Error("NEXT_PUBLIC_SUPABASE_URL is missing");
  const url = new URL(SUPABASE_URL);
  const host = url.host || null;
  const projectRef = host?.split(".")[0] || null;

  if (SERVICE_ROLE)
    return {
      sb: createClient(SUPABASE_URL, SERVICE_ROLE) as any,
      usingServiceRole: true,
      project_ref: projectRef,
      db_url_host: host,
    };
  if (!ANON_KEY)
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_ANON_KEY missing"
    );
  return {
    sb: createClient(SUPABASE_URL, ANON_KEY) as any,
    usingServiceRole: false,
    project_ref: projectRef,
    db_url_host: host,
  };
}

/** ==== 住所から簡易“市区町村キー”抽出（偏り抑制用） ==== */
function municipalityKey(addr?: string | null): string {
  if (!addr) return "unknown";
  const s = String(addr).replace(/\s/g, "");
  // 「都/道/府/県」以降〜最初の「市/区/郡…（町/村/区/市）」まで
  const m =
    s.match(/^(?:.+?[都道府県])(.+?(?:市|区|郡.+?(?:町|村|区|市)?))/) ||
    s.match(/^(?:.+?[都道府県])(.+?)(?:\d|丁目|番|号)/);
  return m ? m[0] : s.slice(0, 10);
}

/** 指定区は“丁目”を入れる */
function needTown(prefName: string, cityName: string): boolean {
  const wards = [
    "港区",
    "千代田区",
    "中央区",
    "新宿区",
    "渋谷区",
    "大阪市北区",
    "大阪市中央区",
  ];
  return wards.some((w) => cityName.includes(w));
}
function pickTown(seed: number) {
  const choices = ["1丁目", "2丁目", "3丁目"];
  const idx = Math.abs(seed) % choices.length;
  return choices[idx];
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
    let seedNum = Number((seedStr || "").replace(/\D/g, "")) || Date.now();
    trace.push(`want=${want} hops=${hops} seed=${seedStr}`);

    const { cookie, tokenName, tokenValue, prefectures } =
      await getSessionAndToken();
    trace.push(`pref_count=${prefectures.length}`);

    // --- 対象都道府県の決定（従来の挙動を維持しつつ、ランダムサンプル） ---
    const specifiedPrefNames = Array.isArray(filters.prefectures)
      ? filters.prefectures.filter(Boolean)
      : [];
    const poolAll = prefectures.slice();
    let prefPool =
      specifiedPrefNames.length > 0
        ? poolAll.filter((p) => specifiedPrefNames.includes(p.name))
        : shuffle(poolAll, seedNum).slice(0, 8);

    // --- 各都道府県からランダムに市区町村を抽出（均等にばらす） ---
    const pickedCities: Array<{ pref: PrefOpt; city: CityOpt; town?: string }> =
      [];
    const CITIES_PER_PREF = 3;
    for (const pref of prefPool) {
      const cities = await fetchCities(
        cookie,
        tokenName,
        tokenValue,
        pref.code
      );
      if (!cities.length) continue;
      const chosen = shuffle(cities, (seedNum += 17)).slice(0, CITIES_PER_PREF);
      for (const c of chosen) {
        const town = needTown(pref.name, c.name)
          ? pickTown((seedNum += 31))
          : "";
        pickedCities.push({ pref, city: c, town });
      }
    }
    trace.push(`picked_pairs=${pickedCities.length}`);

    if (!pickedCities.length) {
      const { sb, usingServiceRole, project_ref, db_url_host } = getAdmin();
      const probe = await (sb as any)
        .from("nta_corporates_cache")
        .select("corporate_number", { count: "exact", head: true })
        .limit(1);
      const db_probe_found = Number(probe?.count ?? 0);

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
          project_ref,
          db_url_host,
          db_probe_found,
        },
        { status: 200 }
      );
    }

    const bag: RawRow[] = [];
    let lastSig: Record<string, any> = {};
    let lastCount: number | undefined;

    const VIEW_NUM = 10;
    const PAGES_PER_CITY = Math.min(5, 1 + hops * 2);
    const CITY_LIMIT = Math.max(5, Math.floor(want / 4));

    for (const pair of shuffle(pickedCities, (seedNum += 97)).slice(
      0,
      CITY_LIMIT
    )) {
      // 1ページ目
      const first = await searchOnce(
        cookie,
        tokenName,
        tokenValue,
        pair.pref.code,
        pair.city.code,
        1,
        VIEW_NUM,
        pair.town
      );
      lastSig = first.htmlSig;
      if (typeof first.resultCount === "number") lastCount = first.resultCount;

      // ★行順ランダム
      for (const r of shuffle(first.rows, (seedNum += 7)))
        if (/^\d{13}$/.test(r.corporate_number)) bag.push(r);

      // 総ページ
      const totalPages = Math.max(
        1,
        Math.min(100, Math.ceil((lastCount || 0) / VIEW_NUM))
      );

      // ランダム他ページ
      const visited = new Set<number>([1]);
      for (let k = 0; k < PAGES_PER_CITY - 1; k++) {
        if (bag.length >= Math.max(80, want * 3)) break;
        const rnd = 2 + ((seedNum += 131) % Math.max(1, totalPages - 1));
        if (visited.has(rnd)) continue;
        visited.add(rnd);

        const { rows, htmlSig } = await searchOnce(
          cookie,
          tokenName,
          tokenValue,
          pair.pref.code,
          pair.city.code,
          rnd,
          VIEW_NUM,
          pair.town
        );
        lastSig = htmlSig;
        for (const r of shuffle(rows, (seedNum += 11)))
          if (/^\d{13}$/.test(r.corporate_number)) bag.push(r);
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

    const { sb, usingServiceRole, project_ref, db_url_host } = getAdmin();

    // ▼ ここで「不適合テーブル」にある法人番号を除外
    const nums = deduped.map((r) => r.corporate_number);
    const rej = await (sb as any)
      .from("form_prospects_rejected")
      .select("corporate_number")
      .eq("tenant_id", tenantId)
      .in("corporate_number", nums);
    const rejectedSet = new Set<string>(
      (rej?.data || []).map((x: any) => String(x.corporate_number))
    );

    // ▼ 市区町村あたり最大5件に制限（住所文字列からキー化）
    const municipalityCount = new Map<string, number>();
    const limited: RawRow[] = [];
    for (const r of shuffle(deduped, (seedNum += 19))) {
      if (rejectedSet.has(r.corporate_number)) continue; // 不適合除外
      const key = municipalityKey(r.address);
      const n = municipalityCount.get(key) || 0;
      if (n >= 5) continue;
      municipalityCount.set(key, n + 1);
      limited.push(r);
      if (limited.length >= want * 2) break; // 取りすぎ防止
    }

    const rows_preview = limited.map((r) => ({
      corporate_number: r.corporate_number,
      name: r.name,
      address: r.address,
      detail_url: r.detail_url,
    })); // ← 全件返す（UIで10件ページングする）

    // DBプローブ（任意の可視化）
    const probe = await (sb as any)
      .from("nta_corporates_cache")
      .select("corporate_number", { count: "exact", head: true })
      .limit(1);
    const db_probe_found = Number(probe?.count ?? 0);

    let inserted_new = 0;
    let rlsWarning: string | undefined;
    let toInsert: any[] = [];

    if (limited.length) {
      const nums2 = limited.map((r) => r.corporate_number);

      const { data: existedRows, error: exErr } = await (sb as any)
        .from("nta_corporates_cache")
        .select("corporate_number")
        .eq("tenant_id", tenantId)
        .in("corporate_number", nums2);

      if (exErr) {
        return NextResponse.json(
          {
            error: exErr.message,
            hint: "重複チェックに失敗",
            step: { a2_crawled, a3_picked, a4_filled, a5_inserted: 0 },
            html_sig: lastSig,
            trace,
            using_service_role: usingServiceRole,
            project_ref,
            db_url_host,
            db_probe_found,
          },
          { status: 500 }
        );
      }

      const existed = new Set<string>(
        (existedRows || []).map((r: any) => String(r.corporate_number))
      );
      const now = new Date().toISOString();
      toInsert = limited
        .filter((r) => !existed.has(r.corporate_number))
        .map((r) => ({
          tenant_id: tenantId,
          corporate_number: r.corporate_number,
          company_name: r.name,
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
                ? "RLSによりINSERTが拒否。SUPABASE_SERVICE_ROLE_KEY を設定するか、RLSポリシーでINSERTを許可してください。"
                : "テーブルのユニーク制約/権限/制約を確認してください。",
              step: { a2_crawled, a3_picked, a4_filled, a5_inserted: 0 },
              html_sig: lastSig,
              trace,
              using_service_role: usingServiceRole,
              project_ref,
              db_url_host,
              db_probe_found,
            },
            { status: 500 }
          );
        }

        inserted_new = Array.isArray(data) ? data.length : 0;

        if (!usingServiceRole && toInsert.length > 0 && inserted_new === 0) {
          rlsWarning =
            "新規候補は検出されましたが保存できませんでした。RLS により匿名INSERTが拒否の可能性。SUPABASE_SERVICE_ROLE_KEY を設定してください。";
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
        html_sig: lastSig,
        trace,
        warning: rlsWarning,
        project_ref,
        db_url_host,
        db_probe_found,
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
