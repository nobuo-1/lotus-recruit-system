// web/src/app/api/form-outreach/companies/fetch/route.ts
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30; // Vercel上限ガード

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { NTA_TOWN_SEEDS } from "@/constants/ntaTownSeeds.generated";

/** ---------- Types ---------- */
type SizeRange = "1-9" | "10-49" | "50-249" | "250+";
type Filters = {
  prefectures?: string[];
  employee_size_ranges?: SizeRange[];
  keywords?: string[];
  industries_large?: string[];
  industries_small?: string[];
  capital_min?: number | null;
  capital_max?: number | null;
  established_from?: string | null;
  established_to?: string | null;
  max?: number;
};
type Candidate = {
  company_name: string;
  website?: string | null;
  contact_email?: string | null;
  contact_form_url?: string | null;
  industry_large?: string | null;
  industry_small?: string | null;
  prefectures?: string[];
  company_size?: SizeRange | null;
  company_size_extracted?: SizeRange | null;
  corporate_number?: string | null;
  hq_address?: string | null;
  capital?: number | null;
  established_on?: string | null;
};
type Rejected = Candidate & { reject_reasons: string[] };

/** ---------- ENV ---------- */
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";

/** ---------- Tunables (timeout/budget) ---------- */
// 総時間予算（サーバー側実測 22秒以内で終了させる）
const HARD_BUDGET_MS = Number(process.env.FO_BUDGET_MS ?? 22_000);
// アドレスキーワード数・ページ数を強制制限
const MAX_ADDR_KEYS = Number(process.env.FO_MAX_ADDR_KEYS ?? 3);
const MAX_PAGES_PER_KEY = Number(process.env.FO_MAX_PAGES ?? 1);

// 既定は高速モード：LLM・HP到達をスキップして DB まで確実に到達
const DEFAULT_FAST_MODE = String(process.env.FO_DEFAULT_FAST ?? "1") === "1";

/** ---------- Utils ---------- */
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)";
const LANG = "ja-JP,ja;q=0.9";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const clamp = (n: unknown, min: number, max: number) =>
  Math.max(min, Math.min(max, Math.floor(Number(n) || 0)));

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

function textFromHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .slice(0, 250_000);
}
function toHalfWidthDigits(s: string): string {
  return s.replace(/[０-９]/g, (d) =>
    String.fromCharCode(d.charCodeAt(0) - 0xfee0)
  );
}
function parseYenAmount(raw: string): number | null {
  let s = toHalfWidthDigits(raw).replace(/[,，\s]/g, "");
  const unit = /億|万/.exec(s)?.[0] || "";
  s = s.replace(/[^\d.]/g, "");
  const n = Number(s || "0");
  if (!isFinite(n) || n <= 0) return null;
  if (unit === "億") return Math.round(n * 100_000_000);
  if (unit === "万") return Math.round(n * 10_000);
  return Math.round(n);
}
function extractCapital(text: string): number | null {
  const t = toHalfWidthDigits(text);
  const re = /資本金[^\d０-９]{0,6}([0-9０-９.,]+)\s*(億|万)?\s*円?/i;
  const m = re.exec(t);
  if (!m) return null;
  const amt = parseYenAmount(`${m[1]}${m[2] || ""}`);
  return amt ?? null;
}
function extractEstablishedOn(text: string): string | null {
  const t = toHalfWidthDigits(text).replace(/\s/g, "");
  const m =
    /(設立|設立年月日|創業)[^\d]{0,6}(\d{4})[\/\-年\.]?(\d{1,2})?[\/\-月\.]?(\d{1,2})?日?/i.exec(
      t
    );
  if (!m) return null;
  const y = Number(m[2]);
  const mm = m[3]
    ? String(Math.max(1, Math.min(12, Number(m[3])))).padStart(2, "0")
    : "01";
  const dd = m[4]
    ? String(Math.max(1, Math.min(31, Number(m[4])))).padStart(2, "0")
    : "01";
  if (!y || y < 1900 || y > 2100) return null;
  return `${y}-${mm}-${dd}`;
}
function extractCompanySizeToRange(text: string): SizeRange | null {
  const t = text.replace(/[,\uFF0C\u3000]/g, "");
  const re =
    /(従業員|従業員数|社員|スタッフ)[^\d]{0,8}(約|およそ)?\s*([0-9]{1,6})\s*(名|人)\s*(規模|程度|前後|以上|超|未満|以下)?/i;
  const m = re.exec(t);
  if (!m) return null;
  let n = Number(m[3]);
  if (!Number.isFinite(n) || n <= 0) return null;
  const mod = (m[5] || "").toString();
  if (/未満|以下/.test(mod)) n = Math.max(0, n - 1);
  if (n <= 9) return "1-9";
  if (n <= 49) return "10-49";
  if (n <= 249) return "50-249";
  return "250+";
}
function normalizeUrl(u?: string | null): string | undefined {
  if (!u) return;
  try {
    const raw = u.trim();
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    url.hash = "";
    return url.toString();
  } catch {
    return;
  }
}
function extractEmailsFrom(
  html: string,
  text: string,
  host?: string
): string[] {
  const pool = new Set<string>();
  const deob = (s: string) =>
    s
      .replace(/\s*\[at\]\s*/gi, "@")
      .replace(/\s*\(at\)\s*/gi, "@")
      .replace(/\s*＠\s*/g, "@")
      .replace(/\s*\[dot\]\s*/gi, ".")
      .replace(/\s*\(dot\)\s*/gi, ".")
      .replace(/＜?アットマーク＞?/g, "@")
      .replace(/＜?ドット＞?/g, ".");
  const re = /[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}(?:\.[A-Z]{2,})?/gi;
  for (const e of deob(text).match(re) ?? []) pool.add(e);
  const mailtoRe = /href=["']mailto:([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = mailtoRe.exec(html))) {
    const raw = decodeURIComponent(m[1] || "");
    for (const e of deob(raw).match(re) ?? []) pool.add(e);
  }
  const ldRe =
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  while ((m = ldRe.exec(html))) {
    try {
      const j = JSON.parse(m[1]);
      const cand = (j?.email as string) || (j?.contactPoint?.email as string);
      if (typeof cand === "string") {
        for (const e of deob(cand).match(re) ?? []) pool.add(e);
      }
    } catch {}
  }
  const arr = [...pool];
  if (host) {
    const main = arr.find((e) =>
      e.toLowerCase().endsWith(`@${host.toLowerCase()}`)
    );
    if (main) return [main, ...arr.filter((x) => x !== main)];
  }
  return arr;
}

function prefecturesFromAddress(addr?: string | null): string[] {
  if (!addr) return [];
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
  const hit = JP_PREFS.filter((p) => addr.includes(p));
  return hit.slice(0, 2);
}

function dedupeCands(cands: Candidate[]): Candidate[] {
  const seen = new Set<string>();
  const out: Candidate[] = [];
  for (const cand of cands) {
    const key = `${(cand.corporate_number || "").toLowerCase()}__${(
      cand.company_name || ""
    ).toLowerCase()}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(cand);
    }
  }
  return out;
}
function keyForRejected(c: Rejected): string {
  const num = (c.corporate_number || "").toLowerCase();
  const n = (c.company_name || "").toLowerCase();
  return `${num}__${n}`;
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
): Array<{
  keyword: string;
  level: "city" | "town";
  pref: string;
  city: string;
  town?: string;
}> {
  const out: Array<{
    keyword: string;
    level: "city" | "town";
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
          out.push({
            keyword: `${pref}${city}${town}`,
            level: "town",
            pref,
            city,
            town,
          });
        }
      } else {
        out.push({ keyword: `${pref}${city}`, level: "city", pref, city });
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
    const name = candNames.length
      ? candNames[(Date.now() + candNames.length) % candNames.length]
      : null;

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
    const want: number = clamp(body?.want ?? filters.max ?? 12, 1, 100);
    const fast: boolean = body?.fast === false ? false : DEFAULT_FAST_MODE; // 既定: fast=true
    const seed: string = String(body?.seed || Math.random()).slice(2);
    const seedNum = Number(seed.replace(/\D/g, "")) || Date.now();
    trace.push(
      `want=${want} seed=${seed} fast=${fast} budget=${budget.left()}ms`
    );

    const admin: any = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 既存（重複判定用）
    const [exWeb, exCorp, exCacheCorp] = await Promise.all([
      admin.from("form_prospects").select("website").eq("tenant_id", tenantId),
      admin
        .from("form_prospects")
        .select("corporate_number")
        .eq("tenant_id", tenantId)
        .not("corporate_number", "is", null),
      admin
        .from("nta_corporates_cache")
        .select("corporate_number")
        .eq("tenant_id", tenantId)
        .not("corporate_number", "is", null),
    ]);
    if (exWeb.error)
      return NextResponse.json({ error: exWeb.error.message }, { status: 500 });
    if (exCorp.error)
      return NextResponse.json(
        { error: exCorp.error.message },
        { status: 500 }
      );
    if (exCacheCorp.error)
      return NextResponse.json(
        { error: exCacheCorp.error.message },
        { status: 500 }
      );

    const existingWebsite = new Set(
      (exWeb.data || [])
        .map((r: any) => String(r.website || "").toLowerCase())
        .filter(Boolean)
    );
    const existingCorpNum = new Set(
      (exCorp.data || [])
        .map((r: any) => String(r.corporate_number || "").trim())
        .filter(Boolean)
    );
    const existingCacheCorp = new Set(
      (exCacheCorp.data || [])
        .map((r: any) => String(r.corporate_number || "").trim())
        .filter(Boolean)
    );

    // 住所キーワード（ランダム）— 数を強制制限してタイムアウト回避
    let addrPool = buildAddressKeywords(filters, seedNum);
    if (!addrPool.length) {
      return NextResponse.json({
        inserted: 0,
        rows: [],
        rejected: [],
        note: "seedなし：scripts/generate-nta-town-seeds-from-postal.ts を先に実行してください。",
        trace,
      });
    }
    addrPool = addrPool.slice(
      0,
      Math.max(1, Math.min(MAX_ADDR_KEYS, addrPool.length))
    );
    trace.push(`addrPool_used=${addrPool.length}`);

    // 検索 → 行抽出（時間予算を常にチェック）
    const rawRows: Array<{
      corporate_number: string;
      name: string | null;
      address: string | null;
      detail_url: string | null;
    }> = [];

    for (const k of addrPool) {
      if (!budget.ok(6_000)) break; // このキーを始める余裕がなければ打ち切り

      for (let page = 1; page <= MAX_PAGES_PER_KEY; page++) {
        if (!budget.ok(4_000)) break;

        const rows = await crawlByAddressKeyword(k.keyword, page);
        for (const r of rows) {
          const num = String(r.corporate_number || "").trim();
          if (!/^\d{13}$/.test(num)) continue;
          if (existingCorpNum.has(num)) continue;
          rawRows.push({
            corporate_number: num,
            name: r.name || null,
            address: r.address || null,
            detail_url: r.detail_url || null,
          });
        }
        await sleep(30);
        if (rawRows.length >= Math.max(want * 20, 400)) break;
      }
      if (rawRows.length >= Math.max(want * 20, 400)) break;
    }
    trace.push(`crawl=${rawRows.length} left=${budget.left()}ms`);

    // 詳細ページ補完（/number/13桁）
    const filled: typeof rawRows = [];
    const DETAIL_CONC = 6;
    for (let i = 0; i < rawRows.length; i += DETAIL_CONC) {
      if (!budget.ok(3_000)) break;
      const chunk = rawRows.slice(i, i + DETAIL_CONC);
      const got = await Promise.all(chunk.map((r) => fetchDetailAndFill(r)));
      filled.push(...got);
      if (filled.length >= Math.max(want * 16, 320)) break;
    }
    trace.push(`detail=${filled.length} left=${budget.left()}ms`);

    // cache へ保存（nta_corporates_cache）— 新規だけ
    const cachePayload = filled
      .filter((r) => !existingCacheCorp.has(r.corporate_number))
      .map((r) => ({
        tenant_id: tenantId,
        corporate_number: r.corporate_number,
        company_name: r.name ?? null,
        address: r.address ?? null,
        detail_url: r.detail_url ?? null,
        source: "nta-crawl",
        scraped_at: new Date().toISOString(),
      }));
    let cacheInserted = 0;
    if (cachePayload.length && budget.ok(1_000)) {
      const { data, error } = await admin
        .from("nta_corporates_cache")
        .upsert(cachePayload as any, {
          onConflict: "tenant_id,corporate_number",
        });
      if (error) trace.push(`cache_upsert_error: ${error.message}`);
      else cacheInserted = (data || []).length;
    }
    trace.push(`cache_upsert=${cacheInserted} left=${budget.left()}ms`);

    // Candidate化（HPは未解決のまま。まず表に出す）
    const basePool: Candidate[] = filled
      .map((r) => ({
        company_name: String(r.name || ""),
        corporate_number: String(r.corporate_number || ""),
        hq_address: r.address || null,
        prefectures: prefecturesFromAddress(r.address || null),
        website: null,
      }))
      .filter((c) => c.corporate_number && c.company_name);

    let base: Candidate[] = basePool;
    if (filters.prefectures?.length) {
      const set = new Set(filters.prefectures);
      base = basePool.filter((c) =>
        (c.prefectures || []).some((p) => set.has(p))
      );
    }
    base = dedupeCands(base);
    trace.push(`base=${base.length} left=${budget.left()}ms`);

    if (!base.length) {
      return NextResponse.json({
        inserted: 0,
        rows: [],
        rejected: [],
        note: "抽出0件。住所seedや既存重複が原因の可能性。",
        trace,
      });
    }

    // ---- FASTモード：LLM/HP抽出をスキップし、まずは保存して表に出す ----
    let accepted: Candidate[] = base.slice(0, Math.min(want, 20));
    let rejected: Rejected[] = [];

    // OPTIONAL: enrich（要求があり、かつ時間に余力があれば少数のみ）
    if (!fast && budget.ok(6_000) && OPENAI_API_KEY) {
      const limit = Math.min(5, want); // LLMは最大5件まで
      const subset = base.slice(0, limit);
      // 公式HP推定
      const withSite = await Promise.all(
        subset.map(async (c) => {
          c.website = await (async () => {
            try {
              const sys =
                "You are a helpful assistant. Output STRICT JSON only, no commentary.";
              const prompt = `次の法人の公式ホームページURLを1つ推定してください。不明なら空。必ず https:// から。
入力: {"company_name":"${c.company_name}","hq_address":"${
                c.hq_address ?? ""
              }","corporate_number":"${c.corporate_number ?? ""}"}
出力: {"website": "https://... | \"\""}`;
              const res = await fetch(
                "https://api.openai.com/v1/chat/completions",
                {
                  method: "POST",
                  headers: {
                    authorization: `Bearer ${OPENAI_API_KEY}`,
                    "content-type": "application/json",
                  },
                  body: JSON.stringify({
                    model: "gpt-4o",
                    temperature: 0.1,
                    response_format: { type: "json_object" },
                    messages: [
                      { role: "system", content: sys },
                      { role: "user", content: prompt },
                    ],
                  }),
                }
              );
              if (!res.ok) return null;
              const txt = await res.text();
              const j = JSON.parse(txt);
              const content = j?.choices?.[0]?.message?.content ?? "{}";
              const payload = JSON.parse(content);
              return normalizeUrl(payload?.website);
            } catch {
              return null;
            }
          })();
          return c;
        })
      );

      // HP到達・抽出（各1リクエスト）
      const enriched: Candidate[] = [];
      for (const c of withSite) {
        if (!c.website || !budget.ok(1_000)) continue;
        try {
          const r = await fetchWithTimeout(c.website, {}, 6_000);
          if (!r.ok) continue;
          const html = await r.text();
          const text = textFromHtml(html);
          const host = new URL(c.website).host;
          const emails = extractEmailsFrom(html, text, host);
          const sizeExtracted = extractCompanySizeToRange(text);
          const cap = extractCapital(text);
          const est = extractEstablishedOn(text);
          enriched.push({
            ...c,
            contact_email: emails[0] ?? null,
            company_size: sizeExtracted ?? null,
            company_size_extracted: sizeExtracted ?? null,
            capital: cap ?? null,
            established_on: est ?? null,
          });
        } catch {}
      }
      if (enriched.length) accepted = enriched.slice(0, want);
      trace.push(`enriched=${enriched.length} left=${budget.left()}ms`);
    }

    // form_prospects へ保存（まずは最小項目だけでも保存）
    let inserted = 0;
    let insertedRows: any[] = [];
    if (accepted.length && budget.ok(1_000)) {
      const rows = accepted.map((c) => ({
        tenant_id: tenantId,
        company_name: c.company_name,
        website: c.website || null,
        contact_form_url: c.contact_form_url ?? null,
        contact_email: c.contact_email ?? null,
        industry:
          [c.industry_large, c.industry_small].filter(Boolean).join(" / ") ||
          null,
        company_size: c.company_size_extracted ?? c.company_size ?? null,
        job_site_source: fast ? "nta-crawl-fast" : "nta-crawl+web",
        status: "new",
        prefectures: c.prefectures ?? [],
        corporate_number: c.corporate_number ?? null,
        hq_address: c.hq_address ?? null,
        capital: c.capital ?? null,
        established_on: c.established_on ?? null,
      }));

      const { data, error } = await admin
        .from("form_prospects")
        .upsert(rows as any, { onConflict: "tenant_id,website" })
        .select(
          "id, tenant_id, company_name, website, contact_email, contact_form_url, industry, company_size, job_site_source, prefectures, corporate_number, hq_address, capital, established_on, created_at"
        );

      if (error) {
        trace.push(`prospects_upsert_error: ${error.message}`);
      } else {
        inserted = (data || []).length;
        insertedRows = data || [];
        trace.push(`prospects_upsert=${inserted}`);
      }
    }

    // 不適合（今回は最小動作優先のため、rejectは最小限）
    const dedupedRejected: Rejected[] = rejected;

    return NextResponse.json({
      inserted,
      rows: insertedRows,
      rejected: dedupedRejected,
      note: fast
        ? "FASTモード：NTA→詳細補完のみで保存。HP/メール等の付加情報は後段で取得。"
        : "一部を簡易エンリッチ済み。",
      trace,
    });
  } catch (e: unknown) {
    const msg = (e as Error)?.message || String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** ---------- Handler: PATCH（不適合→手動追加） ---------- */
export async function PATCH(req: Request) {
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
    const c: Candidate | undefined = body?.candidate as Candidate | undefined;
    if (!c || !c.company_name)
      return NextResponse.json(
        { error: "candidate is required" },
        { status: 400 }
      );

    const admin: any = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const payload = {
      tenant_id: tenantId,
      company_name: c.company_name,
      website: c.website ?? null,
      contact_form_url: c.contact_form_url ?? null,
      contact_email: c.contact_email ?? null,
      industry:
        [c.industry_large, c.industry_small].filter(Boolean).join(" / ") ||
        null,
      company_size: c.company_size_extracted ?? c.company_size ?? null,
      job_site_source: "manual-override",
      status: "new",
      prefectures: c.prefectures ?? [],
      corporate_number: c.corporate_number ?? null,
      hq_address: c.hq_address ?? null,
      capital: c.capital ?? null,
      established_on: c.established_on ?? null,
    };
    const { data, error } = await admin
      .from("form_prospects")
      .upsert(payload as any, { onConflict: "tenant_id,website" })
      .select(
        "id, tenant_id, company_name, website, contact_email, contact_form_url, industry, company_size, job_site_source, prefectures, corporate_number, hq_address, capital, established_on, created_at"
      )
      .single();
    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ row: data });
  } catch (e: unknown) {
    const msg = (e as Error)?.message || String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
