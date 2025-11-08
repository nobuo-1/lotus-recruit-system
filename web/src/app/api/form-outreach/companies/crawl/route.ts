// web/src/app/api/form-outreach/companies/crawl/route.ts
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { NTA_TOWN_SEEDS } from "@/constants/ntaTownSeeds.generated";

/** ========= Types ========= */
type Filters = { prefectures?: string[] };
type RawRow = {
  corporate_number: string;
  name: string | null;
  address: string | null;
  detail_url: string | null;
};

type StepStat = {
  a2_crawled: number;
  a3_picked: number;
  a4_filled: number;
  a5_inserted: number;
};

/** ========= ENV ========= */
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

/** ========= HTTP helpers ========= */
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)";
const LANG = "ja-JP,ja;q=0.9";

async function fetchWithTimeout(url: string, init: any = {}, ms = 15000) {
  const ctl = new AbortController();
  const id = setTimeout(() => ctl.abort(), ms);
  try {
    return await fetch(url, {
      ...(init || {}),
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
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const okUuid = (s: string) => UUID_RE.test(String(s || "").trim());
const clamp = (n: any, min: number, max: number) =>
  Math.max(min, Math.min(max, Math.floor(Number(n) || 0)));

function pick<T>(arr: T[], n: number, seed: number): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = (seed + i) % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, n);
}

/** 町丁名から「○丁目」「番地」「号」以降やビル名っぽいノイズを除去 */
function normalizeTown(town?: string) {
  if (!town) return "";
  let s = String(town)
    .replace(/\s+/g, "")
    .replace(/‐|－|ー|―/g, "-");
  // ○丁目/番地/番/号 より後は落とす
  s = s.replace(/(.*?)(\d+丁目.*)$/u, "$1");
  s = s.replace(/(.*?)(\d+番地.*)$/u, "$1");
  s = s.replace(/(.*?)(\d+番.*)$/u, "$1");
  s = s.replace(/(.*?)(\d+号.*)$/u, "$1");
  // 「第◯」「ビル」「マンション」など代表的な語より後は落とす（雑だが有効）
  s = s.replace(/(.*?)(第[0-9０-９一二三四五六七八九十]+.*)$/u, "$1");
  s = s.replace(/(.*?)(ビル.*)$/u, "$1");
  s = s.replace(/(.*?)(マンション.*)$/u, "$1");
  s = s.replace(/(.*?)(コーポ.*)$/u, "$1");
  return s.trim();
}

/** 都市・町丁シードの生成（pref 指定が無ければ 東京都/大阪府 を優先） */
function buildAddressSeeds(
  filters: Filters,
  seedNum: number
): Array<{ keyword: string; pref: string; city: string; town?: string }> {
  const prefPool: string[] = (
    filters.prefectures && filters.prefectures.length
      ? filters.prefectures
      : Object.keys(NTA_TOWN_SEEDS).filter((p) =>
          ["東京都", "大阪府"].includes(p)
        )
  ).filter((p) => !!(NTA_TOWN_SEEDS as any)[p]);

  const out: Array<{
    keyword: string;
    pref: string;
    city: string;
    town?: string;
  }> = [];
  for (const pref of prefPool) {
    const cityMap: any = (NTA_TOWN_SEEDS as any)[pref] || {};
    for (const city of Object.keys(cityMap)) {
      const towns: string[] = (cityMap[city] || []).filter(Boolean);
      if (towns.length) {
        for (const t of towns) {
          const nt = normalizeTown(t);
          if (!nt) continue;
          out.push({ keyword: `${pref}${city}${nt}`, pref, city, town: nt });
        }
      } else {
        out.push({ keyword: `${pref}${city}`, pref, city });
      }
    }
  }
  // ランダム化
  return pick(out, out.length, seedNum);
}

/** 検索結果ページを叩く（GET クエリ 3パターンを順に試す） */
async function getResultsHtml(keyword: string, page = 1) {
  const tries = [
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
      // 結果テーブルが無ければスキップ
      if (!/class=["'][^"']*\bfixed\b[^"']*\bnormal\b/i.test(html)) continue;
      return { html, urlUsed: url };
    } catch {}
  }
  return { html: "", urlUsed: "" };
}

/** paginate セクションから「次の10件」リンクとページリンク群を抽出 */
function parsePaginate(html: string) {
  const m =
    /<div[^>]*class=["'][^"']*\bpaginate\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i.exec(
      html
    );
  if (!m) return { next10: "", pages: [] as string[] };
  const body = m[1];

  const anchors = Array.from(
    body.matchAll(/<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)
  ).map((mm) => ({
    href: mm[1],
    text: mm[2].replace(/<[^>]+>/g, "").trim(),
  }));

  const next10 =
    anchors.find((a) => /次の\s*10\s*件/.test(a.text || ""))?.href || "";

  const pageLinks = anchors
    .filter((a) => /\d+/.test(a.text))
    .map((a) =>
      a.href.startsWith("http")
        ? a.href
        : new URL(a.href, "https://www.houjin-bangou.nta.go.jp").toString()
    );

  return {
    next10:
      next10 &&
      (next10.startsWith("http")
        ? next10
        : new URL(next10, "https://www.houjin-bangou.nta.go.jp").toString()),
    pages: pageLinks,
  };
}

/** テーブル本体を解析して 法人番号/名称/所在地/詳細URL を抽出 */
function parseResultsTable(html: string): RawRow[] {
  const t =
    /<table[^>]*class=["'][^"']*\bfixed\b[^"']*\bnormal\b[^"']*["'][^>]*>([\s\S]*?)<\/table>/i.exec(
      html
    );
  if (!t) return [];

  const tbody =
    /<tbody[^>]*>([\s\S]*?)<\/tbody>/i.exec(t[1])?.[1] || t[1] || "";
  const rows = Array.from(tbody.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)).map(
    (m) => m[1]
  );

  const out: RawRow[] = [];
  for (const row of rows) {
    const cells = Array.from(row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)).map(
      (m) => m[1]
    );
    if (!cells.length) continue;

    // 法人番号は行全体から最初の13桁を優先抽出（セルの順序に依存しない）
    const num =
      /href=["'](\/number\/(\d{13}))/.exec(row)?.[2] ||
      (row.match(/\b(\d{13})\b/) || [])[1];

    // 名称は「二番目っぽいセル」を優先、無ければ <a> 直近のテキスト
    let name = cells[1]
      ? cells[1]
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim()
      : null;
    if (!name) {
      name =
        />\s*([^<]{2,120})\s*<\/a>/.exec(row)?.[1]?.trim() ||
        /<strong[^>]*>([^<]{2,180})<\/strong>/.exec(row)?.[1]?.trim() ||
        null;
    }

    // 所在地は三番目っぽいセルから
    const address = cells[2]
      ? cells[2]
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim()
      : null;

    // 詳細URL
    const rel = /href=["'](\/number\/\d{13})/.exec(row)?.[1] || "";
    const detail_url = rel
      ? new URL(rel, "https://www.houjin-bangou.nta.go.jp").toString()
      : null;

    if (num && name) {
      out.push({
        corporate_number: num,
        name,
        address: address || null,
        detail_url,
      });
    }
  }
  return out;
}

/** 名称欠落の補完（詳細ページを叩いて <td> を読む） */
async function fetchDetailAndFill(row: RawRow): Promise<RawRow> {
  if (!row.detail_url || row.name) return row;
  try {
    const r = await fetchWithTimeout(row.detail_url, {}, 12000);
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

    const nm = (name || "").trim() || null;
    return { ...row, name: nm, address: addr || row.address };
  } catch {
    return row;
  }
}

/** Supabase クライアント */
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

/** ========= POST: Phase A（クロール→nta_corporates_cache 保存） ========= */
export async function POST(req: Request) {
  const trace: string[] = [];
  const step: StepStat = {
    a2_crawled: 0,
    a3_picked: 0,
    a4_filled: 0,
    a5_inserted: 0,
  };

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
    const want: number = clamp(body?.want ?? 40, 1, 500);
    const seed: string = String(body?.seed || Math.random()).slice(2);
    const dryRun: boolean = !!body?.dryRun;
    const seedNum = Number(seed.replace(/\D/g, "")) || Date.now();
    trace.push(`want=${want} seed=${seed} dryRun=${dryRun}`);

    // 住所シード
    const seeds = buildAddressSeeds(filters, seedNum);
    if (!seeds.length) {
      return NextResponse.json(
        {
          inserted_new: 0,
          tried: 0,
          keywords_used: [],
          rows_preview: [],
          step,
          trace,
        },
        { status: 200 }
      );
    }

    const keywordsUsed: string[] = [];
    const bag: RawRow[] = [];

    // ---- クロール（テーブルを厳密に解析 & paginate に対応） ----
    // ランダムジャンプ回数（次の10件を辿る回数）
    const JUMPS_MIN = 1;
    const JUMPS_MAX = 3;
    const MAX_PAGES_PER_KEY = 3; // ページ番号リンクから拾う上限

    for (const s of seeds) {
      if (bag.length >= Math.max(want * 6, 300)) break;
      const keyword = s.keyword;
      keywordsUsed.push(keyword);

      // 1) 最初のページ
      const first = await getResultsHtml(keyword, 1);
      if (!first.html) continue;

      // 直近ページ群の解析
      const collected1 = parseResultsTable(first.html);
      step.a2_crawled += collected1.length;
      bag.push(...collected1);

      // 2) ページ番号リンクからランダムに数ページ拾う
      const { pages, next10 } = parsePaginate(first.html);
      const rndPages = pick(
        pages,
        Math.min(MAX_PAGES_PER_KEY, pages.length),
        seedNum
      );
      for (const p of rndPages) {
        try {
          const r = await fetchWithTimeout(p, {}, 15000);
          if (!r.ok) continue;
          const html = await r.text();
          const got = parseResultsTable(html);
          step.a2_crawled += got.length;
          bag.push(...got);
        } catch {}
      }

      // 3) 「次の10件」を x 回辿って、その中からも数ページ拾う
      let nextUrl = next10;
      const jumps = JUMPS_MIN + (seedNum % (JUMPS_MAX - JUMPS_MIN + 1));
      for (let j = 0; j < jumps && nextUrl; j++) {
        try {
          const r = await fetchWithTimeout(nextUrl, {}, 15000);
          if (!r.ok) break;
          const html = await r.text();

          const got = parseResultsTable(html);
          step.a2_crawled += got.length;
          bag.push(...got);

          const { pages: p2, next10: n2 } = parsePaginate(html);
          const rnd2 = pick(p2, Math.min(2, p2.length), seedNum + j + 13);
          for (const u of rnd2) {
            try {
              const rr = await fetchWithTimeout(u, {}, 15000);
              if (!rr.ok) continue;
              const h2 = await rr.text();
              const g2 = parseResultsTable(h2);
              step.a2_crawled += g2.length;
              bag.push(...g2);
            } catch {}
          }
          nextUrl = n2;
        } catch {
          break;
        }
      }

      if (bag.length >= Math.max(want * 6, 300)) break;
    }

    // ----- 重複除去（法人番号） & ピック -----
    const map = new Map<string, RawRow>();
    for (const r of bag) {
      const num = String(r.corporate_number || "").trim();
      if (!/^\d{13}$/.test(num)) continue;
      if (!map.has(num)) map.set(num, r);
    }
    const deduped = Array.from(map.values());
    step.a3_picked = deduped.length;

    // 名称欠落の補完（必要時のみ）
    const needFill = deduped.filter((r) => !r.name).slice(0, 200);
    for (const r of needFill) {
      const g = await fetchDetailAndFill(r);
      map.set(g.corporate_number, g);
    }
    step.a4_filled = needFill.length;

    // company_name が必須のため、欠落は除外
    const withName = Array.from(map.values()).filter(
      (r) => !!(r.name && r.name.trim().length > 0)
    );

    const rows_preview = withName.slice(0, 20);

    if (dryRun) {
      return NextResponse.json(
        {
          inserted_new: 0,
          tried: keywordsUsed.length,
          keywords_used: keywordsUsed.slice(0, 60),
          rows_preview,
          step,
          trace,
        },
        { status: 200 }
      );
    }

    // ----- DB保存：RLS を考慮して SELECT → INSERT（upsert は使わない） -----
    const { sb, usingServiceRole } = getAdmin();

    // 既存チェック
    const nums = withName.map((r) => r.corporate_number);
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
          rows_preview,
          step,
          trace,
        },
        { status: 500 }
      );
    }
    const existed = new Set(
      (existedRows || []).map((r: any) => String(r.corporate_number))
    );

    const now = new Date().toISOString();
    const toInsert = withName
      .filter((r) => !existed.has(r.corporate_number))
      .map((r) => ({
        tenant_id: tenantId,
        corporate_number: r.corporate_number,
        company_name: r.name!, // 非null検査済み
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
              ? "サーバに SUPABASE_SERVICE_ROLE_KEY を設定するか、RLSで匿名INSERTを許可してください。"
              : "テーブル/カラム名・権限を確認してください。",
            to_insert_count: toInsert.length,
            rows_preview,
            step,
            trace,
          },
          { status: 500 }
        );
      }
      inserted_new = (data || []).length;
      step.a5_inserted += inserted_new;
    }

    return NextResponse.json(
      {
        new_cache: inserted_new,
        to_insert_count: toInsert.length,
        tried: keywordsUsed.length,
        keywords_used: keywordsUsed.slice(0, 60),
        rows_preview,
        using_service_role: usingServiceRole,
        step,
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

/** ========= GET: ヘルスチェック（dryRun） ========= */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const tenantId = url.searchParams.get("tenant_id") || "";
  if (!tenantId || !okUuid(tenantId)) {
    return NextResponse.json({
      ok: true,
      note: "tenant_id を付けると dryRun します",
    });
  }
  const filters: Filters = { prefectures: ["東京都", "大阪府"] };
  const seed = String(Math.random()).slice(2);
  const res = await fetch(
    new URL(req.url).origin + "/api/form-outreach/companies/crawl",
    {
      method: "POST",
      headers: { "x-tenant-id": tenantId, "content-type": "application/json" },
      body: JSON.stringify({ filters, want: 10, seed, dryRun: true }),
    } as any
  );
  const j = await res.json().catch(() => ({}));
  return NextResponse.json({
    ok: res.ok,
    preview: j?.rows_preview ?? [],
    step: j?.step ?? {},
    trace: j?.trace ?? [],
  });
}
