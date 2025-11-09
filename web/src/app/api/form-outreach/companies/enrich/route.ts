// web/src/app/api/form-outreach/companies/enrich/route.ts
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

import { NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

// ✅ 業種カタログ（厳守）
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
  since?: string; // ← フロントの「開始する」を押した瞬間のISO（秒単位まで）
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
  job_site_source?: "google" | "map" | null;
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
    if (/\.(pdf|docx?|xlsx?|pptx?)$/.test(ext)) return null; // PDF等はサイトURLにしない
    url.hash = "";
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

/** --- 和暦→西暦 変換 --- */
function eraToYear(era: "令和" | "平成" | "昭和", y: number): number {
  if (era === "令和") return 2018 + y; // R1=2019
  if (era === "平成") return 1988 + y; // H1=1989
  return 1925 + y; // S1=1926
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
  return match >= 3; // 1丁目-2番-3号 まで一致
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

/** ========= ドメイン系 ========= */
function hostnameOf(site: string): string | null {
  try {
    return new URL(site).hostname.toLowerCase();
  } catch {
    return null;
  }
}
function rootDomainOf(host?: string | null): string | null {
  if (!host) return null;
  const parts = host.split(".").filter(Boolean);
  if (parts.length <= 2) return host;
  // co.jp 等のセカンドレベルTLD対応（簡易）
  const sld2 = ["co.jp", "or.jp", "ne.jp", "ac.jp", "ed.jp", "go.jp", "lg.jp"];
  const last2 = parts.slice(-2).join(".");
  const last3 = parts.slice(-3).join(".");
  if (sld2.includes(last2)) return last3;
  return last2;
}
function emailDomainOK(email: string, site: string): boolean {
  const m = email.toLowerCase().match(/@([^@]+)$/);
  if (!m) return false;
  const dom = m[1];
  if (dom === "gmail.com") return true;
  const host = hostnameOf(site);
  const root = rootDomainOf(host);
  if (!root) return false;
  return dom === root || dom.endsWith("." + root);
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
        placeId!
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

/** ========= HTML ========= */
async function getHtml(url: string): Promise<string | null> {
  try {
    const r = await fetchWithTimeout(url, {}, 10000);
    if (!r.ok) return null;
    const t = await r.text();
    // script/style 除去（電話/メールの誤検出を抑止）
    return t
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .slice(0, 2_000_000);
  } catch {
    return null;
  }
}

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
// 国内向け・緩め（のちに厳格フィルタ）
const PHONE_CANDIDATE_RE = /0\d{1,3}[-–(（]?\d{1,4}[)-）]?\d{3,4}/g;

function digitsOnly(s: string) {
  return (s || "").replace(/\D/g, "");
}
function isValidJPPhone(s: string): boolean {
  const d = digitsOnly(s);
  if (!(d.length === 10 || d.length === 11)) return false;
  if (/^0{5,}$/.test(d)) return false;
  if (/^0{2,}/.test(d)) return false;
  // 固定/携帯・ありえない市外局番を簡易で弾く（03,06,04x,05x,07x,08x,09x, 070/080/090 等）
  if (!/^0(3|6|4\d|5\d|7\d|8\d|9\d)/.test(d)) return false;
  return true;
}

function parseYenNumber(s: string) {
  try {
    const m = s.replace(/[,，]/g, "").match(/\d{2,}/);
    if (!m) return null;
    return Number(m[0]);
  } catch {
    return null;
  }
}

/** --- 和暦/西暦 混在に対応した日付パース --- */
function parseDate(s: string): string | null {
  const z = s.replace(/\s+/g, "");

  // 和暦（令和/平成/昭和、元年対応）
  const eraM = z.match(
    /(令和|平成|昭和)\s*(元|\d{1,2})年(?:\s*(\d{1,2})月(?:\s*(\d{1,2})日)?)?/
  );
  if (eraM) {
    const era = eraM[1] as "令和" | "平成" | "昭和";
    const y = eraM[2] === "元" ? 1 : Number(eraM[2]);
    const yyyy = eraToYear(era, y);
    const mm = eraM[3] ? String(Number(eraM[3])).padStart(2, "0") : "01";
    const dd = eraM[4] ? String(Number(eraM[4])).padStart(2, "0") : "01";
    return `${yyyy}-${mm}-${dd}`;
  }

  // 西暦 YYYY-MM-DD / YYYY-MM
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

/** ========= 会社概要リンク検出（拡張） ========= */
const ABOUT_RX =
  /(会社概要|企業情報|会社情報|会社紹介|会社案内|沿革|about\s*us|about|corporate|profile|company(?!\.))/i;

/** ========= 表・定義リストから値抽出 ========= */
function stripTags(s: string) {
  return (s || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function extractTableLikeInfo(html: string): {
  capital?: number | null;
  established_on?: string | null;
  company_size?: string | null;
  phone?: string | null;
  hq_address?: string | null;
} {
  const res: any = {};
  const capLabels = [/資本金/, /capital/i];
  const estLabels = [/設立/, /創業/];
  const sizeLabels = [/従業員|社員数|職員/];
  const phoneLabels = [/電話|TEL|Tel|tel/];
  const addrLabels = [/所在地|住所/];

  // <tr><th>ラベル</th><td>値</td></tr> / <tr><td>ラベル</td><td>値</td></tr>
  const trs = html.match(/<tr[\s\S]*?<\/tr>/gi) || [];
  for (const tr of trs) {
    const cells = tr.match(/<(th|td)[^>]*>([\s\S]*?)<\/\1>/gi) || [];
    if (cells.length < 2) continue;
    const label = stripTags(cells[0]!);
    const value = stripTags(cells[1]!);

    if (!res.capital && capLabels.some((rx) => rx.test(label))) {
      const v = parseCapitalYen(value);
      if (v != null) res.capital = v;
    }
    if (!res.established_on && estLabels.some((rx) => rx.test(label))) {
      const p = parseDate(zen2han(value));
      if (p) res.established_on = p;
    }
    if (!res.company_size && sizeLabels.some((rx) => rx.test(label))) {
      const sz = parseHeadcount(value);
      if (sz) res.company_size = sz;
    }
    if (!res.phone && phoneLabels.some((rx) => rx.test(label))) {
      const cand = (value.match(PHONE_CANDIDATE_RE) || []).find(isValidJPPhone);
      if (cand) res.phone = cand;
    }
    if (!res.hq_address && addrLabels.some((rx) => rx.test(label))) {
      res.hq_address = value || null;
    }
  }

  // <dt>ラベル</dt><dd>値</dd>
  const dts = html.match(/<dt[\s\S]*?<\/dt>\s*<dd[\s\S]*?<\/dd>/gi) || [];
  for (const pair of dts) {
    const label = stripTags(pair.match(/<dt[\s\S]*?<\/dt>/i)?.[0] || "");
    const value = stripTags(pair.match(/<dd[\s\S]*?<\/dd>/i)?.[0] || "");
    if (!label || !value) continue;

    if (!res.capital && capLabels.some((rx) => rx.test(label))) {
      const v = parseCapitalYen(value);
      if (v != null) res.capital = v;
    }
    if (!res.established_on && estLabels.some((rx) => rx.test(label))) {
      const p = parseDate(zen2han(value));
      if (p) res.established_on = p;
    }
    if (!res.company_size && sizeLabels.some((rx) => rx.test(label))) {
      const sz = parseHeadcount(value);
      if (sz) res.company_size = sz;
    }
    if (!res.phone && phoneLabels.some((rx) => rx.test(label))) {
      const cand = (value.match(PHONE_CANDIDATE_RE) || []).find(isValidJPPhone);
      if (cand) res.phone = cand;
    }
    if (!res.hq_address && addrLabels.some((rx) => rx.test(label))) {
      res.hq_address = value || null;
    }
  }

  return res;
}

/** ========= プロフィール抽出（強化） ========= */
async function profileScrape(baseUrl: string): Promise<{
  htmlTop?: string | null;
  htmlAbout?: string | null;
  htmlContact?: string | null;
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

  // aタグ探索（会社概要・ABOUTなどを広く拾う）
  const linkMatch =
    html?.match(
      /<a\s+[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]{0,100}?)<\/a>/gi
    ) || [];
  const links = linkMatch
    .map((a) => {
      const href = a.match(/href\s*=\s*["']([^"']+)["']/i)?.[1] ?? "";
      const text = a
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      return { href, text: text.toLowerCase() };
    })
    .filter(Boolean);

  const findLink = (rx: RegExp) =>
    links.find((l) => rx.test(l.text) || rx.test((l.href || "").toLowerCase()));

  const contactLink =
    findLink(
      /contact|お問い合わせ|問合せ|問合わせ|お問合せ|inquiry|inquiries/
    ) || null;
  const aboutLink = findLink(ABOUT_RX) || null;

  const contactHref = contactLink?.href ?? "";
  if (contactHref) {
    try {
      const u = new URL(contactHref, baseUrl).toString();
      res.contact_form_url = u;
      res.htmlContact = await getHtml(u);
    } catch {}
  }

  const aboutHref = aboutLink?.href ?? "";
  if (aboutHref) {
    try {
      const u = new URL(aboutHref, baseUrl).toString();
      res.htmlAbout = await getHtml(u);
    } catch {}
  }

  // 連絡先（メールは後段でドメインフィルタ）
  const emailPool = [res.htmlContact, res.htmlAbout, res.htmlTop]
    .filter(Boolean)
    .join("\n");
  const phonePool = [res.htmlContact, res.htmlAbout, res.htmlTop]
    .filter(Boolean)
    .join("\n");

  if (emailPool) {
    const m = emailPool.match(EMAIL_RE);
    if (m && m.length) res.contact_email = m[0];
  }

  if (phonePool) {
    const cand = phonePool.match(PHONE_CANDIDATE_RE) || [];
    const good = cand.find(isValidJPPhone);
    if (good) res.phone = good;
  }

  // 会社概要HTML要素（表/定義リスト）を優先して解析
  if (res.htmlAbout) {
    const info = extractTableLikeInfo(res.htmlAbout as string);
    if (info.capital != null && res.capital == null) res.capital = info.capital;
    if (info.established_on && !res.established_on)
      res.established_on = info.established_on;
    if (info.company_size && !res.company_size)
      res.company_size = info.company_size;
    if (info.phone && !res.phone) res.phone = info.phone;
    if (info.hq_address && !res.hq_address) res.hq_address = info.hq_address;
  }

  // テキスト抽出（資本金/従業員数/設立）
  const infoPool = [res.htmlAbout, res.htmlTop].filter(Boolean).join("\n");
  if (infoPool) {
    if (res.capital == null) {
      const idx = infoPool.search(/資本金/);
      if (idx >= 0) {
        const snip = infoPool.slice(idx, idx + 100);
        const val = parseCapitalYen(snip);
        if (val != null) res.capital = val;
      }
    }

    if (!res.established_on) {
      // 和暦も含めて parseDate
      const estBlock = infoPool.match(
        /(設立|創業)[^0-9令和平成昭和元]{0,10}([0-9０-９年\/\-月日\s令和平成昭和元]+)/
      );
      if (estBlock?.[2]) res.established_on = parseDate(zen2han(estBlock[2]));
    }

    if (!res.hq_address) {
      const addrBlock =
        infoPool.match(/所在地[^<]{0,80}(〒?\s?\d{3}-\d{4}[^<\n]{3,120})/) ||
        infoPool.match(/住所[^<]{0,80}(〒?\s?\d{3}-\d{4}[^<\n]{3,120})/);
      if (addrBlock?.[1])
        res.hq_address = addrBlock[1].replace(/<[^>]+>/g, "").trim();
    }

    if (!res.company_size) {
      const k1 = infoPool.search(/従業員/);
      const k2 = infoPool.search(/社員数/);
      const k3 = infoPool.search(/職員/);
      const i = [k1, k2, k3].filter((x) => x >= 0).sort((a, b) => a - b)[0];
      if (Number.isFinite(i)) {
        const snip = infoPool.slice(i!, i! + 80);
        const sz = parseHeadcount(snip);
        if (sz) res.company_size = sz;
      }
    }
  }

  return res;
}

/** 従業員数（名/人） */
function parseHeadcount(s: string): string | null {
  const z = zen2han((s || "").replace(/[,，]/g, ""));
  const withUnit =
    z.match(/(\d{1,6})\s*(?:名|人)(?:[^0-9]|$)/) ||
    z.match(/約\s*(\d{1,6})\s*(?:名|人)/);
  if (withUnit) return `${withUnit[1]}名`;
  const plain = z.match(/(?:従業員|社員|職員)[^0-9]{0,8}(\d{1,6})/);
  if (plain) return `${plain[1]}名`;
  return null;
}

/** 資本金（円）を万/千/億表記から正規化 */
function parseCapitalYen(s: string): number | null {
  try {
    const z = zen2han((s || "").replace(/[,，]/g, ""));
    let found = false;
    let yen = 0;

    const mOk = z.match(/(\d+(?:\.\d+)?)\s*億/);
    if (mOk) {
      yen += Math.round(parseFloat(mOk[1]) * 1e8);
      found = true;
    }
    const mMan = z.match(/(\d+(?:\.\d+)?)\s*万(?!円?未満)/);
    if (mMan) {
      yen += Math.round(parseFloat(mMan[1]) * 1e4);
      found = true;
    }
    const mSen = z.match(/(\d+(?:\.\d+)?)\s*千(?!円?未満)/);
    if (mSen) {
      yen += Math.round(parseFloat(mSen[1]) * 1e3);
      found = true;
    }

    if (!found) {
      const m = z.match(/(\d+(?:\.\d+)?)(?=\s*円|$)/);
      if (m) {
        yen = Math.round(parseFloat(m[1]));
        found = true;
      }
    }
    return found ? yen : null;
  } catch {
    return null;
  }
}

/** ========= LLM業種判定（既存） ========= */
async function classifyIndustryWithLLM(input: {
  companyName: string;
  htmlTop?: string | null;
  htmlAbout?: string | null;
}): Promise<{ large: IndustryLarge; small: string }> {
  const fallback = (): { large: IndustryLarge; small: string } => {
    const txt = [input.htmlTop || "", input.htmlAbout || ""]
      .join(" ")
      .toLowerCase();
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

/** ========= 近似企業 保存（新規かどうか返す） ========= */
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
): Promise<{ inserted: boolean }> {
  const now = new Date().toISOString();
  const payload = {
    ...p,
    found_website: normalizeUrl(p.found_website)!,
    matched_addr: !!p.matched_addr,
    reasons: p.reasons ?? ["社名不一致だがコンタクト手段あり"],
    created_at: now,
    updated_at: now,
  };

  const { error: insErr } = await sb.from("form_similar_sites").insert(payload);
  if (!insErr) return { inserted: true };

  if ((insErr as any)?.code === "23505") {
    const { error: updErr } = await sb
      .from("form_similar_sites")
      .update({
        target_corporate_number: payload.target_corporate_number ?? null,
        target_company_name: payload.target_company_name ?? null,
        target_hq_address: payload.target_hq_address ?? null,
        found_company_name: payload.found_company_name ?? null,
        source_site: payload.source_site ?? null,
        matched_addr: payload.matched_addr,
        matched_company_ratio: payload.matched_company_ratio ?? null,
        contact_form_url: payload.contact_form_url ?? null,
        contact_email: payload.contact_email ?? null,
        phone: payload.phone ?? null,
        reasons: payload.reasons,
        updated_at: now,
      })
      .eq("tenant_id", payload.tenant_id)
      .eq("found_website", payload.found_website);
    if (updErr) throw new Error(updErr.message);
    return { inserted: false };
  }

  throw new Error(insErr.message);
}

/** ========= prospects 既存確認 & upsert（重複耐性） ========= */
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

/** ========= “今回追加”の form_prospects（表＆カウント用） ========= */
async function loadRecentProspects(
  sb: SupabaseClient,
  tenant_id: string,
  sinceISO: string
): Promise<{ rows: AddedRow[]; count: number }> {
  const sel =
    "id,tenant_id,company_name,website,contact_email,contact_form_url,phone,industry,company_size,prefectures,job_site_source,corporate_number,hq_address,capital,established_on,created_at";
  const { data, error } = await sb
    .from("form_prospects")
    .select(sel)
    .eq("tenant_id", tenant_id)
    .gte("created_at", sinceISO)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw new Error(error.message);

  const { count: cnt, error: e2 } = await sb
    .from("form_prospects")
    .select("*", { count: "exact", head: true })
    .eq("tenant_id", tenant_id)
    .gte("created_at", sinceISO);
  if (e2) throw new Error(e2.message);
  return { rows: (data || []) as AddedRow[], count: cnt || 0 };
}

/** ========= “今回追加”の近似サイト数（DBの新規件数） ========= */
async function loadRecentSimilarCount(
  sb: SupabaseClient,
  tenant_id: string,
  sinceISO: string
): Promise<number> {
  const { count, error } = await sb
    .from("form_similar_sites")
    .select("*", { count: "exact", head: true })
    .eq("tenant_id", tenant_id)
    .gte("created_at", sinceISO);
  if (error) throw new Error(error.message);
  return count || 0;
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

    // since はフロントの「開始する」押下時刻（修正2）
    const body = (await req.json().catch(() => ({}))) as EnrichBody;
    const since =
      typeof body?.since === "string"
        ? body.since
        : new Date(Date.now() - 1 * 60 * 1000).toISOString(); // fallbackは直近1分
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

      // 2.5) トップ/概要/お問い合わせ HTML
      const prof = await profileScrape(website);

      // 3) トップHTMLに社名無し → 近似保存（フォーム or メールがある場合のみ）
      if (!htmlContainsCompany(prof.htmlTop, name)) {
        const hasContact = !!(prof.contact_form_url || prof.contact_email);
        if (hasContact) {
          try {
            const r = await upsertSimilarSite(sb, {
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
            if (r.inserted) nearMissSaved += 1;
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

      // 4) 連絡先メールはサイトドメイン or gmail のみ
      let contact_email: string | null = null;
      if (
        prof.contact_email &&
        website &&
        emailDomainOK(prof.contact_email, website)
      ) {
        contact_email = prof.contact_email.toLowerCase();
      } else if (
        website &&
        (prof.htmlContact || prof.htmlAbout || prof.htmlTop)
      ) {
        const pool = [prof.htmlContact, prof.htmlAbout, prof.htmlTop]
          .filter(Boolean)
          .join("\n");
        const found = pool.match(EMAIL_RE) || [];
        const uniq = Array.from(new Set(found.map((x) => x.toLowerCase())));
        const site = website as string;
        contact_email = uniq.find((e) => emailDomainOK(e, site)) || null;
      }

      // 5) 都道府県・業種（本店所在地はNTAの住所を使用）
      const pref = extractPrefecture(c.address);
      let industryValue: string | null = null;
      if (tryLLM) {
        const cls = await classifyIndustryWithLLM({
          companyName: name,
          htmlTop: prof.htmlTop,
          htmlAbout: prof.htmlAbout,
        });
        industryValue = `${cls.large} / ${cls.small}`;
      }

      // 6) UPSERT
      try {
        const { saved } = await upsertProspectSafe(sb, {
          tenant_id: tenantId,
          company_name: name,
          website,
          job_site_source: (source || "google") as "google" | "map",
          corporate_number: (c.corporate_number || "").trim() || null,
          hq_address: c.address || null, // ← 固定：NTA
          contact_email,
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

    // 不適合の保存（失敗しても継続）
    for (const r of rejected) {
      try {
        await insertRejected(sb, { ...r, tenant_id: tenantId });
      } catch {}
    }

    // ✅ フロントが採用する最新“今回追加”（since 以降） & 近似サイト新規数
    const recent = await loadRecentProspects(sb, tenantId, since);
    const recentSimilarCount = await loadRecentSimilarCount(
      sb,
      tenantId,
      since
    );

    return NextResponse.json(
      {
        rows, // 参考
        rejected,
        inserted, // このAPI内での新規保存件数
        // ▼ フロント採用
        recent_rows: recent.rows,
        recent_count: recent.count,
        recent_similar_count: recentSimilarCount,
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
