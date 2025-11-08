// web/src/app/api/form-outreach/companies/crawl/route.ts
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { NTA_TOWN_SEEDS } from "@/constants/ntaTownSeeds.generated";

/** ===== Types ===== */
type Filters = { prefectures?: string[] };
type RawRow = {
  corporate_number: string;
  name: string | null;
  address: string | null;
  detail_url: string | null;
};

/** ===== ENV ===== */
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

/** ===== HTTP helpers ===== */
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

/** ===== Utils ===== */
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

/** 町丁まで掘る特例 */
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
  ).filter((p) => !!(NTA_TOWN_SEEDS as any)[p]);

  for (const pref of prefPool) {
    const cityMap: any = (NTA_TOWN_SEEDS as any)[pref] || {};
    const cityList = Object.keys(cityMap);
    for (const city of cityList) {
      const isSpecial = (SPECIAL_TOWN_LEVEL[pref] || []).includes(city);
      if (isSpecial) {
        const towns: string[] = (cityMap[city] || []).filter(Boolean);
        for (const town of towns)
          out.push({ keyword: `${pref}${city}${town}`, pref, city, town });
      } else {
        out.push({ keyword: `${pref}${city}`, pref, city });
      }
    }
  }
  return pick(out, out.length, seedNum);
}

/** 検索結果HTML → 抽出 */
function parseSearchHtml(html: string): RawRow[] {
  const out: RawRow[] = [];
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

    const names: string[] = [];
    const n1 =
      />(?:名称|商号|法人名)[^<]{0,10}<\/[^>]*>\s*<[^>]*>([^<]{2,120})<\//i
        .exec(ctx)?.[1]
        ?.trim();
    if (n1) names.push(n1);
    const n2 = />\s*([^<]{2,120})\s*<\/a>/.exec(ctx)?.[1]?.trim();
    if (n2) names.push(n2);
    const n3 = /<strong[^>]*>([^<]{2,180})<\/strong>/.exec(ctx)?.[1]?.trim();
    if (n3) names.push(n3);
    const name = (names.find(Boolean) || null) as string | null;

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
      name,
      address: addr,
      detail_url: detailUrl,
    });
  }

  // 保険：裸の法人番号
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

/** 住所キーワード検索（フォールバック多段） */
async function crawlByAddressKeyword(
  keyword: string,
  page = 1
): Promise<RawRow[]> {
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

      // JS必須・ブロック検出のヒントを trace に乗せるため HTML を返す
      const blocked =
        /enable javascript|アクセスが集中|ご利用の環境から|お探しのページは見つかりません/i.test(
          html
        );
      const rows = parseSearchHtml(html);
      if (rows.length || blocked) {
        // blocked の場合でも空配列を返し、上流で trace に記録する
        return rows;
      }
    } catch {
      // 次のURL候補へ
    }
  }
  return [];
}

/** 詳細ページで会社名/住所を補完（抽出強化） */
async function fetchDetailAndFill(row: RawRow): Promise<RawRow> {
  if (!row.detail_url || row.name) return row;
  try {
    const r = await fetchWithTimeout(row.detail_url, {}, 12000);
    if (!r.ok) return row;
    const html = await r.text();

    // 会社名候補を多段で抽出（表・h1・meta・title）
    const nameCandidates: Array<string | null | undefined> = [
      /商号又は名称[^<]*<\/th>\s*<td[^>]*>([\s\S]{1,200}?)<\/td>/i
        .exec(html)?.[1]
        ?.replace(/<[^>]*>/g, " ")
        .trim(),
      /<h1[^>]*>([\s\S]{1,200}?)<\/h1>/i
        .exec(html)?.[1]
        ?.replace(/<[^>]*>/g, " ")
        .trim(),
      /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i
        .exec(html)?.[1]
        ?.trim(),
      /<title[^>]*>([\s\S]{1,200}?)<\/title>/i.exec(html)?.[1]?.trim(),
    ];
    const name =
      nameCandidates
        .find(
          (x) =>
            typeof x === "string" &&
            x.trim().length >= 2 &&
            x.trim().length <= 200
        )
        ?.trim() || row.name;

    const addrCandidates: Array<string | null | undefined> = [
      /(所在地|本店又は主たる事務所の所在地)[^<]*<\/th>\s*<td[^>]*>([\s\S]{1,300}?)<\/td>/i
        .exec(html)?.[2]
        ?.replace(/<[^>]*>/g, " ")
        .trim(),
      /(所在地|本店|本社)[^<]*<\/th>\s*<td[^>]*>([\s\S]{1,300}?)<\/td>/i
        .exec(html)?.[2]
        ?.replace(/<[^>]*>/g, " ")
        .trim(),
    ];
    const addr =
      addrCandidates
        .find(
          (x) =>
            typeof x === "string" &&
            x.trim().length >= 6 &&
            x.trim().length <= 300
        )
        ?.trim() || row.address;

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

/** ===== POST: Phase A（クロール → nta_corporates_cache へ保存） ===== */
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
    const want: number = clamp(body?.want ?? 40, 1, 500);
    const seed: string = String(body?.seed || Math.random()).slice(2);
    const dryRun: boolean = !!body?.dryRun;
    const seedNum = Number(seed.replace(/\D/g, "")) || Date.now();
    trace.push(`want=${want} seed=${seed} dryRun=${dryRun}`);

    // 住所キーワード生成
    const addrPool = buildAddressKeywords(filters, seedNum);
    if (!addrPool.length) {
      return NextResponse.json(
        {
          inserted_new: 0,
          tried: 0,
          keywords_used: [],
          rows_preview: [],
          note: "seedなし",
          trace,
        },
        { status: 200 }
      );
    }
    trace.push(`addrPool=${addrPool.length}`);

    // クロール
    const MAX_PAGES_PER_KEY = 3; // ← 強化：1→3
    const DETAIL_CONCURRENCY = 6;
    const DETAIL_FILL_CAP = 1200; // ← 強化：200→1200（NOT NULL対策）
    const bag: RawRow[] = [];
    const keywordsUsed: string[] = [];
    let tried = 0;
    let blockedHints = 0;

    for (const k of addrPool) {
      if (bag.length >= Math.max(want * 8, 400)) break;
      tried++;
      keywordsUsed.push(k.keyword);

      for (let page = 1; page <= MAX_PAGES_PER_KEY; page++) {
        const rows = await crawlByAddressKeyword(k.keyword, page);
        if (!rows.length) {
          // ページが JS 必須やブロックの可能性 → ヒントだけ数える
          blockedHints++;
          continue;
        }
        for (const r of rows) {
          const num = String(r.corporate_number || "").trim();
          if (!/^\d{13}$/.test(num)) continue;
          bag.push({
            corporate_number: num,
            name: (r.name || "")?.trim() || null,
            address: r.address || null,
            detail_url: r.detail_url || null,
          });
        }
        if (bag.length >= Math.max(want * 8, 400)) break;
      }
    }
    trace.push(
      `raw=${bag.length} tried=${tried} blocked_hints=${blockedHints}`
    );

    if (!bag.length) {
      return NextResponse.json(
        {
          inserted_new: 0,
          tried,
          keywords_used: keywordsUsed.slice(0, 40),
          rows_preview: [],
          note: blockedHints
            ? "検索ページがブロック/JS必須の可能性"
            : "候補0件",
          trace,
        },
        { status: 200 }
      );
    }

    // 重複除去（法人番号）
    const map = new Map<string, RawRow>();
    for (const r of bag)
      if (!map.has(r.corporate_number)) map.set(r.corporate_number, r);
    let deduped = Array.from(map.values());

    // 名称欠落は詳細補完（上限拡大）
    const need = deduped.filter((r) => !r.name).slice(0, DETAIL_FILL_CAP);
    for (let i = 0; i < need.length; i += DETAIL_CONCURRENCY) {
      const chunk = need.slice(i, i + DETAIL_CONCURRENCY);
      const got = await Promise.all(chunk.map((r) => fetchDetailAndFill(r)));
      for (const g of got) map.set(g.corporate_number, g);
    }
    deduped = Array.from(map.values());

    // company_name NOT NULL 対策
    const withName = deduped.filter(
      (r) => !!(r.name && r.name.trim().length > 0)
    );
    const rows_preview = withName.slice(0, 20);
    trace.push(
      `after_detail_fill withName=${withName.length} / deduped=${deduped.length}`
    );

    if (dryRun) {
      return NextResponse.json(
        {
          inserted_new: 0,
          tried,
          keywords_used: keywordsUsed.slice(0, 40),
          rows_preview,
          trace,
        },
        { status: 200 }
      );
    }

    // === DB保存（INSERTのみ・既存チェックで重複回避） ===
    const { sb, usingServiceRole } = getAdmin();

    const target = withName.slice(0, Math.max(want * 3, want));
    const nums = target.map((r) => r.corporate_number);

    const { data: existedRows, error: exErr } = (sb as any)
      .from("nta_corporates_cache")
      .select("corporate_number")
      .eq("tenant_id", tenantId)
      .in("corporate_number", nums);

    if (exErr) {
      return NextResponse.json(
        { error: exErr.message, hint: "重複チェック失敗", rows_preview, trace },
        { status: 500 }
      );
    }
    const existed = new Set<string>(
      (existedRows || []).map((r: any) => String(r.corporate_number))
    );

    const now = new Date().toISOString();
    const toInsert = target
      .filter((r) => !existed.has(r.corporate_number))
      .map((r) => ({
        tenant_id: tenantId,
        corporate_number: r.corporate_number,
        company_name: r.name!, // 非null保証済
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
              ? "サーバ環境に SUPABASE_SERVICE_ROLE_KEY を設定するか、RLSで匿名INSERTを許可してください。"
              : "テーブル/カラム名・権限・NOT NULL・デフォルトを確認してください。",
            to_insert_count: toInsert.length,
            rows_preview,
            trace,
          },
          { status: 500 }
        );
      }
      inserted_new = (data || []).length;
    }

    return NextResponse.json(
      {
        inserted_new,
        tried,
        keywords_used: keywordsUsed.slice(0, 40),
        rows_preview,
        using_service_role: usingServiceRole,
        to_insert_count: toInsert.length,
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

/** ===== GET: 簡易ヘルスチェック（dryRun） ===== */
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
      body: JSON.stringify({ filters, want: 20, seed, dryRun: true }),
    } as any
  );
  const j = await res.json().catch(() => ({}));
  return NextResponse.json({
    ok: res.ok,
    preview_count: Array.isArray(j?.rows_preview) ? j.rows_preview.length : 0,
    preview: j?.rows_preview ?? [],
    trace: j?.trace ?? [],
  });
}
