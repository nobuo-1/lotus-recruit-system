// web/src/app/api/form-outreach/companies/enrich/route.ts
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

/** ===== Types ===== */
type Filters = {
  prefectures?: string[];
  employee_size_ranges?: string[];
  keywords?: string[];
  industries_large?: string[];
  industries_small?: string[];
  capital_min?: number | null;
  capital_max?: number | null;
  established_from?: string | null; // yyyy-mm-dd 期待
  established_to?: string | null;
};

type ProspectRow = {
  id: string;
  tenant_id: string;
  company_name: string | null;
  website: string | null;
  contact_form_url: string | null;
  contact_email: string | null;
  phone_number: string | null; // ← 追加
  industry: string | null;
  company_size: string | null;
  job_site_source: string | null;
  status: string | null;
  created_at: string | null;
  updated_at: string | null;
  prefectures: string[] | null;
  corporate_number: string | null;
  hq_address: string | null;
  capital: number | null;
  established_on: string | null;
};

function getAdmin(): { sb: any; usingServiceRole: boolean } {
  if (!SUPABASE_URL) throw new Error("NEXT_PUBLIC_SUPABASE_URL is missing");
  if (SERVICE_ROLE)
    return {
      sb: createClient(SUPABASE_URL, SERVICE_ROLE) as any,
      usingServiceRole: true,
    };
  if (!ANON_KEY)
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_ANON_KEY missing"
    );
  return {
    sb: createClient(SUPABASE_URL, ANON_KEY) as any,
    usingServiceRole: false,
  };
}

function okUuid(s: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(s || "").trim()
  );
}

/** --- 都道府県抽出 --- */
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
function extractPrefectures(addr?: string | null): string[] | null {
  if (!addr) return null;
  const a = String(addr);
  const hit = PREFS.find((p) => a.includes(p));
  return hit ? [hit] : null;
}

/** --- HTTP helpers --- */
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome Safari";
async function fetchWithTimeout(url: string, init: any = {}, ms = 10000) {
  const ctl = new AbortController();
  const id = setTimeout(() => ctl.abort(), ms);
  try {
    return await fetch(url, {
      ...init,
      signal: ctl.signal,
      headers: {
        "user-agent": UA,
        "accept-language": "ja-JP,ja;q=0.9",
        ...(init?.headers || {}),
      },
    });
  } finally {
    clearTimeout(id);
  }
}

/** --- テキスト正規化 & 抽出 --- */
function htmlToText(html: string): string {
  return (html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .replace(/&nbsp;/g, " ")
    .trim();
}
function firstMatch(re: RegExp, s: string): string | null {
  const m = re.exec(s);
  return m ? m[0] : null;
}
function extractEmail(s: string): string | null {
  const m = s.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return m ? m[0].toLowerCase() : null;
}
function extractPhoneJP(s: string): string | null {
  const re =
    /(?:\+81[-\s]?)?0\d{1,4}[-\s]?\d{1,4}[-\s]?\d{3,4}|\(0\d{1,4}\)\s?\d{1,4}-\d{3,4}/;
  const m = s.match(re);
  return m ? m[0].replace(/\s+/g, "") : null;
}
function extractEstablishedOn(s: string): string | null {
  // 例: 1998年3月12日, 2001年7月, 2010年
  const ymd = /(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日/.exec(s);
  if (ymd) {
    const y = Number(ymd[1]),
      m = Number(ymd[2]),
      d = Number(ymd[3]);
    const mm = String(m).padStart(2, "0");
    const dd = String(d).padStart(2, "0");
    return `${y}-${mm}-${dd}`;
  }
  const ym = /(\d{4})年\s*(\d{1,2})月/.exec(s);
  if (ym) {
    const y = Number(ym[1]),
      m = Number(ym[2]);
    const mm = String(m).padStart(2, "0");
    return `${y}-${mm}-01`;
  }
  const yonly = /(\d{4})年/.exec(s);
  if (yonly) return `${yonly[1]}-01-01`;
  return null;
}
function extractCapitalJPY(s: string): number | null {
  // 例: 資本金 3,000万円 / 1億2,000万円 / 5,000,000円
  const block = /資本金[^\d]*([\d,\.]+)\s*(億|万)?\s*円/.exec(s);
  if (!block) return null;
  const raw = Number((block[1] || "0").replace(/[^\d\.]/g, ""));
  const unit = block[2] || "";
  if (unit === "億") return Math.round(raw * 100_000_000);
  if (unit === "万") return Math.round(raw * 10_000);
  return Math.round(raw);
}
function extractIndustry(s: string): string | null {
  // ざっくり。「事業内容」「業種」「会社概要」近傍を拾う簡易版
  const m =
    /(事業内容|業種|事業|事業概要|会社概要)[:：]?\s*([^\n]{2,60})/i.exec(s);
  return m ? m[2].trim() : null;
}

/** --- DuckDuckGoでHP推定 --- */
const DDG = [
  "https://duckduckgo.com/html/?q=",
  "https://html.duckduckgo.com/html/?q=",
];
const BAD_DOMAINS = [
  "nta.go.jp",
  "houjin-bangou.nta.go.jp",
  "ja.wikipedia.org",
  "maps.google",
  "goo.ne.jp",
  "yahoo.co.jp",
  "biz-journal",
  "list-company",
  "corporation-list",
  "jpnumber",
  "mynavi",
  "rikunabi",
  "indeed",
  "en-japan",
];
function hostname(u: string) {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}
function looksLikeCorpSite(u: string): boolean {
  try {
    const h = hostname(u);
    if (!h) return false;
    if (BAD_DOMAINS.some((x) => h.includes(x))) return false;
    return /\.(co\.jp|jp|com|net|biz|io)$/i.test(h);
  } catch {
    return false;
  }
}
async function guessHomepage(
  company: string,
  addr?: string | null
): Promise<string | null> {
  const q = encodeURIComponent(`${company} ${addr || ""} 公式`);
  for (const base of DDG) {
    try {
      const r = await fetchWithTimeout(base + q, {}, 10000);
      if (!r.ok) continue;
      const html = await r.text();
      // DuckDuckGo HTML: <a class="result__a" href="https://example.co.jp/">
      const links = Array.from(
        html.matchAll(/<a[^>]+class=["']result__a["'][^>]+href=["']([^"']+)/gi)
      ).map((m) => m[1]);
      for (const u of links) {
        if (looksLikeCorpSite(u)) return new URL(u).origin; // ルートで返す
      }
      // fallback: 最初の http(s) リンク
      const any = Array.from(
        html.matchAll(/href=["'](https?:\/\/[^"']+)/gi)
      ).map((m) => m[1]);
      for (const u of any) if (looksLikeCorpSite(u)) return new URL(u).origin;
    } catch {}
  }
  return null;
}

/** --- HP内リンクからお問い合わせ/会社概要を探索 --- */
function pickDetailLinks(baseHtml: string, baseUrl: string): string[] {
  const items: string[] = [];
  const re = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]{0,120}?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(baseHtml))) {
    const href = (m[1] || "").trim();
    const text = htmlToText(m[2] || "");
    if (!href) continue;
    if (
      /contact|inquiry|お問い合わせ|問合せ|問合わせ|連絡先|会社概要|about|company|企業情報|corporate/i.test(
        text + " " + href
      )
    ) {
      try {
        const u = new URL(href, baseUrl).toString();
        if (!items.includes(u)) items.push(u);
      } catch {}
    }
  }
  // 典型パスの追加
  [
    "/contact",
    "/inquiry",
    "/about",
    "/company",
    "/corporate",
    "/info",
    "/profile",
    "/お問い合わせ",
  ].forEach((p) => {
    try {
      const u = new URL(p, baseUrl).toString();
      if (!items.includes(u)) items.push(u);
    } catch {}
  });
  return items.slice(0, 6);
}

function passesFilters(
  row: {
    prefectures?: string[] | null;
    capital?: number | null;
    established_on?: string | null;
    industry?: string | null;
    company_name?: string | null;
    website?: string | null;
    textIndex?: string | null; // ページ本文の一部
  },
  filters: Filters | undefined
): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (!filters) return { ok: true, reasons };

  // 都道府県
  if (filters.prefectures && filters.prefectures.length) {
    const pset = new Set((row.prefectures || []).filter(Boolean));
    const target = filters.prefectures.some((p) => pset.has(p));
    if (!target) reasons.push("都道府県がフィルタ対象外");
  }

  // 資本金
  if (filters.capital_min != null && (row.capital ?? 0) < filters.capital_min) {
    if (row.capital != null) reasons.push("資本金が下限未満");
  }
  if (filters.capital_max != null && (row.capital ?? 0) > filters.capital_max) {
    if (row.capital != null) reasons.push("資本金が上限超過");
  }

  // 設立日
  const toDate = (s: string) => new Date(s + "T00:00:00Z").getTime();
  if (filters.established_from && row.established_on) {
    if (toDate(row.established_on) < toDate(filters.established_from)) {
      reasons.push("設立日が範囲より古い");
    }
  }
  if (filters.established_to && row.established_on) {
    if (toDate(row.established_on) > toDate(filters.established_to)) {
      reasons.push("設立日が範囲より新しい");
    }
  }

  // キーワード
  if (filters.keywords && filters.keywords.length) {
    const blob = (
      row.textIndex ||
      row.industry ||
      row.company_name ||
      row.website ||
      ""
    ).toLowerCase();
    const hit = filters.keywords.some((k) =>
      blob.includes(String(k || "").toLowerCase())
    );
    if (!hit) reasons.push("キーワードに合致しない");
  }

  // 業種（簡易：industry文字列に含まれるか）
  if (filters.industries_small && filters.industries_small.length) {
    const s = (row.industry || "").toLowerCase();
    const hit = filters.industries_small.some((k) =>
      s.includes(String(k || "").toLowerCase())
    );
    if (!hit) reasons.push("業種（小分類）が合致しない");
  } else if (filters.industries_large && filters.industries_large.length) {
    const s = (row.industry || "").toLowerCase();
    const hit = filters.industries_large.some((k) =>
      s.includes(String(k || "").toLowerCase())
    );
    if (!hit) reasons.push("業種（大分類）が合致しない");
  }

  return { ok: reasons.length === 0, reasons };
}

export async function POST(req: Request) {
  try {
    const tenantId = req.headers.get("x-tenant-id") || "";
    if (!tenantId || !okUuid(tenantId))
      return NextResponse.json(
        { error: "x-tenant-id required (uuid)" },
        { status: 400 }
      );

    const body: any = await req.json().catch(() => ({}));
    const since: string | null =
      typeof body?.since === "string" ? body.since : null;
    const want: number = Math.max(
      1,
      Math.min(2000, Math.floor(Number(body?.want) || 60))
    );
    const tryLLM: boolean = !!body?.try_llm; // 将来拡張用
    const filters: Filters | undefined = body?.filters;

    const { sb } = getAdmin();
    const nowIso = new Date().toISOString();

    // 1) 直近キャッシュを取得
    let q = (sb as any)
      .from("nta_corporates_cache")
      .select("corporate_number, company_name, address, scraped_at")
      .eq("tenant_id", tenantId)
      .order("scraped_at", { ascending: false })
      .limit(want * 6);
    if (since) q = q.gte("scraped_at", since);

    const { data: cached, error: cacheErr } = await q;
    if (cacheErr)
      return NextResponse.json({ error: cacheErr.message }, { status: 500 });

    const candidates = Array.isArray(cached) ? cached : [];
    if (candidates.length === 0)
      return NextResponse.json(
        { rows: [], inserted: 0, rejected: [] },
        { status: 200 }
      );

    // 2) 既存prospects 排除
    const nums = candidates
      .map((c: any) => String(c.corporate_number || ""))
      .filter((v) => /^\d{13}$/.test(v));
    const { data: existedPros, error: exErr } = await (sb as any)
      .from("form_prospects")
      .select("corporate_number")
      .eq("tenant_id", tenantId)
      .in("corporate_number", nums);
    if (exErr)
      return NextResponse.json({ error: exErr.message }, { status: 500 });
    const existedSet = new Set<string>(
      (existedPros || []).map((r: any) => String(r.corporate_number))
    );

    // 3) HP探索 & 詳細抽出
    const rowsForInsert: any[] = [];
    const rejected: any[] = [];
    const picked = candidates
      .filter((c: any) => !existedSet.has(String(c.corporate_number)))
      .slice(0, want * 2); // HP未発見がある前提で余裕をみる

    for (const c of picked) {
      const corpNo = String(c.corporate_number || "");
      const name = String(c.company_name || "");
      const addr = String(c.address || "");
      const prefs = extractPrefectures(addr);

      // 3-1) HP推定
      let website: string | null = null;
      try {
        website = await guessHomepage(name, addr);
      } catch {}

      if (!website) {
        // HPが見つからない → 不適合に回す
        rejected.push({
          company_name: name,
          website: null,
          contact_email: null,
          contact_form_url: null,
          phone_number: null,
          industry_large: null,
          industry_small: null,
          company_size: null,
          company_size_extracted: null,
          prefectures: prefs,
          corporate_number: corpNo || null,
          hq_address: addr || null,
          capital: null,
          established_on: null,
          reject_reasons: ["公式サイトが見つからない"],
        });
        continue;
      }

      // 3-2) TOP取得
      let baseHtml = "";
      try {
        const r = await fetchWithTimeout(website, {}, 12000);
        if (r.ok) baseHtml = await r.text();
      } catch {}
      const baseText = htmlToText(baseHtml);

      // 3-3) 詳細リンク探索
      const detailLinks = pickDetailLinks(baseHtml, website);

      // 3-4) 詳細抽出
      let contactFormUrl: string | null = null;
      let phone: string | null = extractPhoneJP(baseText);
      let email: string | null = extractEmail(baseText);
      let est: string | null = extractEstablishedOn(baseText);
      let cap: number | null = extractCapitalJPY(baseText);
      let ind: string | null = extractIndustry(baseText);

      for (const u of detailLinks) {
        try {
          const r = await fetchWithTimeout(u, {}, 10000);
          if (!r.ok) continue;
          const html = await r.text();
          const text = htmlToText(html);

          if (
            !contactFormUrl &&
            /問い合わせ|contact|inquiry|フォーム/i.test(text)
          )
            contactFormUrl = u;
          if (!phone) phone = extractPhoneJP(text);
          if (!email) email = extractEmail(text);
          if (!est) est = extractEstablishedOn(text);
          if (cap == null) cap = extractCapitalJPY(text);
          if (!ind) ind = extractIndustry(text);

          // 大体揃ったら打ち切り
          if (phone && (email || contactFormUrl) && (est || cap) && ind) break;
        } catch {}
      }

      // 3-5) フィルタ適合判定
      const { ok, reasons } = passesFilters(
        {
          prefectures: prefs,
          capital: cap,
          established_on: est || null,
          industry: ind,
          company_name: name,
          website,
          textIndex: baseText.slice(0, 2000),
        },
        filters
      );

      if (!ok) {
        rejected.push({
          company_name: name,
          website,
          contact_email: email,
          contact_form_url: contactFormUrl,
          phone_number: phone,
          industry_large: null,
          industry_small: null,
          company_size: null,
          company_size_extracted: null,
          prefectures: prefs,
          corporate_number: corpNo || null,
          hq_address: addr || null,
          capital: cap,
          established_on: est,
          reject_reasons: reasons.length ? reasons : ["フィルタに不適合"],
        });
        continue;
      }

      // 3-6) prospects upsert 用データ
      rowsForInsert.push({
        tenant_id: tenantId,
        company_name: name || null,
        website: website || null,
        contact_form_url: contactFormUrl || null,
        contact_email: email || null,
        phone_number: phone || null, // ← 追加
        industry: ind || null,
        company_size: null,
        job_site_source: "nta-crawl",
        status: "new",
        created_at: nowIso,
        updated_at: nowIso,
        prefectures: prefs,
        corporate_number: corpNo || null,
        hq_address: addr || null,
        capital: cap,
        established_on: est,
      });

      if (rowsForInsert.length >= want) break; // 目標到達
    }

    // 4) DB保存
    let rows: ProspectRow[] = [];
    let inserted = 0;
    if (rowsForInsert.length) {
      const ins = await (sb as any)
        .from("form_prospects")
        .upsert(rowsForInsert, {
          onConflict: "tenant_id,corporate_number",
          ignoreDuplicates: true,
        })
        .select(
          "id,tenant_id,company_name,website,contact_form_url,contact_email,phone_number,industry,company_size,job_site_source,status,created_at,updated_at,prefectures,corporate_number,hq_address,capital,established_on"
        );

      if (ins.error) {
        if (/no unique|ON CONFLICT/i.test(ins.error.message || "")) {
          const ins2 = await (sb as any)
            .from("form_prospects")
            .insert(rowsForInsert)
            .select(
              "id,tenant_id,company_name,website,contact_form_url,contact_email,phone_number,industry,company_size,job_site_source,status,created_at,updated_at,prefectures,corporate_number,hq_address,capital,established_on"
            );
          if (ins2.error)
            return NextResponse.json(
              { error: ins2.error.message },
              { status: 500 }
            );
          rows = Array.isArray(ins2.data) ? ins2.data : [];
          inserted = rows.length;
        } else {
          return NextResponse.json(
            { error: ins.error.message },
            { status: 500 }
          );
        }
      } else {
        rows = Array.isArray(ins.data) ? ins.data : [];
        inserted = rows.length;
      }
    }

    return NextResponse.json({ rows, inserted, rejected }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { error: String(e?.message || e) },
      { status: 500 }
    );
  }
}
