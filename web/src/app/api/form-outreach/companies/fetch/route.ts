// web/src/app/api/form-outreach/companies/fetch/route.ts
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/** ---------- Types ---------- */
type SizeRange = "1-9" | "10-49" | "50-249" | "250+";

type Filters = {
  prefectures?: string[];
  employee_size_ranges?: SizeRange[];
  keywords?: string[];
  industries_large?: string[];
  industries_small?: string[];
  // 追加: 資本金・設立年月日（レンジ）
  capital_min?: number | null; // JPY
  capital_max?: number | null; // JPY
  established_from?: string | null; // YYYY-MM-DD
  established_to?: string | null; // YYYY-MM-DD
  max?: number; // backward-compat for want
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

  // 公式データ由来
  corporate_number?: string | null;
  hq_address?: string | null;
  capital?: number | null; // JPY
  established_on?: string | null; // YYYY-MM-DD
};

type AskBatchHint = { round: number; remain: number; seed?: string };

type Rejected = Candidate & {
  reject_reasons: string[];
};

/** ---------- ENV ---------- */
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// 契約があれば利用、なければフォールバック
const NTA_CORP_API_KEY = process.env.NTA_CORP_API_KEY || "";
const TIIS_API_KEY = process.env.TIIS_API_KEY || "";

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
          ] ||
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)",
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

/** "3,000万円"→30000000 / "1.2億円"→120000000 */
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

function deobfuscateEmails(text: string): string[] {
  const alt = text
    .replace(/\s*\[at\]\s*/gi, "@")
    .replace(/\s*\(at\)\s*/gi, "@")
    .replace(/\s*＠\s*/g, "@")
    .replace(/\s*\[dot\]\s*/gi, ".")
    .replace(/\s*\(dot\)\s*/gi, ".")
    .replace(/＜?アットマーク＞?/g, "@")
    .replace(/＜?ドット＞?/g, ".");
  const re = /[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}(?:\.[A-Z]{2,})?/gi;
  return Array.from(new Set(alt.match(re) ?? []));
}

function extractEmails(
  text: string,
  html?: string,
  siteHost?: string
): string[] {
  const pool = new Set<string>();
  for (const e of deobfuscateEmails(text)) pool.add(e);

  if (html) {
    // mailto:
    const mailtoRe = /href=["']mailto:([^"']+)["']/gi;
    let m: RegExpExecArray | null;
    while ((m = mailtoRe.exec(html))) {
      const raw = decodeURIComponent(m[1] || "");
      for (const e of deobfuscateEmails(raw)) pool.add(e);
    }
    // JSON-LD
    const ldRe =
      /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    while ((m = ldRe.exec(html))) {
      try {
        const j = JSON.parse(m[1]);
        const cand = (j?.email as string) || (j?.contactPoint?.email as string);
        if (typeof cand === "string") {
          for (const e of deobfuscateEmails(cand)) pool.add(e);
        }
      } catch {}
    }
  }
  const arr = [...pool];
  if (siteHost) {
    const main = arr.find((e) =>
      e.toLowerCase().endsWith(`@${siteHost.toLowerCase()}`)
    );
    if (main) return [main, ...arr.filter((x) => x !== main)];
  }
  return arr;
}

/** 従業員数 → レンジ抽出 */
function extractCompanySizeToRange(text: string): Candidate["company_size"] {
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

function extractHQPrefecture(html: string, text: string): string[] {
  const prefs = new Set<string>();
  const hqBlock =
    /会社概要[\s\S]{0,1200}?本社[\s\S]{0,600}|本社[\s\S]{0,1000}?所在地|所在地[\s\S]{0,1000}?本社/;
  const sec = hqBlock.exec(html)?.[0] || "";
  const target = (sec || text).slice(0, 4000);
  for (const p of JP_PREFS) if (target.includes(p)) prefs.add(p);
  return [...prefs];
}

// 業種の簡易推定
const INDUSTRY_MAP: Array<{ large: string; small: string; kw: RegExp }> = [
  { large: "IT・通信", small: "SaaS", kw: /(saas|クラウド|SaaS)/i },
  {
    large: "IT・通信",
    small: "受託開発",
    kw: /(受託|受注開発|システム開発|Web制作|アプリ開発)/i,
  },
  { large: "製造", small: "機械", kw: /(製造|工場|加工|機械|部品)/i },
  { large: "小売", small: "EC", kw: /(EC|通販|ネットショップ)/i },
  { large: "飲食", small: "外食", kw: /(飲食|レストラン|カフェ|居酒屋)/i },
];

function classifyIndustryFromText(text: string): {
  large?: string;
  small?: string;
} {
  for (const rule of INDUSTRY_MAP) {
    if (rule.kw.test(text)) return { large: rule.large, small: rule.small };
  }
  return {};
}

function resolveLinks(
  html: string,
  base: string
): Array<{ href: string; label: string }> {
  const out: Array<{ href: string; label: string }> = [];
  const re = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
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

/** 住所文字列から都道府県推定 */
function prefecturesFromAddress(addr?: string | null): string[] {
  if (!addr) return [];
  const hit = JP_PREFS.filter((p) => addr.includes(p));
  return hit.length ? hit.slice(0, 2) : [];
}

/** --------- Phase A: 国税庁(法人番号)ベース候補（SME優先 + ランダム都道府県固定） --------- */
async function fetchCorporatesBase(
  filters: Filters,
  want: number,
  hint: AskBatchHint
): Promise<Candidate[]> {
  // 実装メモ: 本来は国税庁API（CSV等）→ TIIS 連携。ここでは LLM フォールバック。
  if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not set");

  const sys =
    "You are a diligent Japanese business research assistant. Output STRICT JSON only, no commentary.";

  // Pref を 1県に固定（指定があればその中から）
  const pool =
    Array.isArray(filters.prefectures) && filters.prefectures.length
      ? filters.prefectures
      : JP_PREFS;
  const seedNum =
    Number(String(hint.seed || Date.now()).replace(/\D/g, "")) || Date.now();
  const fixedPref = pool[Math.floor(seedNum % pool.length)];

  const prompt = `以下条件に合致する日本の法人候補を出してください。上場企業・大手グループ本社は避け、中小〜中堅企業を優先。
各アイテムは次のキーを含めてください:
{company_name, hq_address, corporate_number, website}
- website は https:// から始まる公式サイトが望ましい（不明なら空可）
- hq_address には必ず都道府県名を含める（例: 東京都...）
- 必ず ${fixedPref} に所在する企業のみ返す（他県を返さない）
- 重複を避ける
出力は JSON のみ: {"items":[...]}。

任意キーワード: ${
    Array.isArray(filters.keywords) && filters.keywords.length
      ? filters.keywords.join(", ")
      : "指定なし"
  }
ラウンド: ${hint.round} / 少なくとも ${hint.remain} 社は新規で
シード: ${hint.seed || "-"}`;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${OPENAI_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o",
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: sys },
        { role: "user", content: prompt },
      ],
    }),
  });

  const txt = await res.text();
  if (!res.ok) throw new Error(`OpenAI error ${res.status}: ${txt}`);

  let payload: any = {};
  try {
    const j = JSON.parse(txt);
    const content = j?.choices?.[0]?.message?.content ?? "{}";
    payload = JSON.parse(content);
  } catch {}

  const items = Array.isArray(payload?.items) ? payload.items : [];
  const mapped: Candidate[] = items
    .map((x: any): Candidate | null => {
      const name = String(x?.company_name || "").trim();
      if (!name) return null;
      const hq = typeof x?.hq_address === "string" ? x.hq_address : null;
      const prefs = prefecturesFromAddress(hq);
      return {
        company_name: name,
        hq_address: hq,
        corporate_number:
          typeof x?.corporate_number === "string" ? x.corporate_number : null,
        website: normalizeUrl(x?.website) ?? null,
        prefectures: prefs.length ? prefs : undefined,
      };
    })
    .filter((c: Candidate | null): c is Candidate => !!c);
  return mapped.slice(0, Math.max(want * 3, 60));
}

/** --------- Phase B: 登記（資本金/設立）付与（フォールバックあり） --------- */
async function enrichRegistryInfo(c: Candidate): Promise<Candidate> {
  let capital: number | null = null;
  let established_on: string | null = null;

  // 公式 API（契約がある場合のみ。未実装→フォールバック）
  if (TIIS_API_KEY && c.corporate_number) {
    try {
      // 例：fetch 登記 API → capital / established_on を取得
      // const r = await fetchWithTimeout(`${process.env.TIIS_API_BASE}/org/${c.corporate_number}`, {
      //   headers: { authorization: `Bearer ${TIIS_API_KEY}` },
      // }, 8000);
      // if (r.ok) { const j = await r.json(); capital = j.capital; established_on = j.established_on; }
    } catch {}
  }

  // フォールバック: 公式サイトがあれば解析
  const site = normalizeUrl(c.website || undefined);
  if ((!capital || !established_on) && site) {
    try {
      const r = await fetchWithTimeout(site, {}, 10000);
      if (r.ok) {
        const html = await r.text();
        const text = textFromHtml(html);
        if (!capital) capital = extractCapital(text);
        if (!established_on) established_on = extractEstablishedOn(text);
      }
    } catch {}
  }

  // 住所→都道府県補完（未設定なら）
  const fromAddr = prefecturesFromAddress(c.hq_address ?? null);
  const mergedPref = (
    c.prefectures && c.prefectures.length ? c.prefectures : fromAddr
  ).slice(0, 4);

  return {
    ...c,
    capital: capital ?? null,
    established_on: established_on ?? null,
    prefectures: mergedPref,
  };
}

/** --------- Phase C: 公式HP 到達/抽出 --------- */
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

    const emails = extractEmails(text, html, host);
    const contact_form_url = await findContactForm(site, html);
    const sizeExtracted = extractCompanySizeToRange(text);
    const prefs = extractHQPrefecture(html, text);
    const ind = classifyIndustryFromText(text);

    return {
      ...c,
      website: site,
      contact_email: emails[0] ?? c.contact_email ?? null,
      contact_form_url,
      company_size: sizeExtracted ?? c.company_size ?? null,
      company_size_extracted: sizeExtracted ?? null,
      prefectures: (prefs.length ? prefs : c.prefectures ?? []).slice(0, 4),
      industry_large: c.industry_large ?? ind.large ?? null,
      industry_small: c.industry_small ?? ind.small ?? null,
    };
  } catch {
    return null;
  }
}

function dedupe(cands: Candidate[]): Candidate[] {
  const seen = new Set<string>();
  const out: Candidate[] = [];
  for (const cand of cands) {
    const key = `${(cand.website || "").toLowerCase()}__${cand.company_name}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(cand);
    }
  }
  return out;
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

/** 公式サイト解決（LLM） */
async function resolveHomepageWithLLM(
  c: Candidate
): Promise<string | undefined> {
  if (!OPENAI_API_KEY) return normalizeUrl(c.website || undefined);
  const sys =
    "You are a helpful assistant. Output STRICT JSON only, no commentary.";
  const prompt = `次の法人の公式ホームページURLを1つ推定してください。https:// から始まる必要があります。不明なら空。
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

/** 不適合のキー（重複判定） */
function keyForRejected(c: Rejected): string {
  const w = (c.website || "").toLowerCase();
  const n = (c.company_name || "").toLowerCase();
  const k = (c.corporate_number || "").toLowerCase();
  return `${k}__${w}__${n}`;
}

/** ---------- Handler: POST (Batch, 新フロー) ---------- */
export async function POST(req: Request) {
  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json(
        { error: "Supabase service role not configured" },
        { status: 500 }
      );
    }
    if (!OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY 未設定です" },
        { status: 400 }
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

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 既存 website を収集（重複避け）
    const { data: existing, error: exErr } = await admin
      .from("form_prospects")
      .select("website")
      .eq("tenant_id", tenantId);
    if (exErr)
      return NextResponse.json({ error: exErr.message }, { status: 500 });

    const existingSet = new Set(
      (existing || [])
        .map((r: any) => String(r.website || "").toLowerCase())
        .filter(Boolean)
    );

    let accepted: Candidate[] = [];
    let rejected: Rejected[] = [];

    const MAX_ROUNDS = 8;
    const CONCURRENCY = 8;
    const REQUEST_BUDGET_MS = 28_000; // Vercel 対応
    const t0 = Date.now();

    for (let round = 1; round <= MAX_ROUNDS; round++) {
      const remain = Math.max(0, want - accepted.length);
      if (remain === 0) break;

      // A) 国税庁ベース（SME優先 + ランダム都道府県固定）
      const corpBase = await fetchCorporatesBase(filters, remain, {
        round,
        remain,
        seed: `${seed}-nta-${round}`,
      });

      // 重複排除（既存DB & このラウンド & URL空は後で解決）
      const stepA = dedupe(
        corpBase.filter(
          (c: Candidate) =>
            !c.website || !existingSet.has(String(c.website).toLowerCase())
        )
      );
      if (!stepA.length) {
        if (Date.now() - t0 > REQUEST_BUDGET_MS) break;
        continue;
      }

      // B) 登記（資本金/設立）付与 → 事前フィルタ
      const enriched: Candidate[] = await Promise.all(
        stepA.map((cc: Candidate) => enrichRegistryInfo(cc))
      );
      const passB: Candidate[] = [];
      for (const cc of enriched) {
        const check = prefilterByRegistry(cc, filters);
        if (!check.ok) {
          rejected.push({ ...cc, reject_reasons: check.reasons });
        } else {
          passB.push(cc);
        }
      }

      // C) 公式HP解決 → 到達/抽出 → 最終フィルタ
      for (let i = 0; i < passB.length; i += CONCURRENCY) {
        const slice: Candidate[] = passB.slice(i, i + CONCURRENCY);

        const withSite: Candidate[] = await Promise.all(
          slice.map(async (cand: Candidate): Promise<Candidate> => {
            if (!cand.website) {
              const w = await resolveHomepageWithLLM(cand);
              cand.website = w ?? null;
            }
            return cand;
          })
        );

        const verifiedChunk: Array<Candidate | null> = await Promise.all(
          withSite.map((cand: Candidate) => verifyAndEnrichWebsite(cand))
        );

        for (const cc of verifiedChunk) {
          if (!cc) continue;
          const fin = matchesFilters(cc, filters);
          if (fin.ok) {
            accepted.push(cc);
          } else {
            rejected.push({ ...cc, reject_reasons: fin.reasons });
          }
          if (accepted.length >= want) break;
        }

        accepted = dedupe(accepted).slice(0, want);
        if (accepted.length >= want) break;
        if (Date.now() - t0 > REQUEST_BUDGET_MS) break;
      }

      if (accepted.length < want) await sleep(150);
      if (Date.now() - t0 > REQUEST_BUDGET_MS) break;
    }

    const toInsert: Candidate[] = accepted.slice(0, want);
    const rows = toInsert.map((c: Candidate) => ({
      tenant_id: tenantId,
      company_name: c.company_name,
      website: c.website || null,
      contact_form_url: c.contact_form_url ?? null,
      contact_email: c.contact_email ?? null,
      industry:
        [c.industry_large, c.industry_small].filter(Boolean).join(" / ") ||
        null,
      company_size: c.company_size_extracted ?? c.company_size ?? null,
      job_site_source: "nta+registry+web",
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
        .upsert(rows, { onConflict: "tenant_id,website" })
        .select(
          "id, tenant_id, company_name, website, contact_email, contact_form_url, industry, company_size, job_site_source, prefectures, corporate_number, hq_address, capital, established_on, created_at"
        );
      if (insErr)
        return NextResponse.json({ error: insErr.message }, { status: 500 });
      inserted = data;
    }

    // 不適合の重複除去（理由はマージ）
    const dedupedRejectedMap = new Map<string, Rejected>();
    for (const it of rejected) {
      const k = keyForRejected(it);
      const ex = dedupedRejectedMap.get(k);
      if (!ex) dedupedRejectedMap.set(k, it);
      else {
        const merged: Rejected = {
          ...ex,
          reject_reasons: Array.from(
            new Set([
              ...(ex.reject_reasons || []),
              ...(it.reject_reasons || []),
            ])
          ),
        };
        dedupedRejectedMap.set(k, merged);
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

    const body = await req.json().catch(() => ({}));
    const c: Candidate | undefined = body?.candidate;
    if (!c || !c.company_name) {
      return NextResponse.json(
        { error: "candidate is required" },
        { status: 400 }
      );
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
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
