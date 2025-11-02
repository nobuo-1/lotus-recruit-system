// web/src/app/api/form-outreach/companies/fetch/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

type Filters = {
  prefectures?: string[];
  employee_size_ranges?: string[]; // ["1-9","10-49","50-249","250+"]
  keywords?: string[];
  job_titles?: string[];
  max?: number;
};

type ProspectRow = {
  company_name: string | null;
  website: string;
  contact_form_url: string | null;
  contact_email: string | null;
  industry: string | null;
  company_size: string | null;
  job_site_source: string | null;
};

function uniq<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

function normalizeRoot(u: string): string {
  try {
    const url = new URL(u);
    return `${url.protocol}//${url.hostname}`;
  } catch {
    return "";
  }
}

function toAbsUrl(root: string, href: string): string {
  try {
    return href.startsWith("http") ? href : new URL(href, root).toString();
  } catch {
    return "";
  }
}

function pickTitle(html: string): string {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const raw = (m?.[1] || "").replace(/<[^>]+>/g, "").trim();
  return raw.replace(/\s+/g, " ").slice(0, 120);
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, "").trim();
}

function findEmails(text: string): string[] {
  const emails = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
  return uniq(emails).slice(0, 3);
}

type Anchor = { href: string; text: string };

function extractAnchors(html: string): Anchor[] {
  const out: Anchor[] = [];
  const re = /<a\b[^>]*href\s*=\s*(['"])(.*?)\1[^>]*>([\s\S]*?)<\/a\s*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const href = m[2] || "";
    const text = stripTags(m[3] || "");
    if (href) out.push({ href, text });
  }
  return out;
}

function findRecruitLinks(root: string, html: string): string[] {
  const anchors = extractAnchors(html);
  const hits: string[] = [];
  for (const a of anchors) {
    const abs = toAbsUrl(root, a.href);
    const key = `${a.text} ${a.href}`.toLowerCase();
    if (
      /(recruit|recruitment|採用|求人|募集|採用情報|中途採用|新卒)/.test(key) &&
      abs.startsWith(root)
    ) {
      hits.push(abs);
    }
  }
  return uniq(hits).slice(0, 5);
}

function findContactForm(root: string, html: string): string {
  const anchors = extractAnchors(html);
  for (const a of anchors) {
    const abs = toAbsUrl(root, a.href);
    const key = `${a.text} ${a.href}`.toLowerCase();
    if (
      /(お問い合わせ|contact|問合せ|問い合わせ|フォーム|contact-form)/.test(
        key
      ) &&
      abs.startsWith(root)
    ) {
      return abs;
    }
  }
  return "";
}

async function fetchHTML(url: string): Promise<string> {
  const r = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 LotusRecruitBot/1.0" },
  });
  if (!r.ok) throw new Error(`fetch failed: ${url} (${r.status})`);
  return await r.text();
}

async function ddgSearch(q: string, max: number): Promise<string[]> {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`;
  const html = await fetchHTML(url);
  const out: string[] = [];
  const re =
    /<a\b[^>]*class\s*=\s*(['"])(?=[^'"]*\bresult__a\b)[\s\S]*?\1[^>]*href\s*=\s*(['"])(.*?)\2/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const href = m[3] || "";
    if (href) out.push(href);
  }
  return uniq(out).slice(0, max);
}

// --- LLM 補助（業種・規模をゆるく抽出） ---
async function enrichWithLLM(html: string): Promise<{
  industry: string | null;
  sizeRange: string | null;
}> {
  try {
    if (!OPENAI_API_KEY) return { industry: null, sizeRange: null };

    const text = stripTags(html).slice(0, 12000); // トークン節約
    const sys =
      "あなたは日本企業サイトのテキストから「主な業種」と「従業員規模(1-9,10-49,50-249,250+ のいずれか)」を推定するアシスタントです。無理なら null を返してください。";
    const user = `以下のテキストから JSON を返してください。\n\n---\n${text}\n---\n出力例: {"industry":"ITサービス","sizeRange":"50-249"}`;

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        temperature: 0,
        messages: [
          { role: "system", content: sys },
          { role: "user", content: user },
        ],
        response_format: { type: "json_object" },
      }),
    });

    const j = await r.json();
    const content =
      j?.choices?.[0]?.message?.content || '{"industry":null,"sizeRange":null}';
    const parsed = JSON.parse(content);
    const sizeRange = ["1-9", "10-49", "50-249", "250+"].includes(
      parsed?.sizeRange
    )
      ? parsed.sizeRange
      : null;

    return {
      industry: typeof parsed?.industry === "string" ? parsed.industry : null,
      sizeRange,
    };
  } catch {
    return { industry: null, sizeRange: null };
  }
}

export async function POST(req: NextRequest) {
  try {
    const tenantId = req.headers.get("x-tenant-id") || "";
    if (!tenantId) {
      return NextResponse.json(
        { error: "x-tenant-id header required" },
        { status: 400 }
      );
    }

    const body = (await req.json().catch(() => ({}))) as { filters?: Filters };
    const filters = body?.filters || {};
    const prefectures = Array.isArray(filters.prefectures)
      ? filters.prefectures
      : [];
    const sizeRanges = Array.isArray(filters.employee_size_ranges)
      ? filters.employee_size_ranges
      : [];
    const keywords = Array.isArray(filters.keywords) ? filters.keywords : [];
    const jobTitles = Array.isArray(filters.job_titles)
      ? filters.job_titles
      : [];
    const max =
      typeof filters.max === "number" && filters.max > 0
        ? Math.min(filters.max, 150)
        : 50;

    // 検索クエリ
    const baseWords = [
      "採用",
      "募集",
      "求人",
      "recruit",
      "採用情報",
      ...keywords,
      ...jobTitles,
    ]
      .map((s) => s.trim())
      .filter(Boolean)
      .join(" ");

    const prefQ = prefectures.length ? prefectures : [""];
    const queries = uniq(
      prefQ.map((p) => `${p} ${baseWords} 企業 site:.jp`.trim())
    );

    // 1) 検索 → 候補URL
    const ddgMax = Math.max(10, Math.min(max * 3, 150));
    const resultUrls = uniq(
      (await Promise.all(queries.map((q) => ddgSearch(q, ddgMax)))).flat()
    ).slice(0, ddgMax);

    // 2) ルートドメインに正規化
    const roots = uniq(
      resultUrls
        .map(normalizeRoot)
        .filter((r) => r && !/duckduckgo\.com|google\.com/i.test(r))
    ).slice(0, max);

    // 3) 各サイト巡回 → 情報抽出
    const out: ProspectRow[] = [];
    const concurrency = 5;
    for (let i = 0; i < roots.length; i += concurrency) {
      const chunk = roots.slice(i, i + concurrency);
      const results = await Promise.all(
        chunk.map(async (root) => {
          try {
            const html = await fetchHTML(root);
            const title = pickTitle(html);
            const emails = findEmails(html);
            const recruitLinks = findRecruitLinks(root, html);
            const contactForm = findContactForm(root, html);
            const { industry, sizeRange } = await enrichWithLLM(html);

            const row: ProspectRow = {
              company_name: title || root.replace(/^https?:\/\//, ""),
              website: root,
              contact_form_url: contactForm || (recruitLinks[0] ?? null),
              contact_email: emails[0] ?? null,
              industry,
              company_size: sizeRange,
              job_site_source: "ddg",
            };

            // フィルタ（簡易）
            if (sizeRanges.length && row.company_size) {
              if (!sizeRanges.includes(row.company_size)) return null;
            }
            if (prefectures.length) {
              const hay = `${row.company_name || ""} ${row.website}`;
              const hit = prefectures.some((p) => hay.includes(p));
              if (!hit) return null;
            }

            return row;
          } catch {
            return null;
          }
        })
      );
      for (const r of results) if (r) out.push(r);
    }

    // 4) 既存と重複排除して保存（IDを返す）
    const admin = supabaseAdmin();

    let existSet = new Set<string>();
    if (out.length > 0) {
      const websites = out.map((r) => r.website);
      const { data: existing } = await admin
        .from("form_prospects")
        .select("website")
        .eq("tenant_id", tenantId)
        .in("website", websites);
      if (existing)
        existSet = new Set(existing.map((r: { website: string }) => r.website));
    }

    const now = new Date().toISOString();
    const inserts = out
      .filter((r) => !existSet.has(r.website))
      .map((r) => ({
        tenant_id: tenantId,
        company_name: r.company_name,
        website: r.website,
        contact_form_url: r.contact_form_url,
        contact_email: r.contact_email,
        industry: r.industry,
        company_size: r.company_size,
        job_site_source: r.job_site_source,
        status: null,
        created_at: now,
        updated_at: now,
      }));

    let insertedRows:
      | {
          id: string;
          tenant_id: string | null;
          company_name: string | null;
          website: string | null;
          contact_email: string | null;
          job_site_source: string | null;
          created_at: string | null;
        }[]
      | null = [];

    if (inserts.length > 0) {
      const { data, error: insErr } = await admin
        .from("form_prospects")
        .insert(inserts)
        .select(
          "id, tenant_id, company_name, website, contact_email, job_site_source, created_at"
        );
      if (insErr) {
        return NextResponse.json({ error: insErr.message }, { status: 500 });
      }
      insertedRows = data ?? [];
    }

    return NextResponse.json({
      fetched: out.length,
      inserted: insertedRows?.length ?? 0,
      rows: insertedRows ?? [],
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
