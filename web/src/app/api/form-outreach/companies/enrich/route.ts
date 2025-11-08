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
  established_from?: string | null;
  established_to?: string | null;
};

type ProspectRow = {
  id: string;
  tenant_id: string;
  company_name: string | null;
  website: string | null;
  contact_form_url: string | null;
  contact_email: string | null;
  phone_number: string | null;
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
  phone?: string | null;
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

/** --- HTTP helpers（短めのタイムアウトを既定化） --- */
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome Safari";
async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  ms = 6000
) {
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
function extractEmailFromText(s: string): string | null {
  const m = s.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return m ? m[0].toLowerCase() : null;
}
function extractMailtoAll(html: string): string[] {
  const out: string[] = [];
  const re = /href=["']mailto:([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const addr = decodeURIComponent((m[1] || "").trim());
    if (addr && /^[^@]+@[^@]+$/.test(addr)) out.push(addr.toLowerCase());
  }
  return Array.from(new Set(out));
}
function extractTelAll(html: string): string[] {
  const out: string[] = [];
  const re = /href=["']tel:([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const tel = (m[1] || "").trim().replace(/\s+/g, "");
    if (tel) out.push(tel);
  }
  return Array.from(new Set(out));
}
function extractPhoneJP(s: string): string | null {
  const re =
    /(?:\+81[-\s]?)?0\d{1,4}[-\s]?\d{1,4}[-\s]?\d{3,4}|\(0\d{1,4}\)\s?\d{1,4}-\d{3,4}/;
  const m = s.match(re);
  return m ? m[0].replace(/\s+/g, "") : null;
}
function extractEstablishedOn(s: string): string | null {
  const ymd = /(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日/.exec(s);
  if (ymd) {
    const y = Number(ymd[1]),
      m = Number(ymd[2]),
      d = Number(ymd[3]);
    return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
  const ym = /(\d{4})年\s*(\d{1,2})月/.exec(s);
  if (ym) return `${ym[1]}-${String(Number(ym[2])).padStart(2, "0")}-01`;
  const yonly = /(\d{4})年/.exec(s);
  if (yonly) return `${yonly[1]}-01-01`;
  return null;
}
function extractCapitalJPY(s: string): number | null {
  const block = /資本金[^\d]*([\d,\.]+)\s*(億|万)?\s*円/.exec(s);
  if (!block) return null;
  const raw = Number((block[1] || "0").replace(/[^\d\.]/g, ""));
  const unit = block[2] || "";
  if (unit === "億") return Math.round(raw * 100_000_000);
  if (unit === "万") return Math.round(raw * 10_000);
  return Math.round(raw);
}
function extractIndustry(s: string): string | null {
  const m =
    /(事業内容|業種|事業|事業概要|会社概要)[:：]?\s*([^\n]{2,60})/i.exec(s);
  return m ? m[2].trim() : null;
}

/** --- DuckDuckGoでHP推定（回数とタイムアウトを短縮） --- */
const DDG = ["https://html.duckduckgo.com/html/?q="];
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
  const queries = [`${company} ${addr || ""} 公式`, `${company} ${addr || ""}`];
  for (const q0 of queries) {
    const q = encodeURIComponent(q0.trim());
    for (const base of DDG) {
      try {
        const r = await fetchWithTimeout(base + q, {}, 5000);
        if (!r.ok) continue;
        const html = await r.text();
        const links = Array.from(
          html.matchAll(
            /<a[^>]+class=["']result__a["'][^>]+href=["']([^"']+)/gi
          )
        ).map((m) => m[1]);
        const any = Array.from(
          html.matchAll(/href=["'](https?:\/\/[^"']+)/gi)
        ).map((m) => m[1]);
        const candidates = [...links, ...any];
        for (const u of candidates) {
          if (!looksLikeCorpSite(u)) continue;
          return new URL(u).origin;
        }
      } catch {}
    }
  }
  return null;
}

/** --- HP内リンクからお問い合わせ/会社概要/メール/電話を探索 --- */
function pickDetailLinks(baseHtml: string, baseUrl: string): string[] {
  const items: string[] = [];
  const re = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]{0,160}?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(baseHtml))) {
    const href = (m[1] || "").trim();
    const text = htmlToText(m[2] || "");
    if (!href) continue;
    if (/^mailto:/i.test(href) || /^tel:/i.test(href)) {
      try {
        const u = new URL(href, baseUrl).toString();
        if (!items.includes(u)) items.push(u);
      } catch {}
      continue;
    }
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
  return items.slice(0, 5);
}

function passesFilters(
  row: {
    prefectures?: string[] | null;
    capital?: number | null;
    established_on?: string | null;
    industry?: string | null;
    company_name?: string | null;
    website?: string | null;
    textIndex?: string | null;
  },
  filters: Filters | undefined
): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (!filters) return { ok: true, reasons };

  if (filters.prefectures && filters.prefectures.length) {
    const pset = new Set((row.prefectures || []).filter(Boolean));
    const target = filters.prefectures.some((p) => pset.has(p));
    if (!target) reasons.push("都道府県がフィルタ対象外");
  }

  if (filters.capital_min != null && (row.capital ?? 0) < filters.capital_min) {
    if (row.capital != null) reasons.push("資本金が下限未満");
  }
  if (filters.capital_max != null && (row.capital ?? 0) > filters.capital_max) {
    if (row.capital != null) reasons.push("資本金が上限超過");
  }

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
    const tryLLM: boolean = !!body?.try_llm;
    const filters: Filters | undefined = body?.filters;

    // 全体ソフトタイムアウト（既定45秒）
    const started = Date.now();
    const SOFT_TIMEOUT_MS = Math.min(
      Math.max(10000, Number(body?.timeout_ms) || 45000),
      54000
    );
    const timeLeft = () => SOFT_TIMEOUT_MS - (Date.now() - started);
    const timedOut = () => timeLeft() <= 0;

    const { sb } = getAdmin();
    const nowIso = new Date().toISOString();

    // 1) キャッシュから候補
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

    // 2) 既存prospects / rejected を除外
    const nums = candidates
      .map((c: any) => String(c.corporate_number || ""))
      .filter((v) => /^\d{13}$/.test(v));

    const [{ data: existedPros }, { data: existedRej }] = await Promise.all([
      (sb as any)
        .from("form_prospects")
        .select("corporate_number")
        .eq("tenant_id", tenantId)
        .in("corporate_number", nums),
      (sb as any)
        .from("form_prospects_rejected")
        .select("corporate_number")
        .eq("tenant_id", tenantId)
        .in("corporate_number", nums),
    ]);

    const existedProsSet = new Set<string>(
      (existedPros || []).map((r: any) => String(r.corporate_number))
    );
    const existedRejSet = new Set<string>(
      (existedRej || []).map((r: any) => String(r.corporate_number))
    );

    // 3) HP探索 & 詳細抽出
    const rowsForInsert: any[] = [];
    const rejected: any[] = [];

    // 処理プールを十分に確保（want*4）
    const picked = candidates
      .filter(
        (c: any) =>
          !existedProsSet.has(String(c.corporate_number)) &&
          !existedRejSet.has(String(c.corporate_number))
      )
      .slice(0, want * 4);

    for (const c of picked) {
      if (timedOut()) break;

      const corpNo = String(c.corporate_number || "");
      const name = String(c.company_name || "");
      const addr = String(c.address || "");
      const prefs = extractPrefectures(addr);

      // 3-1) HP推定
      let website: string | null = null;
      try {
        if (timeLeft() > 2000) {
          website = await guessHomepage(name, addr);
        }
      } catch {}

      if (!website) {
        rejected.push({
          tenant_id: tenantId,
          corporate_number: corpNo || null,
          company_name: name,
          website: null,
          contact_email: null,
          phone: null,
          contact_form_url: null,
          industry_large: null,
          industry_small: null,
          company_size: null,
          company_size_extracted: null,
          prefectures: prefs,
          hq_address: addr || null,
          capital: null,
          established_on: null,
          source_site: "nta-crawl",
          reject_reasons: ["公式サイトが見つからない"],
          created_at: nowIso,
          updated_at: nowIso,
        });
        if (rowsForInsert.length + rejected.length >= want) break;
        continue;
      }

      // 3-2) TOP取得
      let baseHtml = "";
      try {
        const r = await fetchWithTimeout(
          website,
          {},
          Math.min(7000, timeLeft())
        );
        if (r.ok) baseHtml = await r.text();
      } catch {}
      const baseText = htmlToText(baseHtml);

      // mailto / tel を先に抽出
      let email: string | null =
        extractMailtoAll(baseHtml)[0] || extractEmailFromText(baseText);
      let phoneNum: string | null =
        extractTelAll(baseHtml)[0] || extractPhoneJP(baseText);

      // 3-3) 詳細リンク
      const detailLinks = pickDetailLinks(baseHtml, website);

      // 3-4) 詳細抽出
      let contactFormUrl: string | null = null;
      let est: string | null = extractEstablishedOn(baseText);
      let cap: number | null = extractCapitalJPY(baseText);
      let ind: string | null = extractIndustry(baseText);

      for (const u of detailLinks) {
        if (timedOut()) break;

        try {
          if (/^mailto:/i.test(u)) {
            if (!email)
              email = u
                .replace(/^mailto:/i, "")
                .trim()
                .toLowerCase();
            continue;
          }
          if (/^tel:/i.test(u)) {
            if (!phoneNum) phoneNum = u.replace(/^tel:/i, "").trim();
            continue;
          }

          const r = await fetchWithTimeout(u, {}, Math.min(6000, timeLeft()));
          if (!r.ok) continue;
          const html = await r.text();
          const text = htmlToText(html);

          if (
            !contactFormUrl &&
            /問い合わせ|contact|inquiry|フォーム/i.test(text)
          )
            contactFormUrl = u;
          if (!phoneNum)
            phoneNum = extractTelAll(html)[0] || extractPhoneJP(text);
          if (!email)
            email = extractMailtoAll(html)[0] || extractEmailFromText(text);
          if (!est) est = extractEstablishedOn(text);
          if (cap == null) cap = extractCapitalJPY(text);
          if (!ind) ind = extractIndustry(text);

          if (phoneNum && (email || contactFormUrl) && (est || cap) && ind)
            break;
        } catch {}
      }

      // 3-5) フィルタ適合
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
          tenant_id: tenantId,
          corporate_number: corpNo || null,
          company_name: name,
          website,
          contact_email: email,
          phone: phoneNum,
          contact_form_url: contactFormUrl,
          industry_large: null,
          industry_small: null,
          company_size: null,
          company_size_extracted: null,
          prefectures: prefs,
          hq_address: addr || null,
          capital: cap,
          established_on: est,
          source_site: "nta-crawl",
          reject_reasons: reasons.length ? reasons : ["フィルタに不適合"],
          created_at: nowIso,
          updated_at: nowIso,
        });
        if (rowsForInsert.length + rejected.length >= want) break;
        continue;
      }

      // 3-6) prospects upsert 用データ
      rowsForInsert.push({
        tenant_id: tenantId,
        company_name: name || null,
        website: website || null,
        contact_form_url: contactFormUrl || null,
        contact_email: email || null,
        phone_number: phoneNum || null,
        phone: phoneNum || null,
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

      if (rowsForInsert.length + rejected.length >= want) break;
    }

    // 4) DB保存（prospects）
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
          "id,tenant_id,company_name,website,contact_form_url,contact_email,phone_number,phone,industry,company_size,job_site_source,status,created_at,updated_at,prefectures,corporate_number,hq_address,capital,established_on"
        );

      if (ins.error) {
        if (/no unique|ON CONFLICT/i.test(ins.error.message || "")) {
          const ins2 = await (sb as any)
            .from("form_prospects")
            .insert(rowsForInsert)
            .select(
              "id,tenant_id,company_name,website,contact_form_url,contact_email,phone_number,phone,industry,company_size,job_site_source,status,created_at,updated_at,prefectures,corporate_number,hq_address,capital,established_on"
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

    // 5) DB保存（rejected）— ★一意制約が無い場合のフォールバックを追加
    let rejected_saved = 0;
    if (rejected.length) {
      const tryUpsertRejected = async () => {
        const { data, error } = await (sb as any)
          .from("form_prospects_rejected")
          .upsert(rejected, {
            onConflict: "tenant_id,corporate_number",
            ignoreDuplicates: true,
          })
          .select("corporate_number");
        return { data, error };
      };

      let { data: rdata, error: rerr } = await tryUpsertRejected();

      if (rerr && /no unique|ON CONFLICT/i.test(rerr.message || "")) {
        const insr = await (sb as any)
          .from("form_prospects_rejected")
          .insert(rejected)
          .select("corporate_number");
        rdata = insr.data;
        rerr = insr.error;
      }

      if (rerr) {
        return NextResponse.json(
          {
            error: rerr.message,
            rows,
            inserted,
            rejected_attempted: rejected.length,
          },
          { status: 500 }
        );
      }

      rejected_saved = Array.isArray(rdata) ? rdata.length : 0;
    }

    return NextResponse.json(
      {
        rows,
        inserted,
        rejected,
        rejected_saved,
        processed_total: rowsForInsert.length + rejected.length,
        want,
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
