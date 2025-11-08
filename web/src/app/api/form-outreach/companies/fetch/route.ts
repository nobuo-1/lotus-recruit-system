// web/src/app/api/form-outreach/companies/fetch/route.ts
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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
  established_from?: string | null; // YYYY-MM-DD
  established_to?: string | null; // YYYY-MM-DD
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

/** ---------- Const ---------- */
// 「丁目番地等の入力欄を開く」相当として町レベルで叩く対象の区
const SPECIAL_TOWN_LEVEL: Record<string, string[]> = {
  東京都: ["渋谷区", "千代田区", "中央区", "港区", "新宿区", "世田谷区"],
  大阪府: ["大阪市中央区"],
};

/** ---------- Utils ---------- */
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const clamp = (n: unknown, min: number, max: number) =>
  Math.max(min, Math.min(max, Math.floor(Number(n) || 0)));
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)";

async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  ms = 12000
): Promise<Response> {
  const ctl = new AbortController();
  const id = setTimeout(() => ctl.abort(), ms);
  try {
    return await fetch(url, {
      ...init,
      signal: ctl.signal,
      headers: { "user-agent": UA, ...(init.headers || {}) },
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
function resolveLinks(
  html: string,
  base: string
): Array<{ href: string; label: string }> {
  const out: Array<{ href: string; label: string }> = [];
  const re = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\s]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    try {
      const href = new URL(m[1], base).toString();
      const label = m[2]
        .replace(/<[^>]*>/g, " ")
        .trim()
        .slice(0, 120);
      out.push({ href, label });
    } catch {}
  }
  return out;
}
async function findContactForm(
  url: string,
  html: string
): Promise<string | null> {
  const links = resolveLinks(html, url);
  const hit = links.find(({ href, label }) =>
    /contact|inquiry|お問い合わせ|お問合せ|問合せ/i.test(href + " " + label)
  );
  if (hit) return hit.href;
  const probes = [
    "/contact",
    "/contact-us",
    "/inquiry",
    "/inquiries",
    "/お問い合わせ",
    "/お問合せ",
    "/問合せ",
  ];
  for (const p of probes) {
    try {
      const u = new URL(p, url).toString();
      const r = await fetchWithTimeout(u, { method: "HEAD" }, 5000);
      if (r.ok) return u;
    } catch {}
  }
  return null;
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

/** ------ 国税庁 “検索結果ページ” を住所キーワードで叩く（API未使用） ------ */
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

    // 会社名候補を複数パターンで収集し、ランダム選択
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
    const name =
      candNames.length > 0
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

  // 補完：裸の法人番号
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

async function crawlByAddressKeyword(
  keyword: string,
  page = 1
): Promise<
  Array<{
    corporate_number: string | null;
    name: string | null;
    address: string | null;
    detail_url: string | null;
  }>
> {
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

/** ------ LLMで公式HP推定（未設定でもOK） ------ */
async function resolveHomepageWithLLM(
  c: Candidate
): Promise<string | undefined> {
  if (!OPENAI_API_KEY) return normalizeUrl(c.website || undefined);
  const sys =
    "You are a helpful assistant. Output STRICT JSON only, no commentary.";
  const prompt = `次の法人の公式ホームページURLを1つ推定してください。不明なら空。必ず https:// から。
入力: {"company_name":"${c.company_name}","hq_address":"${
    c.hq_address ?? ""
  }","corporate_number":"${c.corporate_number ?? ""}"}
出力: {"website": "https://... | \"\""}`;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
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
  });

  const txt = await res.text();
  if (!res.ok) return normalizeUrl(c.website || undefined);
  try {
    const j = JSON.parse(txt);
    const content = j?.choices?.[0]?.message?.content ?? "{}";
    const payload = JSON.parse(content);
    return normalizeUrl(payload?.website);
  } catch {
    return normalizeUrl(c.website || undefined);
  }
}

/** HP 到達・抽出 */
async function verifyAndEnrichWebsite(c: Candidate): Promise<Candidate | null> {
  const site = normalizeUrl(c.website || undefined);
  if (!site) return null;
  try {
    const r = await fetchWithTimeout(site, {}, 12000);
    if (!r.ok) return null;
    const html = await r.text();
    const text = textFromHtml(html);

    let host = "";
    try {
      host = new URL(site).host;
    } catch {}

    const emails = extractEmailsFrom(html, text, host);
    const contact_form_url = await findContactForm(site, html);
    const sizeExtracted = extractCompanySizeToRange(text);
    const cap = extractCapital(text);
    const est = extractEstablishedOn(text);

    return {
      ...c,
      website: site,
      contact_email: emails[0] ?? c.contact_email ?? null,
      contact_form_url,
      company_size: sizeExtracted ?? c.company_size ?? null,
      company_size_extracted: sizeExtracted ?? null,
      capital: c.capital ?? cap ?? null,
      established_on: c.established_on ?? est ?? null,
    };
  } catch {
    return null;
  }
}

/** 事前/最終フィルタ */
function prefilterByRegistry(c: Candidate, f: Filters) {
  const reasons: string[] = [];
  if (f.capital_min != null && Number.isFinite(f.capital_min)) {
    if (c.capital == null || c.capital < (f.capital_min as number)) {
      reasons.push("資本金が下限未満、または不明");
    }
  }
  if (f.capital_max != null && Number.isFinite(f.capital_max)) {
    if (c.capital == null || c.capital > (f.capital_max as number)) {
      reasons.push("資本金が上限超過、または不明");
    }
  }
  if (f.established_from) {
    if (!c.established_on || c.established_on < f.established_from) {
      reasons.push("設立日が下限より前、または不明");
    }
  }
  if (f.established_to) {
    if (!c.established_on || c.established_on > f.established_to) {
      reasons.push("設立日が上限より後、または不明");
    }
  }
  return { ok: reasons.length === 0, reasons };
}
function matchesFilters(c: Candidate, f: Filters) {
  const reasons: string[] = [];
  if (f.prefectures?.length) {
    const set = new Set((c.prefectures ?? []).map(String));
    const some = [...set].some((p) => f.prefectures!.includes(p));
    if (!some) reasons.push("所在都道府県が不一致");
  }
  if (f.employee_size_ranges?.length) {
    const ex = c.company_size_extracted ?? null;
    if (!ex) reasons.push("従業員数の実測が不明");
    else if (!f.employee_size_ranges.includes(ex))
      reasons.push("従業員数レンジ不一致");
  }
  const pre = prefilterByRegistry(c, f);
  if (!pre.ok) reasons.push(...pre.reasons);
  return { ok: reasons.length === 0, reasons };
}

/** ランダム化された住所キーワードのプールを作る
 *  - 基本: 都道府県+市区町村
 *  - SPECIAL_TOWN_LEVEL に該当: 都道府県+市区町村+町 を優先
 */
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

  // 対象都道府県の決定
  const prefPool: string[] = (
    filters.prefectures && filters.prefectures.length
      ? filters.prefectures
      : Object.keys(NTA_TOWN_SEEDS).filter((p) =>
          ["東京都", "大阪府"].includes(p)
        )
  ) // データ生成範囲に合わせる
    .filter((p) => !!NTA_TOWN_SEEDS[p]);

  // 都市レベル・町レベル双方を作り、最後にシャッフル
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
        // 市区町村単位
        out.push({
          keyword: `${pref}${city}`,
          level: "city",
          pref,
          city,
        });
      }
    }
  }

  // ランダム化（シャッフル）
  return pick(out, out.length, seedNum);
}

/** ---------- Handler: POST ---------- */
export async function POST(req: Request) {
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
    const want: number = clamp(body?.want ?? filters.max ?? 12, 1, 200);
    const seed: string = String(body?.seed || Math.random()).slice(2);
    const seedNum = Number(seed.replace(/\D/g, "")) || Date.now();

    const admin: any = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 0) 既存の website / corporate_number を把握
    const [exWeb, exCorp] = await Promise.all([
      admin.from("form_prospects").select("website").eq("tenant_id", tenantId),
      admin
        .from("form_prospects")
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

    // 1) 住所キーワードを構築（ランダム順）
    const addrPool = buildAddressKeywords(filters, seedNum);
    if (!addrPool.length) {
      return NextResponse.json({
        inserted: 0,
        rows: [],
        rejected: [],
        error:
          "seedが見つかりません。scripts/generate-nta-town-seeds-from-postal.ts を実行して seeds を生成してください。",
      });
    }

    // 2) 検索→抽出（キャッシュへは今回は直接は保存せず、このエンドポイント内で即処理）
    const rawCands: Array<{
      corporate_number: string;
      company_name: string | null;
      address: string | null;
    }> = [];

    // ランダムな叩き方：city/town ミックス、各キーワードごとに1〜2ページ程度
    const MAX_PAGES_PER_KEY = 2;
    for (const k of addrPool) {
      for (let page = 1; page <= MAX_PAGES_PER_KEY; page++) {
        const rows = await crawlByAddressKeyword(k.keyword, page);
        for (const r of rows) {
          const num = String(r.corporate_number || "").trim();
          if (!/^\d{13}$/.test(num)) continue;
          if (existingCorpNum.has(num)) continue;
          rawCands.push({
            corporate_number: num,
            company_name: r.name || null,
            address: r.address || null,
          });
        }
        await sleep(60);
        if (rawCands.length >= Math.max(want * 20, 800)) break;
      }
      if (rawCands.length >= Math.max(want * 20, 800)) break;
    }

    // 3) 候補 → Candidate 型へ
    const basePool: Candidate[] = rawCands
      .map(
        (r: {
          corporate_number: string;
          company_name: string | null;
          address: string | null;
        }): Candidate => ({
          company_name: String(r.company_name || ""),
          corporate_number: String(r.corporate_number || ""),
          hq_address: r.address || null,
          prefectures: prefecturesFromAddress(r.address || null),
          website: null,
        })
      )
      .filter((c: Candidate) => c.corporate_number && c.company_name);

    let base: Candidate[] = basePool;
    if (filters.prefectures?.length) {
      const set = new Set(filters.prefectures);
      base = basePool.filter((c: Candidate) =>
        (c.prefectures || []).some((p: string) => set.has(p))
      );
    }
    base = dedupeCands(base);

    if (!base.length) {
      return NextResponse.json({
        inserted: 0,
        rows: [],
        rejected: [],
        error:
          "該当候補が不足しました（住所seedの範囲 or 既存重複が多い可能性）。",
      });
    }

    // 4) LLMでHP解決 → 到達/抽出 → フィルタ
    const CONCURRENCY = 6;
    const withSite: Candidate[] = [];

    for (let i = 0; i < base.length; i += CONCURRENCY) {
      const chunk: Candidate[] = base.slice(i, i + CONCURRENCY);
      const solved: Candidate[] = await Promise.all(
        chunk.map(async (cand: Candidate): Promise<Candidate> => {
          if (!cand.website) cand.website = await resolveHomepageWithLLM(cand);
          return cand;
        })
      );
      withSite.push(...solved);
      if (withSite.length >= want * 8) break;
    }

    let accepted: Candidate[] = [];
    let rejected: Rejected[] = [];

    const resolvable: Candidate[] = withSite.filter(
      (x: Candidate) => !!x.website
    );
    const unresolved: Candidate[] = withSite.filter(
      (x: Candidate) => !x.website
    );
    for (const ng of unresolved) {
      rejected.push({ ...ng, reject_reasons: ["公式サイト未解決"] });
    }
    if (!resolvable.length) {
      return NextResponse.json({ inserted: 0, rows: [], rejected });
    }

    for (let i = 0; i < resolvable.length; i += CONCURRENCY) {
      const chunk: Candidate[] = resolvable.slice(i, i + CONCURRENCY);
      const verified: Array<Candidate | null> = await Promise.all(
        chunk.map((c: Candidate) => verifyAndEnrichWebsite(c))
      );

      for (const cc of verified) {
        if (!cc) continue;
        const webKey = String(cc.website || "").toLowerCase();
        if (existingWebsite.has(webKey)) {
          rejected.push({ ...cc, reject_reasons: ["既存URLと重複"] });
          continue;
        }
        const fin = matchesFilters(cc, filters);
        if (fin.ok) {
          accepted.push(cc);
          existingWebsite.add(webKey);
          if (accepted.length >= want) break;
        } else {
          rejected.push({ ...cc, reject_reasons: fin.reasons });
        }
      }
      if (accepted.length >= want) break;
    }

    accepted = dedupeCands(accepted).slice(0, want);

    // 5) 保存（form_prospects）
    const rows = accepted.map((c: Candidate) => ({
      tenant_id: tenantId,
      company_name: c.company_name,
      website: c.website || null,
      contact_form_url: c.contact_form_url ?? null,
      contact_email: c.contact_email ?? null,
      industry:
        [c.industry_large, c.industry_small].filter(Boolean).join(" / ") ||
        null,
      company_size: c.company_size_extracted ?? c.company_size ?? null,
      job_site_source: "nta-crawl+web",
      status: "new",
      prefectures: c.prefectures ?? [],
      corporate_number: c.corporate_number ?? null,
      hq_address: c.hq_address ?? null,
      capital: c.capital ?? null,
      established_on: c.established_on ?? null,
    }));

    let inserted: any[] | null = null;
    if (rows.length) {
      const { data, error: insErr } = await admin
        .from("form_prospects")
        .upsert(rows as any, { onConflict: "tenant_id,website" })
        .select(
          "id, tenant_id, company_name, website, contact_email, contact_form_url, industry, company_size, job_site_source, prefectures, corporate_number, hq_address, capital, established_on, created_at"
        );
      if (insErr)
        return NextResponse.json({ error: insErr.message }, { status: 500 });
      inserted = data as any[];
    }

    // 不適合（理由マージ）
    const dedupedRejectedMap = new Map<string, Rejected>();
    for (const it of rejected) {
      const k = keyForRejected(it);
      const ex = dedupedRejectedMap.get(k);
      if (!ex) dedupedRejectedMap.set(k, it);
      else {
        dedupedRejectedMap.set(k, {
          ...ex,
          reject_reasons: Array.from(
            new Set([
              ...(ex.reject_reasons || []),
              ...(it.reject_reasons || []),
            ])
          ),
        });
      }
    }
    const dedupedRejected = Array.from(dedupedRejectedMap.values());

    return NextResponse.json({
      inserted: inserted?.length || 0,
      rows: inserted || [],
      rejected: dedupedRejected.slice(0, Math.max(60, want * 3)),
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
    if (!c || !c.company_name) {
      return NextResponse.json(
        { error: "candidate is required" },
        { status: 400 }
      );
    }

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
