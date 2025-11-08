// web/src/app/api/form-outreach/companies/fetch/route.ts
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs/promises";
import path from "node:path";

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
  capital?: number | null; // JPY
  established_on?: string | null; // YYYY-MM-DD
};

type Rejected = Candidate & { reject_reasons: string[] };

type CacheRow = {
  id?: string | null;
  tenant_id?: string | null;
  corporate_number: string | null;
  company_name: string | null;
  address: string | null;
  detail_url: string | null;
  source: string | null;
  scraped_at: string | null;
};

/** ---------- ENV ---------- */
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// 任意：あればHP解決に使う。未設定でも可。
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";

/** ---------- Utils ---------- */
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const clamp = (n: unknown, min: number, max: number) =>
  Math.max(min, Math.min(max, Math.floor(Number(n) || 0)));

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

function prefecturesFromAddress(addr?: string | null): string[] {
  if (!addr) return [];
  const hit = JP_PREFS.filter((p) => addr.includes(p));
  return hit.length ? hit.slice(0, 2) : [];
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
      signal: ctl.signal,
      headers: {
        "user-agent":
          (init.headers as Record<string, string> | undefined)?.[
            "user-agent"
          ] || "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
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

  // mailto:
  const mailtoRe = /href=["']mailto:([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = mailtoRe.exec(html))) {
    const raw = decodeURIComponent(m[1] || "");
    for (const e of deob(raw).match(re) ?? []) pool.add(e);
  }
  // JSON-LD
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

function resolveLinks(html: string, base: string) {
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
async function findContactForm(url: string, html: string) {
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

/** ---------- JSONL → キャッシュ（nta_corporates_cache）ブートストラップ ---------- */
async function bootstrapCacheFromFiles(
  sb: any,
  tenantId: string,
  prefFilter?: string[]
): Promise<{ inserted: number; files: number }> {
  const root = path.resolve(process.cwd(), "data", "cache");
  let dir: string[] = [];
  try {
    dir = await fs.readdir(root);
  } catch {
    return { inserted: 0, files: 0 }; // ディレクトリなし
  }

  const files = dir.filter((n) => /\.jsonl$/i.test(n));
  if (!files.length) return { inserted: 0, files: 0 };

  let inserted = 0;
  let seenLine = 0;

  // ざっくり prefectures でファイル名フィルタ（なければ全読み）
  const prefSet = new Set((prefFilter || []).filter(Boolean));
  const targets = files.filter((n) => {
    if (!prefSet.size) return true;
    return [...prefSet].some((p) => n.includes(p));
  });

  for (const name of targets) {
    const full = path.join(root, name);
    let text = "";
    try {
      text = await fs.readFile(full, "utf8");
    } catch {
      continue;
    }
    const lines = text.split(/\r?\n/).filter(Boolean);
    if (!lines.length) continue;

    // JSONL → バルク upsert
    const batch: CacheRow[] = [];
    for (const ln of lines) {
      seenLine++;
      try {
        const j = JSON.parse(ln);
        const corporate_number = (j.corporate_number ?? "").trim() || null;
        const company_name = (j.name ?? "").trim() || null;
        const address = j.address || null;
        const detail_url = j.source_url || null;
        const source = "nta-jsonl";
        const scraped_at = j.scraped_at || new Date().toISOString();
        if (!corporate_number || !company_name) continue;

        batch.push({
          tenant_id: tenantId,
          corporate_number,
          company_name,
          address,
          detail_url,
          source,
          scraped_at,
        });
      } catch {}
      if (batch.length >= 800) {
        const { error } = await sb
          .from("nta_corporates_cache")
          .upsert(batch as any, { onConflict: "tenant_id,corporate_number" });
        if (!error) inserted += batch.length;
        batch.length = 0;
        await sleep(10);
      }
    }
    if (batch.length) {
      const { error } = await sb
        .from("nta_corporates_cache")
        .upsert(batch as any, { onConflict: "tenant_id,corporate_number" });
      if (!error) inserted += batch.length;
    }
  }
  return { inserted, files: targets.length };
}

/** キャッシュから候補を作る（pref フィルタ対応・乱択） */
async function pickCandidatesFromCache(
  sb: any,
  tenantId: string,
  filters: Filters,
  want: number,
  seed: string
): Promise<Candidate[]> {
  const take = Math.max(want * 50, 300);
  let q = sb
    .from("nta_corporates_cache")
    .select("corporate_number, company_name, address")
    .eq("tenant_id", tenantId)
    .order("scraped_at", { ascending: false })
    .limit(take);

  const { data, error } = await q;
  if (error || !Array.isArray(data) || data.length === 0) return [];

  // 都道府県フィルタ
  const prefSet = new Set((filters.prefectures || []).filter(Boolean));
  const pool = (data as any[]).map((r) => ({
    company_name: String(r.company_name || ""),
    corporate_number: String(r.corporate_number || ""),
    hq_address: r.address || null,
    prefectures: prefecturesFromAddress(r.address || null),
    website: null,
  }));
  const filtered = prefSet.size
    ? pool.filter((c) => (c.prefectures || []).some((p) => prefSet.has(p)))
    : pool;

  // シャッフル
  const arr = filtered.slice();
  const seedN = Number(String(seed).replace(/\D/g, "")) || Date.now();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = (seedN + i) % (i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, Math.max(want * 3, 80));
}

/** 公式HP 解決（未設定でもOK） */
async function resolveHomepageWithLLM(
  c: Candidate
): Promise<string | undefined> {
  if (!OPENAI_API_KEY) return normalizeUrl(c.website || undefined);
  const sys =
    "You are a helpful assistant. Output STRICT JSON only, no commentary.";
  const prompt = `次の法人の公式ホームページURLを1つ推定してください。不明なら空。
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

/** HP 到達/抽出 */
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

    return {
      ...c,
      website: site,
      contact_email: emails[0] ?? c.contact_email ?? null,
      contact_form_url,
      company_size: sizeExtracted ?? c.company_size ?? null,
      company_size_extracted: sizeExtracted ?? null,
      capital: c.capital ?? extractCapital(text) ?? null,
      established_on: c.established_on ?? extractEstablishedOn(text) ?? null,
    };
  } catch {
    return null;
  }
}

/** 事前フィルタ（資本金/設立） */
function prefilterByRegistry(
  c: Candidate,
  f: Filters
): { ok: boolean; reasons: string[] } {
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

/** 最終フィルタ（AND） */
function matchesFilters(
  c: Candidate,
  f: Filters
): { ok: boolean; reasons: string[] } {
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

  if (f.industries_large?.length) {
    if (!c.industry_large || !f.industries_large.includes(c.industry_large)) {
      reasons.push("業種(大分類)不一致");
    }
  }
  if (f.industries_small?.length) {
    if (!c.industry_small || !f.industries_small.includes(c.industry_small)) {
      reasons.push("業種(小分類)不一致");
    }
  }

  if (f.keywords?.length) {
    const name = (c.company_name || "").toLowerCase();
    let host = "";
    try {
      host = new URL(c.website || "").host.toLowerCase();
    } catch {}
    const ok = f.keywords.some((kw) => {
      const k = String(kw || "").toLowerCase();
      return !!k && (name.includes(k) || host.includes(k));
    });
    if (!ok) reasons.push("キーワード不一致");
  }

  const pre = prefilterByRegistry(c, f);
  if (!pre.ok) reasons.push(...pre.reasons);

  return { ok: reasons.length === 0, reasons };
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

/** ---------- Handler: POST (Batch; NTA API 未使用) ---------- */
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

    const body = await req.json().catch(() => ({}));
    const filters: Filters = body?.filters ?? {};
    const want: number = clamp(body?.want ?? filters.max ?? 12, 1, 200);
    const seed: string = String(body?.seed || Math.random()).slice(2);

    const admin: any = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // ① JSONL → キャッシュへ（初回ブート）※ NTA APIは使わない
    const cacheStat = await bootstrapCacheFromFiles(
      admin,
      tenantId,
      filters.prefectures
    );

    // ② 既存 website / corporate_number を収集（重複避け）
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

    // ③ キャッシュから母集団を作る
    const basePool = await pickCandidatesFromCache(
      admin,
      tenantId,
      filters,
      want,
      seed
    );
    if (!basePool.length) {
      // キャッシュが空
      return NextResponse.json({
        inserted: 0,
        rows: [],
        rejected: [],
        error:
          "候補が見つかりません。NTA API を無効化中のため、web/data/cache/*.jsonl からの取り込みが必要です。",
        note:
          cacheStat.files > 0
            ? `cache_bootstrap: files=${cacheStat.files}, inserted=${cacheStat.inserted}`
            : "cache_bootstrap: no files",
      });
    }

    // ④ LLMでHP解決（任意）→ 到達・抽出 → フィルタ
    const CONCURRENCY = 8;
    let accepted: Candidate[] = [];
    let rejected: Rejected[] = [];

    // 法人番号重複（既存）を先に除外
    const base = dedupeCands(
      basePool.filter(
        (c) =>
          !!c.company_name &&
          !!(c.corporate_number || "").trim() &&
          !existingCorpNum.has((c.corporate_number || "").trim())
      )
    );

    // HP解決
    const withSite: Candidate[] = [];
    for (let i = 0; i < base.length; i += CONCURRENCY) {
      const chunk = base.slice(i, i + CONCURRENCY);
      const solved = await Promise.all(
        chunk.map(async (cand) => {
          if (!cand.website) cand.website = await resolveHomepageWithLLM(cand);
          return cand;
        })
      );
      withSite.push(...solved);
    }

    // 未解決は reject
    const resolvable = withSite.filter((x) => !!x.website);
    const unresolved = withSite.filter((x) => !x.website);
    for (const ng of unresolved) {
      rejected.push({ ...ng, reject_reasons: ["公式サイト未解決"] });
    }
    if (!resolvable.length) {
      // サイト解決ゼロでも、不適合は返すのでUIに出る
      return NextResponse.json({
        inserted: 0,
        rows: [],
        rejected,
        note:
          cacheStat.files > 0
            ? `cache_bootstrap: files=${cacheStat.files}, inserted=${cacheStat.inserted}`
            : undefined,
      });
    }

    for (let i = 0; i < resolvable.length; i += CONCURRENCY) {
      const chunk = resolvable.slice(i, i + CONCURRENCY);
      const verified = await Promise.all(
        chunk.map((c) => verifyAndEnrichWebsite(c))
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

    // ⑤ form_prospects へ保存
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
      job_site_source: "nta-cache+web",
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

    // 不適合の重複除去（理由はマージ）
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
      note:
        cacheStat.files > 0
          ? `cache_bootstrap: files=${cacheStat.files}, inserted=${cacheStat.inserted}`
          : undefined,
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

    const body = await req.json().catch(() => ({}));
    const c: Candidate | undefined = body?.candidate;
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
