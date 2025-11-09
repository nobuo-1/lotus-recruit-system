// web/src/app/api/form-outreach/companies/enrich/route.ts
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

import { NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

/** ========= ENV ========= */
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

const GOOGLE_CSE_KEY = process.env.GOOGLE_CSE_KEY || "";
const GOOGLE_CSE_CX = process.env.GOOGLE_CSE_CX || "";
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY || "";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

/** ========= Types ========= */
type EnrichBody = {
  since?: string;
  want?: number; // 目標「新規追加」件数
  try_llm?: boolean; // AI補完許可
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
  established_on?: string | null; // YYYY-MM-DD
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
  source_site?: string | null; // どの経路で判定したか
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
  ms = 8000
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
      redirect: "follow",
    });
  } finally {
    clearTimeout(id);
  }
}

const BAD_HOST_PARTS = [
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
  "note.com",
  "wikipedia.org",
  "e-stat.go.jp",
  "soumu.go.jp",
  "meti.go.jp",
  "mlit.go.jp",
  "houjin-bangou.nta.go.jp",
  ".lg.jp",
  "webcache.googleusercontent.com",
  "translate.googleusercontent.com",
  "maps.app.goo.gl",
  "goo.gl/maps",
  "g.page",
  "google.com/maps",
  "maps.google",
  "google.co.jp/maps",
];
const FILE_EXT_RE = /\.(pdf|docx?|xlsx?|pptx?|zip|rar|7z|csv|txt)$/i;

function hasBadHost(u: URL) {
  const h = u.host.toLowerCase();
  return BAD_HOST_PARTS.some((b) => h.includes(b));
}
function isFileLikePath(u: URL) {
  return FILE_EXT_RE.test(u.pathname);
}
function stripWww(host: string) {
  return host.toLowerCase().startsWith("www.")
    ? host.slice(4)
    : host.toLowerCase();
}
function sameOrigin(a: string, b: string) {
  try {
    const ua = new URL(a);
    const ub = new URL(b);
    return (
      stripWww(ua.host) === stripWww(ub.host) && ua.protocol === ub.protocol
    );
  } catch {
    return false;
  }
}

/** 文字列正規化（全角→半角・空白除去・カタカナ/ひらがな維持） */
function norm(s: string) {
  return s
    .replace(/\s+/g, "")
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (ch) =>
      String.fromCharCode(ch.charCodeAt(0) - 0xfee0)
    )
    .toLowerCase();
}
/** 「株式会社/有限会社/合同会社」除去版も含め社名の照合候補を生成 */
function nameCandidates(company: string) {
  const base = company.trim();
  const n0 = norm(base);
  const stripped = base
    .replace(/^(株式会社|有限会社|合同会社)/, "")
    .replace(/(株式会社|有限会社|合同会社)$/, "");
  const n1 = norm(stripped);
  return Array.from(new Set([n0, n1].filter(Boolean)));
}

/** URL → 公式トップページ候補へ正規化（/contact 等はルートに丸め、言語トップは許容） */
async function canonicalHomepage(input: string): Promise<string | null> {
  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`);
  } catch {
    return null;
  }
  if (!/^https?:$/i.test(u.protocol)) return null;
  if (hasBadHost(u)) return null;
  if (isFileLikePath(u)) return null;

  u.search = "";
  u.hash = "";
  const lowerPath = u.pathname.toLowerCase();
  const detailLike =
    lowerPath.includes("/contact") ||
    lowerPath.includes("/recruit") ||
    lowerPath.includes("/company/") ||
    lowerPath.includes("/about/") ||
    lowerPath.includes("/privacy") ||
    lowerPath.includes("/access") ||
    lowerPath.includes("/saiyo") ||
    lowerPath.includes("/採用") ||
    lowerPath.includes("/アクセス") ||
    lowerPath.includes("/wp-json") ||
    lowerPath.includes("/feed");
  if (detailLike) u.pathname = "/";

  u.host = stripWww(u.host);

  const originRoot = `${u.protocol}//${u.host}/`;
  try {
    const r = await fetchWithTimeout(originRoot, { method: "GET" }, 7000);
    if (r && r.url) {
      const f = new URL(r.url);
      f.host = stripWww(f.host);
      const finalPath = f.pathname || "/";
      const allowShort = /^\/(ja|jp|en|zh|ko|index\.html)?\/?$/i.test(
        finalPath
      );
      const normalized = `${f.protocol}//${f.host}${
        allowShort
          ? finalPath.endsWith("/")
            ? finalPath
            : finalPath + "/"
          : "/"
      }`;
      const nu = new URL(normalized);
      if (hasBadHost(nu) || isFileLikePath(nu))
        return `${f.protocol}//${f.host}/`;
      return normalized;
    }
  } catch {}
  return originRoot;
}

function isLikelyOfficial(url: string, company?: string | null): boolean {
  try {
    const u = new URL(url);
    if (hasBadHost(u) || isFileLikePath(u)) return false;
    if (company) {
      const host = u.host.toLowerCase().replace(/\W+/g, "");
      const cand = nameCandidates(company);
      if (cand.some((c) => host.includes(c))) return true;
    }
    return true;
  } catch {
    return false;
  }
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

/** ========= Google 検索 ========= */
async function findWebsiteByGoogleCSE(
  company: string,
  address?: string | null
): Promise<{ url: string | null; source: "google" | null }> {
  if (!GOOGLE_CSE_KEY || !GOOGLE_CSE_CX) return { url: null, source: null };
  const q = encodeURIComponent(`${company} ${address || ""}`.trim());
  const url = `https://www.googleapis.com/customsearch/v1?key=${GOOGLE_CSE_KEY}&cx=${GOOGLE_CSE_CX}&num=5&q=${q}`;
  try {
    const r = await fetchWithTimeout(url, {}, 8000);
    if (!r.ok) return { url: null, source: null };
    const j = (await r.json()) as any;
    const items: any[] = Array.isArray(j?.items) ? j.items : [];
    for (const it of items) {
      const raw = typeof it?.link === "string" ? it.link : null;
      if (!raw) continue;
      const link = await canonicalHomepage(raw);
      if (!link) continue;
      if (!isLikelyOfficial(link, company)) continue;
      if (await headOk(link)) return { url: link, source: "google" };
    }
  } catch {}
  return { url: null, source: null };
}

/** ========= Google Maps ========= */
async function findWebsiteByGoogleMaps(
  company: string,
  address?: string | null
): Promise<{ url: string | null; source: "map" | null }> {
  if (!GOOGLE_MAPS_API_KEY) return { url: null, source: null };
  const query = encodeURIComponent(`${company} ${address || ""}`.trim());
  const textSearch = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${query}&language=ja&key=${GOOGLE_MAPS_API_KEY}`;
  try {
    const r = await fetchWithTimeout(textSearch, {}, 8000);
    if (!r.ok) return { url: null, source: null };
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
      if (!siteRaw) continue;
      const cleaned = await canonicalHomepage(siteRaw);
      if (cleaned && (await headOk(cleaned))) {
        return { url: cleaned, source: "map" };
      }
    }
  } catch {}
  return { url: null, source: null };
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
    .limit(Math.max(10, limit * 4));
  if (error) throw new Error(error.message);
  return (data || []) as CacheRow[];
}

function isUniqueViolation(msg: string) {
  return /duplicate key value violates unique constraint/i.test(msg);
}

/** ========= (tenant_id, website) で競合安全 MERGE ========= */
async function mergeByWebsite(
  sb: SupabaseClient,
  tenantId: string,
  website: string,
  updateFields: Omit<
    AddedRow,
    "id" | "tenant_id" | "website" | "created_at"
  > & {
    created_at?: string | null;
  }
): Promise<{ data: AddedRow; createdNew: boolean }> {
  const now = new Date().toISOString();

  const { data: found, error: selErr } = await sb
    .from("form_prospects")
    .select("id, created_at")
    .eq("tenant_id", tenantId)
    .eq("website", website)
    .limit(1)
    .maybeSingle();
  if (selErr) throw new Error(selErr.message);

  const baseUpdate = {
    tenant_id: tenantId,
    website,
    company_name: updateFields.company_name ?? null,
    contact_email: updateFields.contact_email ?? null,
    contact_form_url: updateFields.contact_form_url ?? null,
    phone: updateFields.phone ?? null,
    industry: updateFields.industry ?? null,
    company_size: updateFields.company_size ?? null,
    prefectures: updateFields.prefectures ?? null,
    job_site_source: updateFields.job_site_source ?? null,
    corporate_number: updateFields.corporate_number ?? null,
    hq_address: updateFields.hq_address ?? null,
    capital: updateFields.capital ?? null,
    established_on: updateFields.established_on ?? null,
  };

  if (found?.id) {
    const { data, error } = await sb
      .from("form_prospects")
      .update(baseUpdate)
      .eq("id", found.id)
      .select("*")
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { data: data as AddedRow, createdNew: false };
  } else {
    try {
      const payload = {
        ...baseUpdate,
        created_at: updateFields.created_at ?? now,
      };
      const { data, error } = await sb
        .from("form_prospects")
        .insert(payload)
        .select("*")
        .maybeSingle();
      if (error) throw error;
      return { data: data as AddedRow, createdNew: true };
    } catch (e: any) {
      if (isUniqueViolation(String(e?.message || e))) {
        const { data: refetched, error: reSelErr } = await sb
          .from("form_prospects")
          .select("id, created_at")
          .eq("tenant_id", tenantId)
          .eq("website", website)
          .limit(1)
          .maybeSingle();
        if (reSelErr) throw new Error(reSelErr.message);
        if (refetched?.id) {
          const { data, error } = await sb
            .from("form_prospects")
            .update(baseUpdate)
            .eq("id", refetched.id)
            .select("*")
            .maybeSingle();
          if (error) throw new Error(error.message);
          return { data: data as AddedRow, createdNew: false };
        }
      }
      throw e;
    }
  }
}

/** ========= 不適合保存 ========= */
async function insertRejected(
  sb: SupabaseClient,
  r: RejectedRow & { tenant_id: string }
) {
  const now = new Date().toISOString();
  const payload = { ...r, created_at: r.created_at ?? now };
  const { error } = await sb.from("form_prospects_rejected").insert(payload);
  if (error) throw new Error(error.message);
}

/** ========= HTML 取得と抽出 ========= */
async function getHtml(url: string): Promise<string | null> {
  try {
    const r = await fetchWithTimeout(url, { method: "GET" }, 9000);
    if (!r.ok) return null;
    const t = await r.text();
    return typeof t === "string" && t.length ? t : null;
  } catch {
    return null;
  }
}

/** HTML内に社名があるか（正規化して粗めに判定） */
function htmlHasCompany(html: string, company: string): boolean {
  const h = norm(html);
  const cands = nameCandidates(company);
  return cands.some((c) => h.includes(c));
}

/** aタグから「会社概要/企業情報/会社案内/About」などのページと「お問い合わせ/Contact」を探す */
function discoverLinks(html: string, base: string) {
  const aboutKw =
    /(会社概要|企業情報|会社情報|企業概要|会社案内|企業案内|Corporate\s*Profile|About(?!useless))/i;
  const contactKw = /(お問い合わせ|お問合せ|CONTACT|Contact)/i;

  const hrefs: { href: string; text: string }[] = [];
  // 粗い抽出（高速・Upstash節約：パーサを使わず軽量正規表現）
  const re = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gis;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const raw = m[1];
    const text = (m[2] || "").replace(/<[^>]+>/g, " ").trim();
    if (!raw) continue;
    try {
      const u = new URL(raw, base);
      const full = u.toString();
      hrefs.push({ href: full, text });
    } catch {}
  }
  const about = hrefs.find((x) => aboutKw.test(x.text));
  const contact = hrefs.find((x) => contactKw.test(x.text));

  const aboutUrl =
    about?.href && sameOrigin(about.href, base) ? about.href : null;
  let contactUrl =
    contact?.href && sameOrigin(contact.href, base) ? contact.href : null;

  // contactが mailto: の場合は無視
  if (contactUrl && /^mailto:/i.test(contactUrl)) contactUrl = null;

  return { aboutUrl, contactUrl };
}

/** テキスト化 */
function textify(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** 会社概要の素朴抽出（正規表現ベース） */
function pickProfileByRegex(text: string) {
  const sizeRe = /(従業員|社員|スタッフ)[^0-9]{0,6}([0-9,，．\.]+)\s*(名|人)/i;
  const phoneRe =
    /(TEL|電話|Phone)[^\d]{0,4}(\d{2,4}[-–―－―‐ー]?\d{2,4}[-–―－―‐ー]?\d{3,4})/i;
  const ymdRe =
    /((19|20)\d{2})[年\.\-\/]\s*(\d{1,2})[月\.\-\/]?\s*(\d{1,2})?\s*(日)?/; // 西暦
  const gengoRe =
    /(令和|平成|昭和)\s*(\d{1,2})[年\.\-\/]\s*(\d{1,2})?[月\.\-\/]?\s*(\d{1,2})?/; // 元号（ざっくり）
  const capitalRe = /(資本金)[^\d]{0,4}([0-9,．\.]+)\s*(億|万)?\s*(円)?/i;
  const industryRe =
    /(事業内容|業種|事業領域|Business|Service|Services)[\s:：]{0,5}(.{5,120})/i;

  const mSize = text.match(sizeRe);
  const mPhone = text.match(phoneRe);
  const mYmd = text.match(ymdRe) || text.match(gengoRe);
  const mCap = text.match(capitalRe);
  const mInd = text.match(industryRe);

  return {
    sizeText: mSize ? mSize[2] : null,
    phone: mPhone ? mPhone[2] : null,
    estText: mYmd ? mYmd[0] : null,
    capitalText: mCap ? (mCap[2] + (mCap[3] || "")).trim() : null,
    industryContext: mInd ? mInd[0] : null,
  };
}

/** 数値化（資本金：万/億に対応、円単位へ） */
function toJPY(capText: string | null): number | null {
  if (!capText) return null;
  const t = capText.replace(/[，,]/g, "").trim();
  const m = t.match(/^([0-9\.]+)(億|万)?/);
  if (!m) return null;
  const n = parseFloat(m[1]);
  const unit = m[2] || "";
  if (!isFinite(n)) return null;
  if (unit === "億") return Math.round(n * 100_000_000);
  if (unit === "万") return Math.round(n * 10_000);
  return Math.round(n);
}

/** 日付化（YYYY-MM-DDまで。元号は簡易換算） */
function toISODate(estText: string | null): string | null {
  if (!estText) return null;
  // 西暦
  const m = estText.match(
    /((19|20)\d{2})[年\.\-\/]\s*(\d{1,2})[月\.\-\/]?\s*(\d{1,2})?/
  );
  if (m) {
    const y = parseInt(m[1], 10);
    const mo = parseInt(m[3] || "1", 10);
    const d = parseInt(m[4] || "1", 10);
    const pad = (x: number) => (x < 10 ? "0" + x : String(x));
    return `${y}-${pad(mo)}-${pad(d)}`;
  }
  // 元号（超ざっくり）
  const g = estText.match(
    /(令和|平成|昭和)\s*(\d{1,2})[年\.\-\/]\s*(\d{1,2})?[月\.\-\/]?\s*(\d{1,2})?/
  );
  if (g) {
    const era = g[1];
    const n = parseInt(g[2], 10);
    const mo = parseInt(g[3] || "1", 10);
    const d = parseInt(g[4] || "1", 10);
    const base = era === "令和" ? 2018 : era === "平成" ? 1988 : 1925; // R1=2019, H1=1989, S1=1926
    const y = base + n;
    const pad = (x: number) => (x < 10 ? "0" + x : String(x));
    return `${y}-${pad(mo)}-${pad(d)}`;
  }
  return null;
}

/** AIにまとめを依頼（必要時のみ / Upstashは使わない） */
async function aiEnrich(
  promptText: string
): Promise<
  Partial<{
    industry: string;
    company_size: string;
    phone: string;
    capital: number;
    established_on: string;
  }>
> {
  if (!OPENAI_API_KEY) return {};
  const sys =
    "あなたは日本企業の会社概要を要約するアシスタントです。入力テキストから「業種（1行）」「従業員規模（1行：例 '50-99名' など）」「代表的な電話番号（半角数字とハイフン）」「資本金（円、整数）」「設立日（YYYY-MM-DD）」をJSONで返してください。未知はnull。";
  const user = `テキスト:\n${promptText.slice(0, 7000)}`;

  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        temperature: 0.2,
        messages: [
          { role: "system", content: sys },
          { role: "user", content: user },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (!resp.ok) return {};
    const j = await resp.json();
    const content = j?.choices?.[0]?.message?.content || "{}";
    const parsed = JSON.parse(content);
    const capital = typeof parsed.capital === "number" ? parsed.capital : null;
    const established_on =
      typeof parsed.established_on === "string" ? parsed.established_on : null;
    const phone = typeof parsed.phone === "string" ? parsed.phone : null;
    const industry =
      typeof parsed.industry === "string" ? parsed.industry : null;
    const company_size =
      typeof parsed.company_size === "string" ? parsed.company_size : null;
    return { capital, established_on, phone, industry, company_size };
  } catch {
    return {};
  }
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
    const wantNew = Math.max(1, Math.min(2000, Number(body?.want ?? 30)));
    const allowAI = !!body?.try_llm;

    const { sb } = getAdmin();

    // 候補を多めに取る（wantNewの4倍程度）
    const candidates = await loadRecentCache(sb, tenantId, since, wantNew);
    trace.push(`candidates=${candidates.length} since=${since}`);

    const rows: AddedRow[] = [];
    const rejected: RejectedRow[] = [];
    let inserted = 0;

    for (const c of candidates) {
      if (inserted >= wantNew) break; // ★ 新規追加が目標件数に達したら終了

      const name = (c.company_name || "").trim();
      if (!name) {
        rejected.push({
          company_name: c.company_name || "(名称なし)",
          corporate_number: c.corporate_number || null,
          hq_address: c.address || null,
          source_site: "none",
          reject_reasons: ["会社名が空のためスキップ"],
        });
        continue;
      }

      // --- まず Google 検索 ---
      const fromCse = await findWebsiteByGoogleCSE(name, c.address);
      let website: string | null = fromCse.url;
      let source: "google" | "map" | null = fromCse.source;

      // --- ダメなら Google Maps ---
      if (!website) {
        const fromMap = await findWebsiteByGoogleMaps(name, c.address);
        website = fromMap.url;
        source = fromMap.source || source;
      }

      if (!website) {
        rejected.push({
          company_name: name,
          corporate_number: c.corporate_number || null,
          hq_address: c.address || null,
          source_site: GOOGLE_MAPS_API_KEY
            ? GOOGLE_CSE_KEY && GOOGLE_CSE_CX
              ? "search+map_none"
              : "map_only_none"
            : GOOGLE_CSE_KEY && GOOGLE_CSE_CX
            ? "search_only_none"
            : "none",
          reject_reasons: [
            "公式サイトが検索/マップともに確定できず",
            GOOGLE_CSE_KEY && GOOGLE_CSE_CX ? "CSE利用済み" : "CSE未設定",
            GOOGLE_MAPS_API_KEY ? "Maps利用済み" : "Maps未設定",
          ],
        });
        continue;
      }

      // トップページHTML取得
      const homepage = await canonicalHomepage(website);
      if (!homepage || !(await headOk(homepage))) {
        rejected.push({
          company_name: name,
          website,
          corporate_number: c.corporate_number || null,
          hq_address: c.address || null,
          source_site: source || "unknown",
          reject_reasons: ["トップページ正規化/到達に失敗"],
        });
        continue;
      }
      const html = await getHtml(homepage);
      if (!html) {
        rejected.push({
          company_name: name,
          website: homepage,
          corporate_number: c.corporate_number || null,
          hq_address: c.address || null,
          source_site: source || "unknown",
          reject_reasons: ["トップページHTMLが取得できない"],
        });
        continue;
      }

      // ★★ 社名がHTMLに無ければ不適合へ（誤検出抑制）
      if (!htmlHasCompany(html, name)) {
        rejected.push({
          company_name: name,
          website: homepage,
          corporate_number: c.corporate_number || null,
          hq_address: c.address || null,
          source_site: source || "unknown",
          reject_reasons: ["HTMLに社名が見当たらないため除外"],
        });
        continue;
      }

      // 会社概要/問合せリンク探索
      const { aboutUrl, contactUrl } = discoverLinks(html, homepage);

      // 会社概要テキスト抽出（なければトップも併用）
      const aboutHtml = aboutUrl ? await getHtml(aboutUrl) : null;
      const text = textify((aboutHtml || "") + " " + (html || ""));
      const picked = pickProfileByRegex(text);

      // 正規表現で拾えたものを整形
      const capital = toJPY(picked.capitalText);
      const established_on = toISODate(picked.estText);
      const phone = picked.phone || null;
      let company_size: string | null = picked.sizeText
        ? `${picked.sizeText.replace(/[，,]/g, ",")}名`
        : null;

      // 業種はAIに寄せる（regexのmIndは文脈用）
      let industry: string | null = null;

      if (allowAI) {
        const ai = await aiEnrich(
          [
            `会社名: ${name}`,
            `サイト: ${homepage}`,
            aboutUrl ? `会社概要: ${aboutUrl}` : "",
            contactUrl ? `お問い合わせ: ${contactUrl}` : "",
            `--- 抽出テキスト ---`,
            text.slice(0, 8000),
          ].join("\n")
        );
        industry = ai.industry || industry;
        company_size = ai.company_size || company_size;
        // AI側の提案があれば上書き（空欄補完）
        const aiCap = typeof ai.capital === "number" ? ai.capital : null;
        const aiEst =
          typeof ai.established_on === "string" ? ai.established_on : null;
        const aiPhone = typeof ai.phone === "string" ? ai.phone : null;

        // 既に抽出済みが優先、無い場合にAI補完
        const finalCapital = capital ?? aiCap;
        const finalEst = established_on ?? aiEst;
        const finalPhone = phone ?? aiPhone;

        // 保存（競合安全）
        const merge = await mergeByWebsite(sb, tenantId, homepage, {
          company_name: name,
          contact_email: null,
          contact_form_url: contactUrl || null,
          phone: finalPhone || null,
          industry: industry || null,
          company_size: company_size || null,
          prefectures: null,
          job_site_source: source || "google",
          corporate_number: c.corporate_number,
          hq_address: c.address,
          capital: finalCapital ?? null,
          established_on: finalEst ?? null,
        });

        rows.push(merge.data);
        if (merge.createdNew) inserted += 1;
      } else {
        // AI禁止時は正規表現結果のみで保存
        const merge = await mergeByWebsite(sb, tenantId, homepage, {
          company_name: name,
          contact_email: null,
          contact_form_url: contactUrl || null,
          phone: phone || null,
          industry: null,
          company_size: company_size || null,
          prefectures: null,
          job_site_source: source || "google",
          corporate_number: c.corporate_number,
          hq_address: c.address,
          capital: capital ?? null,
          established_on: established_on ?? null,
        });

        rows.push(merge.data);
        if (merge.createdNew) inserted += 1;
      }
    }

    // 不適合を保存
    for (const r of rejected) {
      await insertRejected(sb, { ...r, tenant_id: tenantId });
    }

    return NextResponse.json(
      {
        rows,
        rejected,
        inserted, // ★ 新規作成数のみ
        trace,
        used: {
          google_cse: Boolean(GOOGLE_CSE_KEY && GOOGLE_CSE_CX),
          maps_places: Boolean(GOOGLE_MAPS_API_KEY),
          ai: Boolean(OPENAI_API_KEY && (OPENAI_MODEL || "").length),
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
