// web/src/app/api/form-outreach/companies/fetch/route.ts
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/** ---------- Types ---------- */
type Filters = {
  prefectures?: string[];
  employee_size_ranges?: Array<"1-9" | "10-49" | "50-249" | "250+">;
  keywords?: string[];
  industries_large?: string[];
  industries_small?: string[];
  max?: number; // for backward compat
};

type Candidate = {
  company_name: string;
  website?: string;
  contact_email?: string | null;
  contact_form_url?: string | null;
  industry_large?: string | null;
  industry_small?: string | null;
  prefectures?: string[];
  company_size?: "1-9" | "10-49" | "50-249" | "250+" | null;
  /** 本文から抽出できた実測の規模レンジ（LLM推定ではなくサイト実データに基づく） */
  company_size_extracted?: "1-9" | "10-49" | "50-249" | "250+" | null;
};

type AskBatchHint = { round: number; remain: number; seed?: string };

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

/** ---------- Utils ---------- */
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const clamp = (n: any, min: number, max: number) =>
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

function normalizeUrl(u?: string): string | undefined {
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
) {
  const ctl = new AbortController();
  const id = setTimeout(() => ctl.abort(), ms);
  try {
    return await fetch(url, {
      ...init,
      signal: ctl.signal,
      headers: {
        "user-agent":
          (init.headers as any)?.["user-agent"] ||
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
        const cand = j?.email || j?.contactPoint?.email;
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

/** 従業員数 → レンジ抽出（揺れ対応強化版） */
function extractCompanySizeToRange(text: string): Candidate["company_size"] {
  // カンマ（半角/全角）と全角空白はノイズになりやすいので除去
  const t = text.replace(/[,\uFF0C\u3000]/g, "");

  // 代表的な揺れ例：
  // 「従業員数 約35名」「社員 120人規模」「スタッフ 10名程度」「従業員 50名以上」「従業員 100人未満」
  const re =
    /(従業員|従業員数|社員|スタッフ)[^\d]{0,8}(約|およそ)?\s*([0-9]{1,6})\s*(名|人)\s*(規模|程度|前後|以上|超|未満|以下)?/i;

  const m = re.exec(t);
  if (!m) return null;

  let n = Number(m[3]);
  if (!Number.isFinite(n) || n <= 0) return null;

  const mod = (m[5] || "").toString();

  // 「未満/以下」は上限のニュアンス → 1引いて近い下位バケットへ倒す
  if (/未満|以下/.test(mod)) n = Math.max(0, n - 1);
  // 「以上/超」は下限のニュアンスだが、算出バケットは通常の数値で十分

  if (n <= 9) return "1-9";
  if (n <= 49) return "10-49";
  if (n <= 249) return "50-249";
  return "250+";
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

// 業種推定（最低限の辞書・必要に応じて拡張可能）
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
): { href: string; label: string }[] {
  const out: { href: string; label: string }[] = [];
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

/** Web検証 + 付加情報の付与（実測 company_size_extracted を保持） */
async function verifyAndEnrich(c: Candidate): Promise<Candidate | null> {
  const site = normalizeUrl(c.website);
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
    const sizeExtracted = extractCompanySizeToRange(text); // ← 実測を抽出
    const prefs = extractHQPrefecture(html, text);
    const ind = classifyIndustryFromText(text);

    return {
      company_name: c.company_name,
      website: site,
      contact_email: emails[0] ?? c.contact_email ?? null,
      contact_form_url,
      // 表示用の company_size は実測優先で一旦上書きするが、保存時にも実測優先で処理
      company_size: sizeExtracted ?? c.company_size ?? null,
      company_size_extracted: sizeExtracted ?? null, // ← 実測値を保持
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
  for (const c of cands) {
    const key = `${(c.website || "").toLowerCase()}__${c.company_name}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(c);
    }
  }
  return out;
}

/** 厳格フィルタ（AND）
 * - 規模レンジが指定されている場合：本文の実測（company_size_extracted）が必須。未検出や不一致は除外。
 * - 規模レンジが未指定の場合：従来どおり（他条件のみ）。
 */
function matchesFilters(c: Candidate, f: Filters): boolean {
  if (f.prefectures?.length) {
    const set = new Set((c.prefectures ?? []).map(String));
    if (![...set].some((p) => f.prefectures!.includes(p))) return false;
  }

  if (f.employee_size_ranges?.length) {
    const ex = c.company_size_extracted ?? null;
    if (!ex) return false; // 実測が取れていない場合は除外
    if (!f.employee_size_ranges.includes(ex)) return false; // 実測がフィルタ不一致
  }

  if (f.industries_large?.length) {
    if (!c.industry_large || !f.industries_large.includes(c.industry_large))
      return false;
  }
  if (f.industries_small?.length) {
    if (!c.industry_small || !f.industries_small.includes(c.industry_small))
      return false;
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
    if (!ok) return false;
  }
  return true;
}

/** ---------- OpenAI ---------- */
async function askOpenAIForCompanies(
  filters: Filters,
  want: number,
  hint: AskBatchHint
): Promise<Candidate[]> {
  if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not set");

  const sys =
    "You are a diligent Japanese business research assistant. Output STRICT JSON only, no commentary.";
  const prompt = `次の条件に合致する日本の企業候補を返してください。中小〜中堅企業も多めに、重複は避けること。
必ず https:// から始まる homepage URL を含め、可能なら従業員規模レンジ(company_size: "1-9"|"10-49"|"50-249"|"250+") を付与。
出力は JSON のみ: {"items":[{company_name, website, prefectures?, industry_large?, industry_small?, company_size?}]}。

条件:
- 都道府県: ${
    filters.prefectures?.length ? filters.prefectures.join(", ") : "全国"
  }
- 従業員規模レンジ: ${filters.employee_size_ranges?.join(", ") || "指定なし"}
- 任意キーワード: ${filters.keywords?.join(", ") || "指定なし"}
- 業種(大分類): ${filters.industries_large?.join(", ") || "指定なし"}
- 業種(小分類): ${filters.industries_small?.join(", ") || "指定なし"}
- ラウンド: ${hint.round} / 追加で最低 ${hint.remain} 社は新規に見つけること
- シード: ${hint.seed || "-"}
- 大手や上場だけに偏らないこと`;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${OPENAI_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
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
  } catch {
    payload = {};
  }

  const items = Array.isArray(payload?.items) ? payload.items : [];
  const mapped: Candidate[] = items
    .map((x: any) => ({
      company_name: String(x?.company_name || "").trim(),
      website: normalizeUrl(x?.website),
      industry_large:
        typeof x?.industry_large === "string" ? x.industry_large : null,
      industry_small:
        typeof x?.industry_small === "string" ? x.industry_small : null,
      prefectures: Array.isArray(x?.prefectures)
        ? x.prefectures.filter((p: any) => typeof p === "string")
        : [],
      // LLMの推定は参考値。最終判定・保存は実測優先。
      company_size: ((): Candidate["company_size"] => {
        const v = String(x?.company_size || "").trim();
        return (["1-9", "10-49", "50-249", "250+"] as const).includes(v as any)
          ? (v as any)
          : null;
      })(),
    }))
    .filter((c: Candidate) => c.company_name && c.website);

  // LLMは多めに返す可能性、ここでは抑制
  return mapped.slice(0, Math.max(want * 3, 60));
}

/** ---------- Handler (Batch strict, fill-to-want) ---------- */
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
    const want: number = clamp(body?.want ?? filters.max ?? 12, 1, 200); // 1〜200/回
    const seed: string = String(body?.seed || Math.random()).slice(2);

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 既存 website を先に収集（重複避け）
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

    // 1回の呼び出し内で、厳格フィルタを満たす候補を want 件まで埋めきる
    let pool: Candidate[] = [];
    const MAX_ROUNDS = 8;
    const CONCURRENCY = 8;
    const REQUEST_BUDGET_MS = 28_000; // Vercel 300s 対策
    const t0 = Date.now();

    for (let round = 1; round <= MAX_ROUNDS; round++) {
      const remain = Math.max(0, want - pool.length);
      if (remain === 0) break;

      const llm = await askOpenAIForCompanies(filters, remain, {
        round,
        remain,
        seed: `${seed}-${round}`,
      });

      // 重複排除（既存DB & これまでのpool & URL空）
      const step1: Candidate[] = dedupe(llm).filter(
        (c: Candidate) =>
          !!c.website && !existingSet.has(String(c.website).toLowerCase())
      );
      if (!step1.length) {
        if (Date.now() - t0 > REQUEST_BUDGET_MS) break;
        continue;
      }

      // 検証＆付加情報
      for (let i = 0; i < step1.length; i += CONCURRENCY) {
        const slice: Candidate[] = step1.slice(i, i + CONCURRENCY);
        const chunk = await Promise.all(
          slice.map((cand: Candidate) => verifyAndEnrich(cand))
        );
        const verified = (chunk.filter(Boolean) as Candidate[]).filter((cc) =>
          matchesFilters(cc, filters)
        );
        // 厳格一致のみ追加
        pool.push(...verified);
        pool = dedupe(pool).slice(0, want);
        if (pool.length >= want) break;
        if (Date.now() - t0 > REQUEST_BUDGET_MS) break;
      }

      if (pool.length < want) await sleep(150);
      if (Date.now() - t0 > REQUEST_BUDGET_MS) break;
    }

    const toInsert: Candidate[] = pool.slice(0, want);
    if (toInsert.length === 0) {
      return NextResponse.json({
        inserted: 0,
        rows: [],
        note: "条件に合致する新規候補が見つかりませんでした",
      });
    }

    // 保存：重複は upsert でスキップ/更新（tenant_id,website が一意キー想定）
    const rows = toInsert.map((c: Candidate) => ({
      tenant_id: tenantId,
      company_name: c.company_name,
      website: c.website!,
      contact_form_url: c.contact_form_url ?? null,
      contact_email: c.contact_email ?? null,
      industry:
        [c.industry_large, c.industry_small].filter(Boolean).join(" / ") ||
        null,
      // 実測があればそれを保存。なければ従来の company_size（LLM推定含む）を保存。
      company_size: c.company_size_extracted ?? c.company_size ?? null,
      job_site_source: "llm+web",
      status: "new",
      prefectures: c.prefectures ?? [],
    }));

    const { data: inserted, error: insErr } = await admin
      .from("form_prospects")
      .upsert(rows, { onConflict: "tenant_id,website" })
      .select(
        "id, tenant_id, company_name, website, contact_email, contact_form_url, industry, company_size, job_site_source, prefectures, created_at"
      );

    if (insErr)
      return NextResponse.json({ error: insErr.message }, { status: 500 });

    return NextResponse.json({
      inserted: inserted?.length || 0,
      rows: inserted || [],
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: String(e?.message || e) },
      { status: 500 }
    );
  }
}
