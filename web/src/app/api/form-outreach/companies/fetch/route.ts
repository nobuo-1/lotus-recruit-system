// web/src/app/api/form-outreach/companies/fetch/route.ts
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/** ---------- Types ---------- */
type Filters = {
  prefectures?: string[];
  employee_size_ranges?: string[];
  keywords?: string[]; // ANDマッチ（全て含む）で厳格化
  industries_large?: string[];
  industries_small?: string[];
  max?: number;
};

type Candidate = {
  company_name: string;
  website?: string;
  contact_email?: string | null;
  contact_form_url?: string | null;
  industry_large?: string | null;
  industry_small?: string | null;
  prefectures?: string[]; // 複数
  company_size?: string | null; // レンジ
  _snippet?: string; // サーバ内判定用（保存しない）
};

type AskBatchHint = {
  round: number;
  remain: number;
};

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

/** ---------- Utils ---------- */
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const clamp = (n: any, min: number, max: number) =>
  Math.max(min, Math.min(max, Math.floor(Number(n) || 0)));

const normalizeKey = (u: string) => u.trim().toLowerCase().replace(/\/$/, "");

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
  ms = 8000
) {
  const ctl = new AbortController();
  const id = setTimeout(() => ctl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctl.signal });
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
    .slice(0, 200_000);
}

function extractEmails(text: string): string[] {
  const re = /[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}(?:\.[A-Z]{2,})?/gi;
  return Array.from(new Set(text.match(re) ?? [])).filter(
    (e) => !/no[-_. ]?reply|do[-_. ]?not[-_. ]?reply/i.test(e)
  );
}

function extractCompanySizeToRange(text: string): string | null {
  const m = text.match(/(従業員数|社員数)[：:\s]*([0-9,]+)\s*(名|人)/);
  if (!m) return null;
  const n = Number(m[2].replace(/,/g, ""));
  if (!Number.isFinite(n)) return null;
  if (n <= 9) return "1-9";
  if (n <= 49) return "10-49";
  if (n <= 249) return "50-249";
  return "250+";
}

function extractPrefectures(text: string): string[] {
  const set = new Set<string>();
  for (const p of JP_PREFS) if (text.includes(p)) set.add(p);
  return Array.from(set);
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

/** 条件判定：厳格 */
function meetsFilters(c: Candidate, filters: Filters): boolean {
  const snippet = (c._snippet || "").toLowerCase();
  const name = (c.company_name || "").toLowerCase();
  const url = (c.website || "").toLowerCase();

  // 都道府県：指定があれば交差必須
  if (filters.prefectures && filters.prefectures.length) {
    const prefs = c.prefectures || [];
    if (!prefs.some((p) => filters.prefectures!.includes(p))) return false;
  }

  // 従業員規模：指定があれば一致必須
  if (filters.employee_size_ranges && filters.employee_size_ranges.length) {
    if (
      !c.company_size ||
      !filters.employee_size_ranges.includes(c.company_size)
    )
      return false;
  }

  // 業種：小分類優先。なければ大分類で判定
  if (filters.industries_small && filters.industries_small.length) {
    if (
      !c.industry_small ||
      !filters.industries_small.includes(c.industry_small)
    )
      return false;
  } else if (filters.industries_large && filters.industries_large.length) {
    if (
      !c.industry_large ||
      !filters.industries_large.includes(c.industry_large)
    )
      return false;
  }

  // キーワード：すべてAND
  if (filters.keywords && filters.keywords.length) {
    const kws = filters.keywords.map((k) => k.toLowerCase());
    const hay = `${snippet} ${name} ${url}`;
    if (!kws.every((k) => hay.includes(k))) return false;
  }

  return true;
}

async function verifyAndEnrich(c: Candidate): Promise<Candidate | null> {
  const site = normalizeUrl(c.website);
  if (!site) return null;

  try {
    const r = await fetchWithTimeout(site, {}, 12000);
    if (!r.ok) return null;
    const html = await r.text();
    const text = textFromHtml(html);

    const emails = extractEmails(text);
    const contact_form_url = await findContactForm(site, html);
    const size = extractCompanySizeToRange(text);
    const prefs = extractPrefectures(text);

    return {
      company_name: c.company_name,
      website: site,
      contact_email: emails[0] ?? null,
      contact_form_url,
      company_size: size ?? c.company_size ?? null,
      prefectures: prefs.length ? prefs : c.prefectures ?? [],
      industry_large: c.industry_large ?? null,
      industry_small: c.industry_small ?? null,
      _snippet: text.slice(0, 5000),
    };
  } catch {
    return null;
  }
}

function dedupe(cands: Candidate[]): Candidate[] {
  const seen = new Set<string>();
  const out: Candidate[] = [];
  for (const c of cands) {
    const key = `${normalizeKey(c.website || "")}__${(
      c.company_name || ""
    ).toLowerCase()}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(c);
    }
  }
  return out;
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
  const prompt = `次の条件に当てはまる日本の企業候補を返してください。中小〜中堅企業も多めに含め、重複は避けてください。
必ず https:// から始まる homepage URL を含めてください。
出力は JSON のみで、フォーマットは {"items":[{company_name, website, prefectures?, industry_large?, industry_small?}]}。

条件:
- 都道府県: ${
    filters.prefectures?.length ? filters.prefectures.join(", ") : "全国"
  }
- 従業員規模レンジ: ${filters.employee_size_ranges?.join(", ") || "指定なし"}
- 任意キーワード: ${filters.keywords?.join(", ") || "指定なし"}
- 業種(大分類): ${filters.industries_large?.join(", ") || "指定なし"}
- 業種(小分類): ${filters.industries_small?.join(", ") || "指定なし"}
- ラウンド: ${hint.round} / 追加で最低 ${hint.remain} 社は新規に見つけること
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
    }))
    .filter((c: Candidate) => c.company_name !== "" && !!c.website);

  return mapped.slice(0, Math.max(want * 2, 40));
}

/** ---------- Handler ---------- */
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
    const target = clamp(filters.max ?? 60, 10, 2000);

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 既存website（正規化キー）
    const { data: existing, error: exErr } = await admin
      .from("form_prospects")
      .select("website")
      .eq("tenant_id", tenantId);
    if (exErr)
      return NextResponse.json({ error: exErr.message }, { status: 500 });

    const existingSet = new Set(
      (existing || [])
        .map((r: any) => String(r.website || ""))
        .filter((u: string) => !!u)
        .map((u: string) => normalizeKey(u))
    );

    let verifiedPool: Candidate[] = [];
    let rawPool: Candidate[] = [];
    const MAX_ROUNDS = 10;
    const CONCURRENCY = 8;

    for (let round = 1; round <= MAX_ROUNDS; round++) {
      const remainNeed = Math.max(0, target - verifiedPool.length);
      if (remainNeed === 0) break;

      const llm = await askOpenAIForCompanies(filters, remainNeed, {
        round,
        remain: remainNeed,
      });

      // 重複/既存除外
      const step1: Candidate[] = dedupe(llm).filter(
        (c: Candidate) =>
          !!c.website && !existingSet.has(normalizeKey(String(c.website)))
      );

      rawPool = dedupe([...rawPool, ...step1]);

      // 検証＆付加情報抽出
      for (let i = 0; i < step1.length; i += CONCURRENCY) {
        const slice: Candidate[] = step1.slice(i, i + CONCURRENCY);
        const chunk = await Promise.all(
          slice.map((v: Candidate) => verifyAndEnrich(v))
        );

        // 厳密フィルタ
        const ok = (
          chunk.filter((x): x is Candidate => !!x) as Candidate[]
        ).filter((c: Candidate) => meetsFilters(c, filters));

        verifiedPool = dedupe([...verifiedPool, ...ok]).slice(0, target);
        if (verifiedPool.length >= target) break;
      }

      if (verifiedPool.length < target) await sleep(300);
    }

    // 不足時のフォールバック：
    // ※ 厳密条件がある場合はフォールバック無効（条件を満たす保証ができないため）
    const hasStrict =
      (filters.prefectures && filters.prefectures.length > 0) ||
      (filters.employee_size_ranges &&
        filters.employee_size_ranges.length > 0) ||
      (filters.industries_small && filters.industries_small.length > 0) ||
      (filters.industries_large && filters.industries_large.length > 0);

    if (!hasStrict && verifiedPool.length < target && rawPool.length) {
      const need = target - verifiedPool.length;
      const verifiedKeys = new Set(
        verifiedPool.map((c: Candidate) => normalizeKey(c.website || ""))
      );
      const fallback: Candidate[] = [];
      for (const c of rawPool) {
        if (fallback.length >= need) break;
        const k = normalizeKey(c.website || "");
        if (!k || existingSet.has(k) || verifiedKeys.has(k)) continue;
        try {
          const r = await fetchWithTimeout(
            c.website!,
            { method: "HEAD" },
            5000
          );
          if (!r.ok) continue;
          const cand: Candidate = {
            company_name: c.company_name,
            website: normalizeUrl(c.website),
            contact_email: null,
            contact_form_url: null,
            industry_large: c.industry_large ?? null,
            industry_small: c.industry_small ?? null,
            prefectures: c.prefectures ?? [],
            company_size: null,
          };
          // キーワードのみ指定の場合、URL/社名スニペットで簡易判定
          if (filters.keywords && filters.keywords.length) {
            const hay = `${(cand.company_name || "").toLowerCase()} ${(
              cand.website || ""
            ).toLowerCase()}`;
            const okKw = filters.keywords
              .map((k) => k.toLowerCase())
              .every((kw) => hay.includes(kw));
            if (!okKw) continue;
          }
          fallback.push(cand);
        } catch {}
      }
      verifiedPool = dedupe([...verifiedPool, ...fallback]).slice(0, target);
    }

    const toInsert: Candidate[] = verifiedPool.slice(0, target);

    if (toInsert.length === 0) {
      return NextResponse.json({
        inserted: 0,
        rows: [],
        note: "新規追加できる企業が見つかりませんでした",
      });
    }

    // INSERT
    const rows = toInsert.map((c: Candidate) => ({
      tenant_id: tenantId,
      company_name: c.company_name,
      website: c.website!,
      contact_form_url: c.contact_form_url ?? null,
      contact_email: c.contact_email ?? null,
      industry:
        [c.industry_large, c.industry_small].filter(Boolean).join(" / ") ||
        null,
      company_size: c.company_size ?? null,
      job_site_source: "llm+web",
      status: "new",
      prefectures: c.prefectures ?? [], // text[]
    }));

    const { data: inserted, error: insErr } = await admin
      .from("form_prospects")
      .insert(rows)
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
