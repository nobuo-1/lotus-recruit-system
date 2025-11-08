// web/src/app/api/form-outreach/companies/enrich/route.ts
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/** ---------- Types ---------- */
type Candidate = {
  company_name: string;
  website?: string | null;
  contact_email?: string | null;
  contact_form_url?: string | null;
  prefectures?: string[];
  company_size?: string | null;
  company_size_extracted?: string | null;
  corporate_number?: string | null;
  hq_address?: string | null;
  capital?: number | null;
  established_on?: string | null;
};

type CacheHit = {
  corporate_number: string;
  company_name: string | null;
  address: string | null;
  detail_url: string | null;
  scraped_at: string | null;
};

/** ---------- ENV ---------- */
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";

/** ---------- Utils ---------- */
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)";
const LANG = "ja-JP,ja;q=0.9";

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
function extractCompanySizeToRange(
  text: string
): "1-9" | "10-49" | "50-249" | "250+" | null {
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
  return hit.slice(0, 4);
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  ms = 12_000
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

/** LLM: 公式HP推定（空でOK） */
async function resolveHomepageWithLLM(c: {
  company_name: string;
  hq_address?: string | null;
  corporate_number?: string | null;
}): Promise<string | undefined> {
  if (!OPENAI_API_KEY) return;
  try {
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
    if (!res.ok) return;
    const txt = await res.text();
    const j = JSON.parse(txt);
    const content = j?.choices?.[0]?.message?.content ?? "{}";
    const payload = JSON.parse(content);
    return normalizeUrl(payload?.website);
  } catch {
    return;
  }
}

async function verifyAndEnrichSite(site: string) {
  try {
    const r = await fetchWithTimeout(site, {}, 12_000);
    if (!r.ok) return null;
    const html = await r.text();
    const text = textFromHtml(html);
    let host = "";
    try {
      host = new URL(site).host;
    } catch {}
    const emails = extractEmailsFrom(html, text, host);

    // 「会社概要」ページを探す（リンク探索＋HEADフォールバック）
    const contactForm = await (async () => {
      const links =
        html.match(/<a\s+[^>]*href=["'][^"']+["'][^>]*>[\s\S]*?<\/a>/gi) || [];
      const find = (href: string, label: string) =>
        /contact|inquiry|お問い合わせ|お問合せ|問合せ/i.test(
          href + " " + label
        );
      for (const a of links) {
        const href = /href=["']([^"']+)["']/.exec(a)?.[1] || "";
        const label = a
          .replace(/<[^>]*>/g, " ")
          .trim()
          .slice(0, 160);
        try {
          const abs = new URL(href, site).toString();
          if (find(abs, label)) return abs;
        } catch {}
      }
      for (const p of [
        "/contact",
        "/contact-us",
        "/inquiry",
        "/inquiries",
        "/お問い合わせ",
        "/お問合せ",
        "/問合せ",
      ]) {
        try {
          const u = new URL(p, site).toString();
          const rr = await fetchWithTimeout(u, { method: "HEAD" }, 5000);
          if (rr.ok) return u;
        } catch {}
      }
      return null;
    })();

    // 会社概要に行って従業員・資本金・支店住所など抽出（ゆるく）
    const profileUrl = await (async () => {
      const links =
        html.match(/<a\s+[^>]*href=["'][^"']+["'][^>]*>[\s\S]*?<\/a>/gi) || [];
      const find = (href: string, label: string) =>
        /会社概要|corporate|company|about|企業情報/i.test(href + " " + label);
      for (const a of links) {
        const href = /href=["']([^"']+)["']/.exec(a)?.[1] || "";
        const label = a
          .replace(/<[^>]*>/g, " ")
          .trim()
          .slice(0, 160);
        try {
          const abs = new URL(href, site).toString();
          if (find(abs, label)) return abs;
        } catch {}
      }
      return null;
    })();

    let extracted = {
      size: null as ReturnType<typeof extractCompanySizeToRange> | null,
      cap: null as number | null,
      est: null as string | null,
      branchPrefs: [] as string[],
    };
    if (profileUrl) {
      try {
        const pr = await fetchWithTimeout(profileUrl, {}, 10_000);
        if (pr.ok) {
          const phtml = await pr.text();
          const ptext = textFromHtml(phtml);
          extracted.size = extractCompanySizeToRange(ptext);
          extracted.cap = extractCapital(ptext);
          extracted.est = extractEstablishedOn(ptext);
          // 支店/拠点の都道府県をざっくり拾う
          const pf = prefecturesFromAddress(ptext);
          extracted.branchPrefs = pf;
        }
      } catch {}
    }

    return {
      contact_email: emails[0] ?? null,
      contact_form_url: contactForm,
      company_size_extracted: extracted.size,
      capital: extracted.cap,
      established_on: extracted.est,
      branch_prefectures: extracted.branchPrefs,
    };
  } catch {
    return null;
  }
}

/** ---------- Handler: POST ---------- */
export async function POST(req: Request) {
  const trace: string[] = [];
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
    const want: number = Math.max(
      1,
      Math.min(200, Math.floor(Number(body?.want) || 30))
    );
    const fromNumbers: string[] = Array.isArray(body?.from_cache_numbers)
      ? body.from_cache_numbers
      : [];
    const since: string | null =
      typeof body?.since === "string" ? body.since : null;
    const tryLLM: boolean = body?.try_llm !== false; // 既定: LLMを使用

    const admin: any = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // すでにprospectsへ入っているcorporate_number
    const { data: exPros, error: exProsErr } = await admin
      .from("form_prospects")
      .select("corporate_number, website")
      .eq("tenant_id", tenantId);
    if (exProsErr)
      return NextResponse.json({ error: exProsErr.message }, { status: 500 });
    const existingCorp = new Set(
      (exPros || [])
        .map((r: any) => String(r.corporate_number || "").trim())
        .filter(Boolean)
    );
    const existingWeb = new Set(
      (exPros || [])
        .map((r: any) => String(r.website || "").toLowerCase())
        .filter(Boolean)
    );

    // キャッシュから「今回対象」を取り出す
    let query = admin
      .from("nta_corporates_cache")
      .select("corporate_number, company_name, address, detail_url, scraped_at")
      .eq("tenant_id", tenantId)
      .order("scraped_at", { ascending: false })
      .limit(600);
    if (since) query = query.gte("scraped_at", since);
    const { data: cacheRows, error: cacheErr } = await query;
    if (cacheErr)
      return NextResponse.json({ error: cacheErr.message }, { status: 500 });

    // from_cache_numbers が来ていればそれを優先フィルタ
    const pool: CacheHit[] = (cacheRows || []).filter((r: any) =>
      fromNumbers.length
        ? fromNumbers.includes(String(r.corporate_number))
        : true
    );

    const targets: CacheHit[] = [];
    for (const r of pool) {
      if (targets.length >= want) break;
      const num = String(r.corporate_number || "").trim();
      if (!/^\d{13}$/.test(num)) continue;
      if (existingCorp.has(num)) continue;
      targets.push({
        corporate_number: num,
        company_name: r.company_name,
        address: r.address,
        detail_url: r.detail_url,
        scraped_at: r.scraped_at,
      });
    }
    trace.push(`targets=${targets.length}`);

    // LLMでHP推定
    const withSite: Array<Candidate> = [];
    for (const t of targets) {
      let website: string | undefined;
      if (tryLLM && t.company_name) {
        website = await resolveHomepageWithLLM({
          company_name: t.company_name,
          hq_address: t.address ?? undefined,
          corporate_number: t.corporate_number,
        });
      }
      withSite.push({
        company_name: String(t.company_name || ""),
        website: website || null,
        corporate_number: t.corporate_number,
        hq_address: t.address || null,
        prefectures: prefecturesFromAddress(t.address || null),
      });
    }

    // HP到達・抽出
    const accepted: Candidate[] = [];
    const CONC = 6;
    for (let i = 0; i < withSite.length; i += CONC) {
      const chunk = withSite.slice(i, i + CONC);
      const verified = await Promise.all(
        chunk.map(async (c) => {
          const site = normalizeUrl(c.website || undefined);
          if (!site) return null;
          if (existingWeb.has(site.toLowerCase())) return null;
          const ext = await verifyAndEnrichSite(site);
          if (!ext) return null;
          return {
            ...c,
            website: site,
            contact_email: ext.contact_email ?? null,
            contact_form_url: ext.contact_form_url ?? null,
            company_size_extracted: ext.company_size_extracted ?? null,
            capital: ext.capital ?? null,
            established_on: ext.established_on ?? null,
            prefectures: Array.from(
              new Set([
                ...(c.prefectures || []),
                ...(ext.branch_prefectures || []),
              ])
            ),
          } as Candidate;
        })
      );
      for (const v of verified) if (v) accepted.push(v);
      if (accepted.length >= want) break;
    }

    // prospectsへ保存（HP解決できたもの優先。無ければ最低限も保存したいならここで別処理可）
    let inserted = 0;
    let insertedRows: any[] = [];
    if (accepted.length) {
      const rows = accepted.map((c) => ({
        tenant_id: tenantId,
        company_name: c.company_name,
        website: c.website || null,
        contact_form_url: c.contact_form_url ?? null,
        contact_email: c.contact_email ?? null,
        industry: null,
        company_size: c.company_size_extracted ?? null,
        job_site_source: "nta-cache+web",
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
        trace.push(`prospects_upsert_error:${error.message}`);
      } else {
        inserted = (data || []).length;
        insertedRows = data || [];
        for (const it of data || []) {
          if (it.website) existingWeb.add(String(it.website).toLowerCase());
          if (it.corporate_number)
            existingCorp.add(String(it.corporate_number));
        }
      }
    }

    return NextResponse.json({
      accepted: accepted.length,
      inserted,
      rows: insertedRows,
      trace,
    });
  } catch (e: unknown) {
    const msg = (e as Error)?.message || String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
