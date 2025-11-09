// web/src/app/api/form-outreach/companies/enrich/route.ts
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

import { NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import {
  INDUSTRY_LARGE,
  INDUSTRY_CATEGORIES,
  INDUSTRY_SMALL_SET,
  isValidIndustryPair,
  type IndustryLarge,
} from "@/lib/industryCatalog";

/** ========= ENV ========= */
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";

const GOOGLE_CSE_KEY = process.env.GOOGLE_CSE_KEY || "";
const GOOGLE_CSE_CX = process.env.GOOGLE_CSE_CX || "";
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY || "";

/** ========= Types ========= */
type EnrichBody = { since?: string; want?: number; try_llm?: boolean };

type CacheRow = {
  tenant_id: string;
  corporate_number: string | null;
  company_name: string | null;
  address: string | null;
  detail_url?: string | null;
  scraped_at?: string | null;
};

type AddedRow = {
  id: string;
  tenant_id: string;
  company_name: string | null;
  website: string | null;
  contact_email: string | null;
  contact_form_url?: string | null;
  phone?: string | null;
  industry?: string | null;
  company_size?: string | null;
  prefectures?: string[] | null;
  job_site_source?: string | null;
  corporate_number?: string | null;
  hq_address?: string | null;
  capital?: number | null;
  established_on?: string | null;
  created_at: string | null;
};

type RejectedRow = {
  company_name: string;
  website?: string | null;
  contact_email?: string | null;
  contact_form_url?: string | null;
  phone?: string | null;
  industry_large?: string | null;
  industry_small?: string | null;
  company_size?: string | null;
  company_size_extracted?: string | null;
  prefectures?: string[] | null;
  corporate_number?: string | null;
  hq_address?: string | null;
  capital?: number | null;
  established_on?: string | null;
  source_site?: string | null;
  reject_reasons: string[];
  created_at?: string | null;
};

/** ========= Consts / Regex ========= */
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";
const LANG = "ja,en;q=0.8";
const PREFS = [
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

const PHONE_RE = /0\d{1,4}-?\d{2,4}-?\d{3,4}/g;
const CAPITAL_RE = /(資本金)\s*[:：]?\s*([0-9０-９,，\.．]+)\s*(億|万)?\s*円/;
const ESTABLISHED_RE =
  /(設立|創立|創業)\s*[:：]?\s*([0-9０-９]{2,4})[.\-/年](\s*[0-9０-９]{1,2})?(?:[.\-/月](\s*[0-9０-９]{1,2})?)?/;

/** ========= Helpers ========= */
function okUuid(s: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(s || "").trim()
  );
}
function toHalf(s: string) {
  return s.replace(/[Ａ-Ｚａ-ｚ０-９－ー．，：]/g, (c) =>
    String.fromCharCode(c.charCodeAt(0) - 0xfee0)
  );
}
function normalizeCompanyName(n?: string | null) {
  if (!n) return "";
  const s = toHalf(n)
    .replace(/\s+/g, "")
    .replace(/[()（）]/g, "")
    .replace(/株式会社|有限会社|合同会社|（同）|（有）|（株）|㈱|㈲|㈼/g, "")
    .toLowerCase();
  return s;
}
function normalizeAddress(a?: string | null) {
  if (!a) return "";
  let s = toHalf(a)
    .replace(/\s+/g, "")
    .replace(/丁目/g, "-")
    .replace(/番地?/g, "-")
    .replace(/号/g, "")
    .replace(/−|‐|ー|―/g, "-")
    .toLowerCase();
  s = s.replace(/([0-9]+)番([0-9]+)/g, "$1-$2");
  return s;
}
function pickPrefectureFromAddress(addr?: string | null): string[] | null {
  if (!addr) return null;
  const hit = PREFS.find((p) => addr.includes(p));
  return hit ? [hit] : null;
}
function normalizeUrl(u?: string | null): string | null {
  if (!u) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(u) ? u : `https://${u}`);
    if (/\.(pdf|docx?|xlsx?|pptx?)$/i.test(url.pathname)) return null;
    url.hash = "";
    return `${url.origin}/`;
  } catch {
    return null;
  }
}
async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  ms = 10000
) {
  const ctl = new AbortController();
  const id = setTimeout(() => ctl.abort(), ms);
  try {
    return await fetch(url, {
      ...init,
      headers: {
        "user-agent": UA,
        "accept-language": LANG,
        ...(init.headers || {}),
      },
      signal: ctl.signal,
      cache: "no-store",
    });
  } finally {
    clearTimeout(id);
  }
}
async function getHtml(url: string): Promise<string | null> {
  try {
    const r = await fetchWithTimeout(url, { method: "GET" }, 12000);
    if (!r.ok) return null;
    const t = await r.text();
    return t || null;
  } catch {
    return null;
  }
}
function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function htmlContainsCompany(html: string, company: string): boolean {
  const normHtml = toHalf(html).toLowerCase();
  const key = normalizeCompanyName(company);
  return key ? normHtml.includes(key) : false;
}
function extractPhone(html?: string | null): string | null {
  if (!html) return null;
  const m = html.match(PHONE_RE);
  return m?.[0] || null;
}
function extractCapital(html?: string | null): number | null {
  if (!html) return null;
  const m = html.match(CAPITAL_RE);
  if (!m) return null;
  const raw = toHalf(m[2]).replace(/[^\d.]/g, "");
  const n = Number(raw || "0");
  if (!Number.isFinite(n) || n <= 0) return null;
  const unit = m[3] || "";
  if (unit.includes("億")) return Math.round(n * 10000_0000);
  if (unit.includes("万")) return Math.round(n * 10000);
  return Math.round(n);
}
function pad2(n: number) {
  return n < 10 ? `0${n}` : `${n}`;
}
function extractEstablished(html?: string | null): string | null {
  if (!html) return null;
  const m = html.match(ESTABLISHED_RE);
  if (!m) return null;
  const y = Number(toHalf(m[2]).replace(/[^\d]/g, ""));
  if (!y) return null;
  const mm = Number(toHalf(m[3] || "").replace(/[^\d]/g, "")) || 1;
  const dd = Number(toHalf(m[4] || "").replace(/[^\d]/g, "")) || 1;
  const yyyy = y < 100 ? 1900 + y : y;
  return `${yyyy}-${pad2(mm)}-${pad2(dd)}`;
}
function prefer<T>(a: T | null | undefined, b: T | null | undefined) {
  return a ?? b ?? null;
}

/** ========= Google CSE ========= */
function isLikelyOfficial(link: string, company?: string | null): boolean {
  try {
    const h = new URL(link).host.toLowerCase();
    const bad = [
      "facebook.com",
      "x.com",
      "twitter.com",
      "instagram.com",
      "linkedin.com",
      "indeed.com",
      "jp.indeed.com",
      "wantedly.com",
      "en-gage.net",
      "mynavi",
      "doda",
      "townwork",
      "recruit",
      "yahoo.co.jp",
      "wikipedia.org",
      "note.com",
      "google.com",
      "maps.google",
      "goo.gl",
      "bit.ly",
    ];
    if (bad.some((b) => h.includes(b))) return false;
  } catch {
    return false;
  }
  if (!company) return true;
  const c = normalizeCompanyName(company);
  return c ? link.toLowerCase().includes(c) : true;
}
async function findWebsiteByGoogleCSE(
  company: string,
  address?: string | null
): Promise<string | null> {
  if (!GOOGLE_CSE_KEY || !GOOGLE_CSE_CX) return null;
  const q = encodeURIComponent(`${company} ${address || ""}`.trim());
  const url = `https://www.googleapis.com/customsearch/v1?key=${GOOGLE_CSE_KEY}&cx=${GOOGLE_CSE_CX}&num=5&q=${q}`;
  try {
    const r = await fetchWithTimeout(url, {}, 8000);
    if (!r.ok) return null;
    const j = (await r.json()) as any;
    const items: any[] = Array.isArray(j?.items) ? j.items : [];
    for (const it of items) {
      const link = normalizeUrl(it?.link);
      if (!link) continue;
      if (!isLikelyOfficial(link, company)) continue;
      return link;
    }
  } catch {}
  return null;
}

/** ========= Google Maps（社名＋番地まで照合） ========= */
function fuzzyEq(a: string, b: string) {
  return normalizeCompanyName(a) === normalizeCompanyName(b);
}
function addressLooseMatch(a?: string | null, b?: string | null) {
  if (!a || !b) return false;
  const na = normalizeAddress(a);
  const nb = normalizeAddress(b);
  const sa = na.split("-");
  const sb = nb.split("-");
  const blocks = Math.min(sa.length, sb.length);
  let eqBlocks = 0;
  for (let i = 0; i < blocks; i++) if (sa[i] && sa[i] === sb[i]) eqBlocks++;
  return eqBlocks >= 3 || na.slice(0, 30) === nb.slice(0, 30);
}
async function findWebsiteByGoogleMaps(
  company: string,
  ntaAddr?: string | null
): Promise<{
  website: string | null;
  addrMatched: boolean;
  displayName?: string;
  displayAddr?: string;
}> {
  if (!GOOGLE_MAPS_API_KEY) return { website: null, addrMatched: false };
  const query = encodeURIComponent(`${company} ${ntaAddr || ""}`.trim());
  const textSearch = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${query}&language=ja&key=${GOOGLE_MAPS_API_KEY}`;
  try {
    const r = await fetchWithTimeout(textSearch, {}, 8000);
    if (!r.ok) return { website: null, addrMatched: false };
    const j = (await r.json()) as any;
    const cand: any[] = Array.isArray(j?.results) ? j.results : [];
    for (const c of cand) {
      const placeId: string | undefined = c?.place_id;
      if (!placeId) continue;
      const details = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(
        placeId
      )}&fields=website,url,name,formatted_address&language=ja&key=${GOOGLE_MAPS_API_KEY}`;
      const d = await fetchWithTimeout(details, {}, 8000);
      if (!d.ok) continue;
      const dj = (await d.json()) as any;
      const name = String(dj?.result?.name || "");
      const addr = String(dj?.result?.formatted_address || "");
      const siteRaw: string | null =
        dj?.result?.website || dj?.result?.url || null;
      const site = normalizeUrl(siteRaw);

      const nameOk =
        fuzzyEq(name, company) ||
        normalizeCompanyName(name).includes(normalizeCompanyName(company));
      const addrOk = addressLooseMatch(addr, ntaAddr || "");
      if (site && nameOk && addrOk) {
        return {
          website: site,
          addrMatched: true,
          displayName: name,
          displayAddr: addr,
        };
      }
    }
  } catch {}
  return { website: null, addrMatched: false };
}

/** ========= Supabase ========= */
function getAdmin() {
  if (!SUPABASE_URL) throw new Error("NEXT_PUBLIC_SUPABASE_URL is missing");
  if (SERVICE_ROLE) {
    return {
      sb: createClient(SUPABASE_URL, SERVICE_ROLE),
      usingServiceRole: true,
    };
  }
  if (!ANON_KEY)
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_ANON_KEY missing"
    );
  return { sb: createClient(SUPABASE_URL, ANON_KEY), usingServiceRole: false };
}

/** ========= DB: load recent NTA cache ========= */
async function loadRecentCache(
  sb: SupabaseClient,
  tenantId: string,
  sinceISO: string,
  limit: number
): Promise<CacheRow[]> {
  const { data, error } = await sb
    .from("nta_corporates_cache")
    .select(
      "tenant_id, corporate_number, company_name, address, detail_url, scraped_at"
    )
    .eq("tenant_id", tenantId)
    .gte("scraped_at", sinceISO)
    .order("scraped_at", { ascending: false })
    .limit(Math.max(10, limit * 3));
  if (error) throw new Error(error.message);
  return (data || []) as CacheRow[];
}

/** ========= 既存参照 ========= */
async function selectByCorpnum(
  sb: SupabaseClient,
  tenant_id: string,
  corporate_number: string
) {
  const { data } = await sb
    .from("form_prospects")
    .select("*")
    .eq("tenant_id", tenant_id)
    .eq("corporate_number", corporate_number)
    .limit(1)
    .maybeSingle();
  return (data as AddedRow) || null;
}
async function selectByWebsiteLoose(
  sb: SupabaseClient,
  tenant_id: string,
  website: string
) {
  let { data } = await sb
    .from("form_prospects")
    .select("*")
    .eq("tenant_id", tenant_id)
    .eq("website", website)
    .limit(1)
    .maybeSingle();
  if (!data) {
    const { data: d2 } = await sb
      .from("form_prospects")
      .select("*")
      .eq("tenant_id", tenant_id)
      .ilike("website", `${website}%`)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    data = d2 || null;
  }
  return (data as AddedRow) || null;
}

/** ========= 競合安全 UPSERT（重複でも500を出さない） ========= */
type SaveInput = {
  tenant_id: string;
  company_name: string;
  website: string;
  job_site_source: "google" | "map";
  corporate_number?: string | null;
  hq_address?: string | null;
  contact_email?: string | null;
  contact_form_url?: string | null;
  phone?: string | null;
  industry?: string | null;
  company_size?: string | null;
  prefectures?: string[] | null;
  capital?: number | null;
  established_on?: string | null;
};

async function upsertProspectSafe(
  sb: SupabaseClient,
  row: SaveInput
): Promise<{ saved: AddedRow; createdNew: boolean }> {
  const site = normalizeUrl(row.website)!;
  const corpRaw = (row.corporate_number || "").trim();
  const corp = corpRaw.length ? corpRaw : null;

  // 既存を読んで NULL潰しマージ
  let base: AddedRow | null = null;
  if (corp) base = await selectByCorpnum(sb, row.tenant_id, corp);
  if (!base) base = await selectByWebsiteLoose(sb, row.tenant_id, site);

  const payload = {
    tenant_id: row.tenant_id,
    company_name: prefer(row.company_name, base?.company_name),
    website: site,
    contact_email: prefer(row.contact_email ?? null, base?.contact_email),
    contact_form_url: prefer(
      row.contact_form_url ?? null,
      base?.contact_form_url
    ),
    phone: prefer(row.phone ?? null, base?.phone),
    industry: prefer(row.industry ?? null, base?.industry),
    company_size: prefer(row.company_size ?? null, base?.company_size),
    prefectures: prefer(row.prefectures ?? null, base?.prefectures),
    job_site_source:
      prefer(row.job_site_source, base?.job_site_source) || "google",
    corporate_number: corp ?? base?.corporate_number ?? null,
    hq_address: prefer(row.hq_address ?? null, base?.hq_address),
    capital: prefer(row.capital ?? null, base?.capital),
    established_on: prefer(row.established_on ?? null, base?.established_on),
  };

  // corp あり： (tenant_id, corporate_number) で UPSERT
  if (payload.corporate_number) {
    const { data, error } = await sb
      .from("form_prospects")
      .upsert(payload, { onConflict: "tenant_id,corporate_number" })
      .select("*")
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const saved = data as AddedRow;
    const createdNew = saved?.created_at
      ? Date.parse(saved.created_at) > Date.now() - 120000
      : false;
    return { saved, createdNew };
  }

  // corp なし： (tenant_id, website) で UPSERT（ユニークあり）
  const { data, error } = await sb
    .from("form_prospects")
    .upsert(payload, { onConflict: "tenant_id,website" })
    .select("*")
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const saved = data as AddedRow;
  const createdNew = saved?.created_at
    ? Date.parse(saved.created_at) > Date.now() - 120000
    : false;
  return { saved, createdNew };
}

/** ========= rejected へ INSERT ========= */
async function insertRejected(
  sb: SupabaseClient,
  r: RejectedRow & { tenant_id: string }
) {
  const now = new Date().toISOString();
  const payload = { ...r, created_at: now };
  const { error } = await sb.from("form_prospects_rejected").insert(payload);
  if (error) throw new Error(error.message);
}

/** ========= 会社概要抽出 ========= */
async function profileScrape(website: string) {
  const res: {
    contact_form_url?: string | null;
    phone?: string | null;
    capital?: number | null;
    established_on?: string | null;
    company_size?: string | null;
    industry?: string | null;
    hq_address?: string | null;
    htmlTop?: string | null;
    htmlAbout?: string | null;
  } = {};
  const top = await getHtml(website);
  res.htmlTop = top || null;
  if (top) {
    res.phone = extractPhone(top) ?? null;
    const m = top.match(
      /href=["']([^"']{1,200})["'][^>]*>([^<]{0,40}お問い合わせ|CONTACT|Contact|お問合せ)/i
    );
    if (m) {
      const href = m[1];
      try {
        res.contact_form_url = new URL(href, website).toString();
      } catch {}
    }
  }

  const cand = [
    "company/",
    "corporate/",
    "about/",
    "about-us/",
    "profile/",
    "company.html",
    "corporate.html",
    "about.html",
    "会社概要",
    "企業情報",
  ];
  for (const p of cand) {
    try {
      const u = new URL(p, website).toString();
      const h = await getHtml(u);
      if (!h) continue;
      res.htmlAbout = res.htmlAbout ?? h;
      res.capital = res.capital ?? extractCapital(h);
      res.established_on = res.established_on ?? extractEstablished(h);
      res.phone = res.phone ?? extractPhone(h);
      if (!res.company_size) {
        const m = h.match(
          /(従業員|職員|社員)\s*[数数]?\s*[:：]?\s*([0-9０-９,，\.．]+)\s*名/
        );
        if (m) res.company_size = toHalf(m[2]).replace(/[^\d]/g, "") + "名";
      }
      if (!res.hq_address) {
        const m = h.match(/(所在地|本社|住所)\s*[:：]?\s*([^\n<]{6,80})/);
        if (m) res.hq_address = m[2].trim();
      }
      if (
        res.capital ||
        res.established_on ||
        res.company_size ||
        res.hq_address
      )
        break;
    } catch {}
  }
  return res;
}

/** ========= 業種をChatGPTで厳密分類（REST fetch 版） ========= */
async function classifyIndustryWithLLM(params: {
  companyName: string;
  htmlTop?: string | null;
  htmlAbout?: string | null;
}): Promise<{ large: IndustryLarge; small: string }> {
  const FALL_LARGE: IndustryLarge = "その他サービス";
  const FALL_SMALL = "その他サービス";
  if (!OPENAI_API_KEY) return { large: FALL_LARGE, small: FALL_SMALL };

  const text = [params.htmlAbout, params.htmlTop]
    .filter(Boolean)
    .map((h) => stripTags(String(h)).slice(0, 6000))
    .join("\n")
    .slice(0, 9000);

  const system = [
    "あなたは企業の事業内容から業種を判定するアシスタントです。",
    "必ず与えられた候補リストの中からのみ、【大分類】と【小分類】を1つずつ選びます。",
    "候補に無い語は絶対に返さないでください。迷う場合は「その他サービス / その他サービス」を選んでください。",
  ].join("\n");
  const catJson = JSON.stringify(INDUSTRY_CATEGORIES);
  const user = [
    `会社名: ${params.companyName}`,
    "以下は会社の公式サイトから抽出したテキストの一部です。候補リストに厳密一致で選択してください。",
    "",
    "【候補リスト(JSON)】",
    catJson,
    "",
    "【サイト本文 抜粋】",
    text || "(データ少)",
    "",
    "出力は必ず以下のJSONだけにしてください:",
    `{"large":"<大分類>","small":"<小分類>"}`,
  ].join("\n");

  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        authorization: `Bearer ${OPENAI_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
    if (!resp.ok) throw new Error(`OpenAI ${resp.status}`);
    const j = await resp.json();
    const content: string =
      j?.choices?.[0]?.message?.content ??
      j?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments ??
      "{}";
    const parsed = JSON.parse(content) as { large?: string; small?: string };

    if (isValidIndustryPair(parsed.large as any, parsed.small)) {
      return {
        large: parsed.large as IndustryLarge,
        small: parsed.small as string,
      };
    }
    if (parsed.small && INDUSTRY_SMALL_SET.has(parsed.small)) {
      const foundLarge = (
        Object.keys(INDUSTRY_CATEGORIES) as IndustryLarge[]
      ).find((L) => INDUSTRY_CATEGORIES[L].includes(parsed.small as string));
      if (foundLarge) return { large: foundLarge, small: parsed.small };
    }
  } catch {}
  return { large: FALL_LARGE, small: FALL_SMALL };
}

/** ========= メイン ========= */
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

    const body = (await req.json().catch(() => ({}))) as EnrichBody;
    const since =
      typeof body?.since === "string"
        ? body.since
        : new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const want = Math.max(1, Math.min(2000, Number(body?.want ?? 30)));

    const { sb } = getAdmin();

    const candidates = await loadRecentCache(sb, tenantId, since, want);
    trace.push(`candidates=${candidates.length} since=${since}`);

    const rows: AddedRow[] = [];
    const rejected: RejectedRow[] = [];
    let inserted = 0;

    for (const c of candidates) {
      if (rows.length >= want) break;

      const name = (c.company_name || "").trim();
      if (!name) {
        rejected.push({
          company_name: c.company_name || "(名称なし)",
          corporate_number: c.corporate_number || null,
          hq_address: c.address || null,
          reject_reasons: ["会社名が空のためスキップ"],
        });
        continue;
      }

      // 1) CSE
      let website: string | null = await findWebsiteByGoogleCSE(
        name,
        c.address
      );
      let source: "google" | "map" | null = website ? "google" : null;

      // 2) Maps（社名 + 番地照合）
      if (!website) {
        const viaMap = await findWebsiteByGoogleMaps(name, c.address);
        if (viaMap.website && viaMap.addrMatched) {
          website = viaMap.website;
          source = "map";
        }
      }

      if (!website) {
        rejected.push({
          company_name: name,
          corporate_number: c.corporate_number || null,
          hq_address: c.address || null,
          reject_reasons: [
            "公式サイトが確定できず",
            GOOGLE_CSE_KEY && GOOGLE_CSE_CX ? "CSE利用" : "CSE未設定",
            GOOGLE_MAPS_API_KEY ? "Maps利用" : "Maps未設定",
          ],
        });
        continue;
      }

      // 3) トップHTMLに社名必須
      const htmlTop = await getHtml(website);
      if (!htmlTop || !htmlContainsCompany(htmlTop, name)) {
        rejected.push({
          company_name: name,
          website,
          corporate_number: c.corporate_number || null,
          hq_address: c.address || null,
          reject_reasons: ["トップHTMLに社名が見当たらず除外"],
        });
        continue;
      }

      // 4) 会社概要抽出
      const prof = await profileScrape(website);
      const prefFromAddr =
        pickPrefectureFromAddress(prof.hq_address || c.address) ||
        pickPrefectureFromAddress(c.address);

      // 5) 業種（候補厳守）
      const { large, small } = await classifyIndustryWithLLM({
        companyName: name,
        htmlTop: prof.htmlTop || htmlTop,
        htmlAbout: prof.htmlAbout,
      });
      const industryValue = `${large} / ${small}`;

      // 6) 競合安全 UPSERT（onConflict で排他制御）
      try {
        const { saved, createdNew } = await upsertProspectSafe(sb, {
          tenant_id: tenantId,
          company_name: name,
          website,
          job_site_source: (source || "google") as "google" | "map",
          corporate_number: (c.corporate_number || "").trim() || null,
          hq_address: prof.hq_address || c.address || null,
          contact_email: null,
          contact_form_url: prof.contact_form_url || null,
          phone: prof.phone || null,
          industry: industryValue,
          company_size: prof.company_size || null,
          prefectures: prefFromAddr,
          capital: prof.capital ?? null,
          established_on: prof.established_on ?? null,
        });

        rows.push(saved);
        // 新規作成だけカウント（upsert でも created_at は新規でのみ近い時刻）
        const createdAt = saved.created_at ? Date.parse(saved.created_at) : NaN;
        const sinceAt = Date.parse(since);
        if (Number.isFinite(createdAt) && createdAt >= sinceAt) inserted += 1;
      } catch (e: any) {
        // 競合やその他は reject に回して継続（500を出さない）
        rejected.push({
          company_name: name,
          website,
          corporate_number: c.corporate_number || null,
          hq_address: c.address || null,
          reject_reasons: [
            "保存時エラー",
            String(e?.message || e).slice(0, 160),
          ],
        });
      }
    }

    for (const r of rejected) {
      await insertRejected(sb, { ...r, tenant_id: tenantId });
    }

    return NextResponse.json(
      {
        rows,
        rejected,
        inserted,
        trace,
        used: {
          google_cse: Boolean(GOOGLE_CSE_KEY && GOOGLE_CSE_CX),
          maps_places: Boolean(GOOGLE_MAPS_API_KEY),
          openai: Boolean(OPENAI_API_KEY),
        },
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
