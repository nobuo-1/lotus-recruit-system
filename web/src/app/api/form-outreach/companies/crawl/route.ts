// web/src/app/api/form-outreach/companies/crawl/route.ts
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { NTA_TOWN_SEEDS } from "@/constants/ntaTownSeeds.generated";

/** ===== Types ===== */
type Filters = {
  prefectures?: string[];
};
type RawRow = {
  corporate_number: string;
  name: string | null;
  address: string | null;
  detail_url: string | null;
};

/** ===== ENV ===== */
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

/** ===== HTTP helpers ===== */
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)";
const LANG = "ja-JP,ja;q=0.9";

async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  ms = 15000
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

/** ===== Utils ===== */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function clamp(n: unknown, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.floor(Number(n) || 0)));
}
function pick<T>(arr: T[], n: number, seed: number): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = (seed + i) % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, n);
}
function okUuid(s: string) {
  return UUID_RE.test(String(s || "").trim());
}

/** 都内の特定区は町丁レベルまで展開（ヒット数を増やす） */
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
        for (const town of towns) {
          out.push({ keyword: `${pref}${city}${town}`, pref, city, town });
        }
      } else {
        out.push({ keyword: `${pref}${city}`, pref, city });
      }
    }
  }
  return pick(out, out.length, seedNum);
}

/** 検索結果HTML → 法人番号/名称/住所/詳細URL を緩く抽出 */
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

    const candNames: string[] = [];
    const n1 =
      />(?:名称|商号|法人名)[^<]{0,10}<\/[^>]*>\s*<[^>]*>([^<]{2,120})<\//i
        .exec(ctx)?.[1]
        ?.trim();
    if (n1) candNames.push(n1);
    const n2 = />\s*([^<]{2,120})\s*<\/a>/.exec(ctx)?.[1]?.trim();
    if (n2) candNames.push(n2);
    const n3 = /<strong[^>]*>([^<]{2,180})<\/strong>/.exec(ctx)?.[1]?.trim();
    if (n3) candNames.push(n3);
    const name = candNames[0] || null;

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

  // 予備：裸の法人番号
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

/** 名称欠落のみ軽く詳細補完 */
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

    return { ...row, name: name || row.name, address: addr || row.address };
  } catch {
    return row;
  }
}

async function crawlByAddressKeyword(
  keyword: string,
  page = 1
): Promise<RawRow[]> {
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
      const r = await fetchWithTimeout(url, {}, 15000);
      if (!r.ok) continue;
      const html = await r.text();
      const rows = parseSearchHtml(html);
      if (rows.length) return rows;
    } catch {}
  }
  return [];
}

/** Supabase クライアント（ServiceRole → Anon フォールバック）。型は any に寄せて型深度を回避 */
function getAdminClient(): { sb: any; usingServiceRole: boolean } {
  if (!SUPABASE_URL) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is missing");
  }
  if (SUPABASE_SERVICE_ROLE_KEY) {
    return {
      sb: createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) as any,
      usingServiceRole: true,
    };
  }
  if (!SUPABASE_ANON_KEY) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_ANON_KEY are both missing"
    );
  }
  return {
    sb: createClient(SUPABASE_URL, SUPABASE_ANON_KEY) as any,
    usingServiceRole: false,
  };
}

/** ===== Handler: POST =====
 * 入力: { filters, want, seed, dryRun? }
 * 出力: { new_cache, saved_rows, tried, keywords_used, rows_preview[], rls_blocked?, trace[], error?, hint? }
 */
export async function POST(req: Request) {
  const trace: string[] = [];
  try {
    const tenantId = req.headers.get("x-tenant-id") || "";
    if (!tenantId || !okUuid(tenantId)) {
      return NextResponse.json(
        {
          error: "x-tenant-id required (uuid)",
          hint: "ログインやCookieを確認",
          trace,
        } as any,
        { status: 400 }
      );
    }

    const body: any = await req.json().catch(() => ({}));
    const filters: Filters = body?.filters ?? {};
    const want: number = clamp(body?.want ?? 20, 1, 200);
    const dryRun: boolean = !!body?.dryRun;
    const seed: string = String(body?.seed || Math.random()).slice(2);
    const seedNum = Number(seed.replace(/\D/g, "")) || Date.now();
    trace.push(`want=${want} seed=${seed} dryRun=${dryRun}`);

    // 到達性テスト
    try {
      const head = await fetchWithTimeout(
        "https://www.houjin-bangou.nta.go.jp/",
        {},
        8000
      );
      trace.push(`nta_home=${head.status}`);
    } catch {
      return NextResponse.json(
        {
          error: "NTAサイトへ到達できません",
          hint: "サーバのアウトバウンド/Firewall/Proxyを確認してください",
          trace,
        } as any,
        { status: 502 }
      );
    }

    // 住所キーワード生成
    const addrPool = buildAddressKeywords(filters, seedNum);
    if (!addrPool.length) {
      return NextResponse.json({
        new_cache: 0,
        saved_rows: 0,
        tried: 0,
        keywords_used: [],
        rows_preview: [],
        note: "seedなし：scripts/generate-nta-town-seeds-from-postal.ts を実行してください。",
        trace,
      } as any);
    }
    trace.push(`addrPool=${addrPool.length}`);

    // クロール
    const MAX_PAGES_PER_KEY = 2;
    const DETAIL_CONCURRENCY = 6;
    const keywordsUsed: string[] = [];
    const bag: RawRow[] = [];
    let tried = 0;

    for (const k of addrPool) {
      if (bag.length >= Math.max(want * 5, 200)) break;
      tried++;
      keywordsUsed.push(k.keyword);

      for (let page = 1; page <= MAX_PAGES_PER_KEY; page++) {
        const rows = await crawlByAddressKeyword(k.keyword, page);
        for (const r of rows) {
          const num = String(r.corporate_number || "").trim();
          if (!/^\d{13}$/.test(num)) continue;
          bag.push({
            corporate_number: num,
            name: r.name || null,
            address: r.address || null,
            detail_url: r.detail_url || null,
          });
        }
        if (bag.length >= Math.max(want * 5, 200)) break;
      }
    }
    trace.push(`raw=${bag.length} tried=${tried}`);

    if (!bag.length) {
      return NextResponse.json({
        new_cache: 0,
        saved_rows: 0,
        tried,
        keywords_used: keywordsUsed.slice(0, 40),
        rows_preview: [],
        trace,
      } as any);
    }

    // 法人番号で重複除去
    const dedupMap = new Map<string, RawRow>();
    for (const r of bag) {
      if (!dedupMap.has(r.corporate_number))
        dedupMap.set(r.corporate_number, r);
    }
    let deduped = Array.from(dedupMap.values());

    // 名称欠落だけ軽く詳細補完
    const needFill = deduped.filter((r) => !r.name).slice(0, 60);
    for (let i = 0; i < needFill.length; i += DETAIL_CONCURRENCY) {
      const chunk = needFill.slice(i, i + DETAIL_CONCURRENCY);
      const got = await Promise.all(chunk.map((r) => fetchDetailAndFill(r)));
      for (const g of got) dedupMap.set(g.corporate_number, g);
    }
    deduped = Array.from(dedupMap.values());

    const rows_preview = deduped.slice(0, 20);

    // dryRun は保存なしで返す
    if (dryRun) {
      return NextResponse.json({
        new_cache: 0,
        saved_rows: 0,
        tried,
        keywords_used: keywordsUsed.slice(0, 40),
        rows_preview,
        trace,
        note: "dryRun=true のためDB保存していません",
      } as any);
    }

    // === 保存 ===
    if (!SUPABASE_URL) {
      return NextResponse.json(
        {
          error: "NEXT_PUBLIC_SUPABASE_URL is missing",
          hint: "環境変数を設定してください",
          trace,
        } as any,
        { status: 500 }
      );
    }
    const { sb, usingServiceRole } = getAdminClient();

    const toSave = deduped.slice(0, Math.max(want * 3, want));
    const nums = toSave.map((r) => r.corporate_number);

    const { data: existedRows, error: exErr } = await sb
      .from("nta_corporates_cache")
      .select("corporate_number")
      .eq("tenant_id", tenantId)
      .in("corporate_number", nums);

    if (exErr) {
      return NextResponse.json(
        {
          error: exErr.message,
          hint: "既存取得に失敗",
          trace,
          rows_preview,
        } as any,
        { status: 500 }
      );
    }
    const existed = new Set(
      (existedRows || []).map((r: any) => String(r.corporate_number))
    );

    const now = new Date().toISOString();
    const payload = toSave.map((r) => ({
      tenant_id: tenantId,
      corporate_number: r.corporate_number,
      company_name: r.name ?? null,
      address: r.address ?? null,
      detail_url: r.detail_url ?? null,
      source: "nta-crawl",
      scraped_at: now,
    }));

    const { error: upErr } = await sb
      .from("nta_corporates_cache")
      .upsert(payload as any, { onConflict: "tenant_id,corporate_number" });

    if (upErr) {
      const rlsBlocked =
        !usingServiceRole &&
        /row-level security|permission denied|RLS/i.test(upErr.message || "");
      return NextResponse.json(
        {
          error: upErr.message,
          rls_blocked: rlsBlocked || undefined,
          hint: rlsBlocked
            ? "SUPABASE_SERVICE_ROLE_KEY をサーバ環境変数に追加するか、RLSポリシーで匿名挿入を許可してください。"
            : "DBの権限・onConflict列・テーブル名を確認してください。",
          trace,
          rows_preview,
        } as any,
        { status: 500 }
      );
    }

    const newCount = nums.filter((n) => !existed.has(n)).length;

    return NextResponse.json({
      new_cache: newCount,
      saved_rows: payload.length,
      tried,
      keywords_used: keywordsUsed.slice(0, 40),
      rows_preview,
      using_service_role: usingServiceRole,
      trace,
    } as any);
  } catch (e: unknown) {
    const msg = (e as Error)?.message || String(e);
    return NextResponse.json({ error: msg, trace: [] } as any, { status: 500 });
  }
}
