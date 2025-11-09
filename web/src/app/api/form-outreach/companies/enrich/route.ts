// web/src/app/api/form-outreach/companies/enrich/route.ts
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

import { NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

// ✅ 業種カタログは共通モジュールを参照
import {
  INDUSTRY_LARGE,
  INDUSTRY_CATEGORIES,
  isValidIndustryPair,
  type IndustryLarge,
} from "@/lib/industryCatalog";

/** ========= ENV ========= */
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

const GOOGLE_CSE_KEY = process.env.GOOGLE_CSE_KEY || "";
const GOOGLE_CSE_CX = process.env.GOOGLE_CSE_CX || "";
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY || "";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";

/** ========= Types ========= */
type EnrichBody = {
  since?: string;
  want?: number;
  try_llm?: boolean;
};

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
  job_site_source?: string | null; // "google" | "map"
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

/** ========= Utils ========= */
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";
const LANG = "ja,en;q=0.8";

function okUuid(s: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(s || "").trim()
  );
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  ms = 10000
): Promise<Response> {
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

function normalizeUrl(u?: string | null): string | null {
  if (!u) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(u) ? u : `https://${u}`);
    const ext = (url.pathname || "").toLowerCase();
    if (/\.(pdf|docx?|xlsx?|pptx?)$/.test(ext)) return null;
    url.hash = "";
    // ルート固定
    url.pathname = "/";
    url.search = "";
    return url.toString();
  } catch {
    return null;
  }
}

function isLikelyOfficial(url: string, company?: string | null): boolean {
  const badHosts = [
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
  ];
  try {
    const h = new URL(url).host.toLowerCase();
    if (badHosts.some((b) => h.includes(b))) return false;
  } catch {
    return false;
  }
  if (company) {
    const lc = company.toLowerCase().replace(/\s+/g, "");
    if (url.toLowerCase().includes(lc)) return true;
  }
  return true;
}

async function headOk(url: string): Promise<boolean> {
  try {
    const r = await fetchWithTimeout(url, { method: "HEAD" }, 6000);
    if (r.ok) return true;
    const g = await fetchWithTimeout(url, { method: "GET" }, 8000);
    return g.ok;
  } catch {
    return false;
  }
}

function zen2han(s: string) {
  return s
    .replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 65248))
    .replace(/[−―ー]/g, "-")
    .replace(/[丁目]/g, "-")
    .replace(/[番地]/g, "-")
    .replace(/[号]/g, "-")
    .replace(/\s+/g, "");
}

function addressBlocksMatch(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return false;
  const A = zen2han(a);
  const B = zen2han(b);
  const tok = (s: string) =>
    s
      .replace(/[^\d\-]/g, "")
      .split("-")
      .filter(Boolean);
  const ta = tok(A);
  const tb = tok(B);
  if (ta.length === 0 || tb.length === 0) return false;
  let match = 0;
  for (let i = 0; i < Math.min(ta.length, tb.length, 4); i++) {
    if (ta[i] === tb[i]) match++;
    else break;
  }
  return match >= 3; // 1丁目-2番-3号 まで一致を要求
}

function nameVariants(n: string) {
  const s = (n || "").trim();
  return [
    s,
    s.replace(/株式会社/g, ""),
    s.replace(/\(株\)/g, "株式会社"),
    s.replace(/（株）/g, "株式会社"),
    s.replace(/\s+/g, ""),
  ].filter(Boolean);
}

function htmlContainsCompany(html?: string | null, company?: string | null) {
  if (!html || !company) return false;
  const h = html.replace(/\s+/g, "");
  const variants = nameVariants(company).map((x) => x.replace(/\s+/g, ""));
  return variants.some((v) => h.includes(v));
}

/** ========= Google 検索 ========= */
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
      if (await headOk(link)) return link;
    }
  } catch {}
  return null;
}

/** ========= Google Maps ========= */
async function findWebsiteByGoogleMaps(
  company: string,
  address?: string | null
): Promise<{ website: string; addrMatched: boolean } | null> {
  if (!GOOGLE_MAPS_API_KEY) return null;
  const query = encodeURIComponent(`${company} ${address || ""}`.trim());
  const textSearch = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${query}&language=ja&key=${GOOGLE_MAPS_API_KEY}`;
  try {
    const r = await fetchWithTimeout(textSearch, {}, 8000);
    if (!r.ok) return null;
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
      const siteRaw: string | null =
        dj?.result?.website || dj?.result?.url || null;
      const site = normalizeUrl(siteRaw);
      if (!site) continue;
      if (!(await headOk(site))) continue;
      const fAddr: string | null = dj?.result?.formatted_address || null;
      const matched = addressBlocksMatch(address || "", fAddr || "");
      return { website: site, addrMatched: !!matched };
    }
  } catch {}
  return null;
}

/** ========= HTML & Profile Scrape (軽量) ========= */
async function getHtml(url: string): Promise<string | null> {
  try {
    const r = await fetchWithTimeout(url, {}, 10000);
    if (!r.ok) return null;
    const t = await r.text();
    return t.slice(0, 2_000_000);
  } catch {
    return null;
  }
}

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE_RE = /0\d{1,3}[-(（]?\d{1,4}[)-）]?\d{3,4}/g;

function parseYenNumber(s: string) {
  try {
    const m = s.replace(/[,，]/g, "").match(/\d{2,}/);
    if (!m) return null;
    return Number(m[0]);
  } catch {
    return null;
  }
}

function parseDate(s: string): string | null {
  const z = s.replace(/\s+/g, "");
  let m = z.match(/(\d{4})[\/\-年](\d{1,2})[\/\-月](\d{1,2})/);
  if (m) {
    const [_, y, mth, d] = m;
    const mm = String(Number(mth)).padStart(2, "0");
    const dd = String(Number(d)).padStart(2, "0");
    return `${y}-${mm}-${dd}`;
  }
  m = z.match(/(\d{4})[\/\-年](\d{1,2})/);
  if (m) {
    const [_, y, mth] = m;
    const mm = String(Number(mth)).padStart(2, "0");
    return `${y}-${mm}-01`;
  }
  return null;
}

function extractPrefecture(addr?: string | null): string[] | null {
  if (!addr) return null;
  const prefs = [
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
  const hit = prefs.find((p) => (addr || "").includes(p));
  return hit ? [hit] : null;
}

async function profileScrape(baseUrl: string): Promise<{
  htmlTop?: string | null;
  htmlAbout?: string | null;
  contact_form_url?: string | null;
  contact_email?: string | null;
  phone?: string | null;
  capital?: number | null;
  established_on?: string | null;
  hq_address?: string | null;
  company_size?: string | null;
}> {
  const res: any = {};
  const html = await getHtml(baseUrl);
  res.htmlTop = html;

  const linkMatch =
    html?.match(/href\s*=\s*["']([^"']+)["'][^>]*>([^<]{0,40})<\/a>/gi) || [];
  const links = linkMatch
    .map((a) => {
      const href = a.match(/href\s*=\s*["']([^"']+)["']/i)?.[1] ?? "";
      const text = a.replace(/<[^>]+>/g, "");
      return { href, text };
    })
    .filter(Boolean);

  const findLink = (kw: RegExp) =>
    links.find(
      (l) =>
        kw.test((l.text || "").toLowerCase()) ||
        kw.test((l.href || "").toLowerCase())
    );

  const contactCandidate =
    findLink(/contact|お問い合わせ|問合せ|問合わせ|お問合せ/) ||
    findLink(/inquiry|inquiries/);
  if (contactCandidate?.href) {
    try {
      const u = new URL(contactCandidate.href, baseUrl).toString();
      res.contact_form_url = u;
    } catch {}
  }

  if (html) {
    const mail = html.match(EMAIL_RE)?.[0];
    if (mail) res.contact_email = mail;
    const ph = html.match(PHONE_RE)?.[0];
    if (ph) res.phone = ph;
  }

  const aboutCandidate =
    findLink(/会社概要|企業情報|会社情報|corporate|about|会社案内|沿革/) ||
    null;
  if (aboutCandidate?.href) {
    try {
      const aboutUrl = new URL(aboutCandidate.href, baseUrl).toString();
      res.htmlAbout = await getHtml(aboutUrl);
    } catch {}
  }

  const pool = [res.htmlTop, res.htmlAbout].filter(Boolean).join("\n");
  if (pool) {
    const capBlock =
      pool.match(/資本金[^0-9]{0,10}([0-9,，]+)万?円/) ||
      pool.match(/capital[^0-9]{0,10}([0-9,，]+)/i);
    if (capBlock?.[1]) res.capital = parseYenNumber(capBlock[1]);

    const estBlock =
      pool.match(/設立[^0-9]{0,10}([0-9０-９年\/\-月日\s]+)/) ||
      pool.match(/創業[^0-9]{0,10}([0-9０-９年\/\-月日\s]+)/);
    if (estBlock?.[1]) res.established_on = parseDate(zen2han(estBlock[1]));

    const addrBlock =
      pool.match(/所在地[^<]{0,40}(〒?\s?\d{3}-\d{4}[^<\n]{4,60})/) ||
      pool.match(/住所[^<]{0,40}(〒?\s?\d{3}-\d{4}[^<\n]{4,60})/);
    if (addrBlock?.[1])
      res.hq_address = addrBlock[1].replace(/<[^>]+>/g, "").trim();

    const sizeBlock =
      pool.match(/従業員[^0-9]{0,10}([0-9,，]+)名/) ||
      pool.match(/社員数[^0-9]{0,10}([0-9,，]+)名/);
    if (sizeBlock?.[1])
      res.company_size = `${sizeBlock[1].replace(/[,，]/g, "")}名`;
  }

  return res;
}

/** ========= LLM業種判定（industryCatalog を厳守） ========= */
async function classifyIndustryWithLLM(input: {
  companyName: string;
  htmlTop?: string | null;
  htmlAbout?: string | null;
}): Promise<{ large: IndustryLarge; small: string }> {
  // フォールバック: カタログから妥当な組み合わせを合成
  const fallback = (): { large: IndustryLarge; small: string } => {
    const txt = [input.htmlTop || "", input.htmlAbout || ""]
      .join(" ")
      .toLowerCase();
    const choose = <T extends string>(arr: readonly T[], def: T): T =>
      (arr.find((x) => txt.includes(x as any)) as T) || def;

    // 簡易ヒューリスティック
    if (/(病院|クリニック|介護|福祉|訪問看護)/.test(txt))
      return { large: "医療・福祉", small: "医療系サービス" };
    if (/(システム開発|ソフトウェア|saas|受託開発|クラウド)/.test(txt))
      return { large: "情報通信・メディア", small: "受託開発・SI" };
    if (/(物流|倉庫|運送|トラック)/.test(txt))
      return { large: "運輸・物流・郵便", small: "物流・3PL" };
    if (/(建設|土木|設備工事|電気工事|解体)/.test(txt))
      return { large: "建設", small: "総合工事" };
    if (/(ホテル|旅館|レストラン|カフェ|飲食)/.test(txt))
      return {
        large: "宿泊・飲食",
        small: "飲食店（レストラン・カフェ・バー）",
      };

    // デフォルト
    return {
      large: "その他サービス",
      small: INDUSTRY_CATEGORIES["その他サービス"][0] || "その他サービス",
    };
  };

  try {
    if (!OPENAI_API_KEY) return fallback();

    const sys = [
      "あなたは企業の業種を分類するアシスタントです。",
      "必ず INDUSTRY_LARGE と INDUSTRY_CATEGORIES の候補からのみ選びます。",
      '出力は JSON 1行のみ: {"large":"<大分類>","small":"<小分類>"}',
    ].join("\n");

    const content = [
      `会社名: ${input.companyName}`,
      `トップHTML(冒頭2k): ${(input.htmlTop || "").slice(0, 2000)}`,
      `会社概要HTML(冒頭2k): ${(input.htmlAbout || "").slice(0, 2000)}`,
      `候補（厳守）:`,
      `LARGE=${JSON.stringify(INDUSTRY_LARGE)}`,
      `CATS=${JSON.stringify(INDUSTRY_CATEGORIES)}`,
      `ルール: 候補に無い語は出力しない / 小分類は1つのみ`,
    ].join("\n");

    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0,
        messages: [
          { role: "system", content: sys },
          { role: "user", content },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (!resp.ok) return fallback();

    const j = await resp.json();
    const txt: string =
      j?.choices?.[0]?.message?.content || j?.choices?.[0]?.message?.role || "";
    const parsed = JSON.parse(txt || "{}");
    const large = parsed.large as string | undefined;
    const small = parsed.small as string | undefined;

    if (isValidIndustryPair(large, small)) {
      return { large: large as IndustryLarge, small: small as string };
    }
    return fallback();
  } catch {
    return fallback();
  }
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

/** ========= 直近キャッシュ ========= */
async function loadRecentCache(
  sb: any,
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

/** ========= 近似企業保存 ========= */
async function upsertSimilarSite(
  sb: SupabaseClient,
  p: {
    tenant_id: string;
    target_corporate_number?: string | null;
    target_company_name?: string | null;
    target_hq_address?: string | null;
    found_company_name?: string | null;
    found_website: string;
    source_site?: string | null;
    matched_addr?: boolean;
    matched_company_ratio?: number | null;
    contact_form_url?: string | null;
    contact_email?: string | null;
    phone?: string | null;
    reasons?: string[] | null;
  }
) {
  const now = new Date().toISOString();
  const payload = {
    ...p,
    found_website: normalizeUrl(p.found_website)!,
    matched_addr: !!p.matched_addr,
    reasons: p.reasons ?? ["社名不一致だがコンタクト手段あり"],
    updated_at: now,
  };
  const { error } = await sb
    .from("form_similar_sites")
    .upsert(payload, { onConflict: "tenant_id,found_website" });
  if (error) throw new Error(error.message);
}

/** ========= form_prospects UPSERT（エラー耐性） ========= */
async function selectExistingProspect(
  sb: SupabaseClient,
  tenant_id: string,
  corporate_number?: string | null,
  website?: string | null
): Promise<AddedRow | null> {
  const w = website ? normalizeUrl(website) : null;
  let q = sb.from("form_prospects").select("*").eq("tenant_id", tenant_id);
  if (corporate_number) {
    q = q.or(
      `corporate_number.eq.${corporate_number},website.eq.${w ?? "null"}`
    );
  } else if (w) {
    q = q.eq("website", w);
  }
  const { data, error } = await q
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return null;
  return (data as AddedRow) || null;
}

function mergeProspect(existing: any, incoming: any) {
  const pick = (a: any, b: any) => (a == null || a === "" ? b ?? a : a);
  const merged = { ...existing };
  const keys = [
    "company_name",
    "website",
    "contact_email",
    "contact_form_url",
    "phone",
    "industry",
    "company_size",
    "prefectures",
    "job_site_source",
    "corporate_number",
    "hq_address",
    "capital",
    "established_on",
  ];
  for (const k of keys) merged[k] = pick(existing[k], incoming[k]);
  return merged;
}

async function upsertProspectSafe(
  sb: SupabaseClient,
  row: Omit<AddedRow, "id" | "created_at"> & { created_at?: string | null }
): Promise<{ saved: AddedRow }> {
  const now = new Date().toISOString();
  const payload: any = { ...row, created_at: row.created_at ?? now };
  const corp = (row.corporate_number || "").trim() || null;

  if (corp) {
    try {
      const { data, error } = await sb
        .from("form_prospects")
        .upsert(payload, { onConflict: "tenant_id,corporate_number" })
        .select("*")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return { saved: data as AddedRow };
    } catch (e: any) {
      // 23505等は下でマージ対応
      const existed = await selectExistingProspect(
        sb,
        row.tenant_id,
        corp,
        row.website || null
      );
      if (existed) {
        const merged = mergeProspect(existed, payload);
        const { data: upd, error: ue } = await sb
          .from("form_prospects")
          .update(merged)
          .eq("id", existed.id)
          .select("*")
          .maybeSingle();
        if (ue) throw ue;
        return { saved: upd as AddedRow };
      }
    }
  }

  try {
    const { data, error } = await sb
      .from("form_prospects")
      .upsert(payload, { onConflict: "tenant_id,website" })
      .select("*")
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return { saved: data as AddedRow };
  } catch {
    const existed = await selectExistingProspect(
      sb,
      row.tenant_id,
      corp,
      row.website || null
    );
    if (existed) {
      const merged = mergeProspect(existed, payload);
      const { data: upd, error: ue } = await sb
        .from("form_prospects")
        .update(merged)
        .eq("id", existed.id)
        .select("*")
        .maybeSingle();
      if (ue) throw ue;
      return { saved: upd as AddedRow };
    } else {
      const { data: ins, error: ie } = await sb
        .from("form_prospects")
        .insert(payload)
        .select("*")
        .maybeSingle();
      if (ie) throw ie;
      return { saved: ins as AddedRow };
    }
  }
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
    const tryLLM = !!body?.try_llm;

    const { sb } = getAdmin();

    const candidates = await loadRecentCache(sb, tenantId, since, want);
    trace.push(`candidates=${candidates.length} since=${since}`);

    const rows: AddedRow[] = [];
    const rejected: RejectedRow[] = [];
    let inserted = 0;
    let nearMissSaved = 0;

    for (const c of candidates) {
      if (rows.length >= want) break;
      const name = (c.company_name || "").trim();
      if (!name) {
        rejected.push({
          company_name: c.company_name || "(名称なし)",
          corporate_number: c.corporate_number || null,
          hq_address: c.address || null,
          reject_reasons: ["会社名が空のためスキップ"],
          source_site: "cache",
        });
        continue;
      }

      // 1) CSE → 2) Maps（Mapsは番地一致が必須）
      let website: string | null = await findWebsiteByGoogleCSE(
        name,
        c.address
      );
      let source: "google" | "map" | null = website ? "google" : null;

      if (!website) {
        const viaMap = await findWebsiteByGoogleMaps(name, c.address);
        if (viaMap && viaMap.addrMatched) {
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
            "公式サイトが検索/マップともに確定できず",
            GOOGLE_CSE_KEY && GOOGLE_CSE_CX ? "CSE利用済み" : "CSE未設定",
            GOOGLE_MAPS_API_KEY ? "Maps利用済み" : "Maps未設定",
          ],
          source_site: "none",
        });
        continue;
      }

      // 2.5) トップページHTML
      const htmlTop = await getHtml(website);

      // 3) 会社概要等抽出
      const prof = await profileScrape(website);

      // 3.1) トップHTMLに社名無し → 近似保存（フォーム or メールがある場合に限る）
      if (!htmlContainsCompany(htmlTop, name)) {
        const hasContact = !!(prof.contact_form_url || prof.contact_email);
        if (hasContact) {
          try {
            await upsertSimilarSite(sb, {
              tenant_id: tenantId,
              target_corporate_number: c.corporate_number || null,
              target_company_name: name,
              target_hq_address: c.address || null,
              found_company_name: null,
              found_website: website,
              source_site: source || "google",
              matched_addr: false,
              matched_company_ratio: null,
              contact_form_url: prof.contact_form_url || null,
              contact_email: prof.contact_email || null,
              phone: prof.phone || null,
              reasons: ["トップHTML社名不一致／近似サイト保存"],
            });
            nearMissSaved += 1;
          } catch {}
        }

        rejected.push({
          company_name: name,
          website,
          corporate_number: c.corporate_number || null,
          hq_address: c.address || null,
          reject_reasons: [
            "トップHTMLに社名が見当たらず除外",
            hasContact ? "近似サイトは別テーブルに保存" : "連絡手段無し",
          ],
          source_site: source || "google",
        });
        continue;
      }

      // 4) 都道府県・業種
      const pref =
        extractPrefecture(prof.hq_address || c.address) ||
        extractPrefecture(c.address);
      let industryValue: string | null = null;
      if (tryLLM) {
        const cls = await classifyIndustryWithLLM({
          companyName: name,
          htmlTop: prof.htmlTop,
          htmlAbout: prof.htmlAbout,
        });
        industryValue = `${cls.large} / ${cls.small}`;
      }

      // 5) 競合安全 UPSERT（ユニーク整合に耐性あり）
      try {
        const { saved } = await upsertProspectSafe(sb, {
          tenant_id: tenantId,
          company_name: name,
          website,
          job_site_source: (source || "google") as "google" | "map",
          corporate_number: (c.corporate_number || "").trim() || null,
          hq_address: prof.hq_address || c.address || null,
          contact_email: prof.contact_email || null,
          contact_form_url: prof.contact_form_url || null,
          phone: prof.phone || null,
          industry: industryValue,
          company_size: prof.company_size || null,
          prefectures: pref || null,
          capital: prof.capital ?? null,
          established_on: prof.established_on ?? null,
        });

        rows.push(saved);

        const createdAt = saved.created_at ? Date.parse(saved.created_at) : NaN;
        const sinceAt = Date.parse(since);
        if (Number.isFinite(createdAt) && createdAt >= sinceAt) inserted += 1;
      } catch (e: any) {
        rejected.push({
          company_name: name,
          website,
          corporate_number: c.corporate_number || null,
          hq_address: c.address || null,
          reject_reasons: [
            "保存時エラー",
            String(e?.message || e).slice(0, 160),
          ],
          source_site: source || "google",
        });
      }
    }

    // 不適合を反映
    for (const r of rejected) {
      await insertRejected(sb, { ...r, tenant_id: tenantId });
    }

    return NextResponse.json(
      {
        rows,
        rejected,
        inserted,
        near_miss_saved: nearMissSaved,
        trace,
        used: {
          google_cse: Boolean(GOOGLE_CSE_KEY && GOOGLE_CSE_CX),
          maps_places: Boolean(GOOGLE_MAPS_API_KEY),
          llm: Boolean(OPENAI_API_KEY && tryLLM),
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
