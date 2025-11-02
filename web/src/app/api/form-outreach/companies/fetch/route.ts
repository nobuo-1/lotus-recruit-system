// web/src/app/api/form-outreach/companies/fetch/route.ts
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// ===== 型 =====
type Filters = {
  prefectures?: string[];
  employee_size_ranges?: string[];
  keywords?: string[];
  industries_large?: string[];
  industries_small?: string[];
  max?: number;
};

type Candidate = {
  company_name: string;
  website?: string;
  contact_email?: string;
  industry_large?: string;
  industry_small?: string;
  prefecture?: string;
};

// ===== 環境変数チェック =====
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY; // 必須（未設定なら400返す）

// ===== Helpers =====
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function clampInt(n: any, min: number, max: number) {
  const v = Math.floor(Number(n));
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, v));
}
function normalizeUrl(u?: string): string | undefined {
  if (!u) return undefined;
  try {
    const raw = u.trim();
    if (!raw) return undefined;
    const hasScheme = /^https?:\/\//i.test(raw);
    const url = new URL(hasScheme ? raw : `https://${raw}`);
    // 余計なクエリは排除
    url.hash = "";
    return url.toString();
  } catch {
    return undefined;
  }
}
function extractEmails(text: string): string[] {
  // ゆるいメール抽出（日本サイトの簡易対策）
  const re = /[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}(?:\.[A-Z]{2,})?/gi;
  const found = text.match(re) ?? [];
  // よくあるno-reply等のノイズは後で弾くならここで
  return Array.from(new Set(found));
}
async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  ms = 8000
) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(id);
  }
}

// OpenAIにJSONを厳格出力させる
async function askOpenAIForCompanies(
  filters: Filters,
  limit: number
): Promise<Candidate[]> {
  if (!OPENAI_API_KEY) {
    throw new Error(
      "OPENAI_API_KEY is not set. 環境変数 OPENAI_API_KEY を設定してください。"
    );
  }

  const sys =
    "You are a diligent Japanese business research assistant. " +
    "Return STRICT JSON only. Do not include any commentary.";

  // モデルにJSONで返させる（items配列のみ）
  const user = {
    role: "user",
    content: [
      {
        type: "text",
        text: `以下の条件に合致する日本の企業候補をできるだけ実在の中小〜中堅企業から厳選して返してください。
必ず homepage は有効なURL(https://...) とし、重複は避けてください。
JSONのみを返し、フォーマットは {"items":[{company_name, website, prefecture?, industry_large?, industry_small?}, ...]} としてください。

条件:
- 都道府県: ${
          filters.prefectures?.length ? filters.prefectures.join(", ") : "全国"
        }
- 従業員規模レンジ: ${filters.employee_size_ranges?.join(", ") || "指定なし"}
- キーワード: ${filters.keywords?.join(", ") || "指定なし"}
- 業種(大分類): ${filters.industries_large?.join(", ") || "指定なし"}
- 業種(小分類): ${filters.industries_small?.join(", ") || "指定なし"}
- 数: 最大${limit}社（なるべく満たす）

制約:
- items配列の要素は { "company_name": "...", "website": "https://...", "prefecture": "...", "industry_large":"...", "industry_small":"..." } のみ。
- websiteは必須。http/httpsのスキームを必ず含める。
- 大手/上場ばかりは避ける（中小・地域企業も混ぜる）。
- JSON以外の文字列は一切出力しないこと。`,
      },
    ],
  } as const;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${OPENAI_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      temperature: 0.2,
      messages: [{ role: "system", content: sys }, user],
    }),
  });

  const text = await res.text();
  // APIエラー
  if (!res.ok) {
    throw new Error(`OpenAI API error: ${res.status} ${text}`);
  }

  let data: any = {};
  try {
    const j = JSON.parse(text);
    const content = j?.choices?.[0]?.message?.content || "{}";
    data = JSON.parse(content);
  } catch {
    // まれに直接JSONが入っている場合
    try {
      data = JSON.parse(text);
    } catch {
      data = {};
    }
  }

  const items = Array.isArray(data?.items) ? data.items : [];
  const mapped: Candidate[] = items
    .map((x: any) => ({
      company_name: String(x?.company_name || "").trim(),
      website: normalizeUrl(x?.website),
      prefecture: typeof x?.prefecture === "string" ? x.prefecture : undefined,
      industry_large:
        typeof x?.industry_large === "string" ? x.industry_large : undefined,
      industry_small:
        typeof x?.industry_small === "string" ? x.industry_small : undefined,
    }))
    .filter((c: Candidate) => !!c.company_name && !!c.website);

  // 最大数まで
  return mapped.slice(0, limit);
}

async function verifyAndEnrich(c: Candidate): Promise<Candidate | null> {
  const site = normalizeUrl(c.website);
  if (!site) return null;

  try {
    // まずHEADで存在確認（落ちるサイトもあるのでGETへフォールバック）
    let ok = false;

    try {
      const rHead = await fetchWithTimeout(site, { method: "HEAD" }, 7000);
      ok = rHead.ok;
    } catch {
      ok = false;
    }

    if (!ok) {
      const rGet = await fetchWithTimeout(site, {}, 9000);
      ok = rGet.ok;
      if (!ok) return null;

      const html = await rGet.text();
      const emails = extractEmails(html);
      const mail = emails.find(
        (e) => !/noreply|no-reply|do[-_.]?not[-_.]?reply/i.test(e)
      );
      return {
        ...c,
        website: site,
        contact_email: mail,
      };
    }

    // HEADがokでも一度だけ本文GETしてメール抽出（軽く待機）
    await sleep(200);
    const r = await fetchWithTimeout(site, {}, 9000);
    const html = (await r.text()).slice(0, 500_000); // 過大なページ対策
    const emails = extractEmails(html);
    const mail = emails.find(
      (e) => !/noreply|no-reply|do[-_.]?not[-_.]?reply/i.test(e)
    );
    return {
      ...c,
      website: site,
      contact_email: mail,
    };
  } catch {
    return null;
  }
}

function dedupeByWebsiteAndName(arr: Candidate[]): Candidate[] {
  const seen = new Set<string>();
  const out: Candidate[] = [];
  for (const c of arr) {
    const key = `${(c.website || "").toLowerCase()}__${c.company_name}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(c);
    }
  }
  return out;
}

// ===== Handler =====
export async function POST(req: Request) {
  try {
    const tenantId = req.headers.get("x-tenant-id") || "";
    if (!tenantId) {
      return NextResponse.json(
        { error: "x-tenant-id required" },
        { status: 400 }
      );
    }
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json(
        { error: "Supabase service role is not configured." },
        { status: 500 }
      );
    }
    if (!OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY 未設定のため収集できません。" },
        { status: 400 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const filters: Filters = body?.filters ?? {};
    const limit = clampInt(filters?.max ?? 60, 10, 2000);

    // 1) OpenAIで候補生成（最大limit社）
    let candidates = await askOpenAIForCompanies(filters, limit);

    // 候補が少ない場合は少し待ってリトライ（最大2回）
    for (let i = 0; i < 2 && candidates.length < Math.min(20, limit); i++) {
      await sleep(300);
      const extra = await askOpenAIForCompanies(filters, limit);
      const merged = dedupeByWebsiteAndName([...candidates, ...extra]);
      candidates = merged.slice(0, limit);
    }

    // 2) サイト存在確認 & メール抽出（並列過多を防ぐ）
    const concurrency = 8;
    const verified: Candidate[] = [];
    for (let i = 0; i < candidates.length; i += concurrency) {
      const slice = candidates.slice(i, i + concurrency);
      const chunk = await Promise.all(slice.map((c) => verifyAndEnrich(c)));
      for (const x of chunk) if (x) verified.push(x);
    }

    const clean = dedupeByWebsiteAndName(verified).slice(0, limit);

    // 3) 既存のwebsiteはスキップ
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: existing, error: existErr } = await admin
      .from("form_prospects")
      .select("website")
      .eq("tenant_id", tenantId);

    if (existErr) {
      return NextResponse.json({ error: existErr.message }, { status: 500 });
    }

    const existingSet = new Set(
      (existing || [])
        .map((r: any) => String(r.website || "").toLowerCase())
        .filter(Boolean)
    );

    const toInsert = clean.filter(
      (c) => !!c.website && !existingSet.has(String(c.website).toLowerCase())
    );

    // 空なら即返す
    if (toInsert.length === 0) {
      return NextResponse.json({
        inserted: 0,
        rows: [],
        note: "新規追加対象がありません（既存と重複／到達不可サイト）",
      });
    }

    // 4) INSERT（新規のみ）
    const rows = toInsert.map((c) => ({
      tenant_id: tenantId,
      company_name: c.company_name,
      website: c.website,
      contact_form_url: null,
      contact_email: c.contact_email || null,
      industry:
        [c.industry_large, c.industry_small].filter(Boolean).join(" / ") ||
        null,
      company_size: null,
      job_site_source: "llm+web", // 取得元識別
      status: "new",
      // created_at/updated_atはDBのdefault now()想定
    }));

    const { data: inserted, error: insErr } = await admin
      .from("form_prospects")
      .insert(rows)
      .select(
        "id, tenant_id, company_name, website, contact_email, job_site_source, created_at"
      );

    if (insErr) {
      return NextResponse.json({ error: insErr.message }, { status: 500 });
    }

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
