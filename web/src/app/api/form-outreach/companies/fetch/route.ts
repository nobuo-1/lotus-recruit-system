// web/src/app/api/form-outreach/companies/fetch/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type Filters = {
  prefectures?: string[];
  employee_size_ranges?: string[]; // ["1-9","10-49","50-249","250+"]
  keywords?: string[];
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

// 非依存の a タグ抽出
function extractAnchors(html: string): Anchor[] {
  const out: Anchor[] = [];
  const re = /<a\b[^>]*href\s*=\s*(['"])(.*?)\1[^>]*>([\s\S]*?)<\/a\s*>/gi; // href と中身を抽出
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

// DuckDuckGo(HTML) をスクレイピングして結果リンクのみ抽出
async function ddgSearch(q: string, max: number): Promise<string[]> {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`;
  const html = await fetchHTML(url);

  // <a class="result__a" href="..."> マッチ
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

// （任意）LLM補助はダミー返却。必要になれば chat API に差し替え。
async function enrichWithLLM(_html: string): Promise<{
  industry: string | null;
  sizeRange: string | null;
}> {
  return { industry: null, sizeRange: null };
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
    const max =
      typeof filters.max === "number" && filters.max > 0
        ? Math.min(filters.max, 150)
        : 50;

    // 検索クエリ生成
    const prefQ = prefectures.length ? prefectures : [""];
    const baseKw = [
      "採用",
      "募集",
      "求人",
      "recruit",
      "採用情報",
      ...keywords,
    ].join(" ");
    const queries = uniq(
      prefQ.map((p) => `${p} ${baseKw} 企業 site:.jp`.trim())
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

            // LLM補助（現状ダミー）
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

            // フィルタ適用（簡易）
            // ※ sizeRanges は現状 LLM 推定に依存。将来は別データ源に拡張可。
            if (sizeRanges.length && row.company_size) {
              if (!sizeRanges.includes(row.company_size)) return null;
            }

            // prefectures は現状ページ本文解析が必要だが、
            // ここでは URL/タイトルに県名が入っている場合のみ簡易に通す
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

    // 4) 既存と重複排除して保存
    const admin = supabaseAdmin();

    let existSet = new Set<string>();
    if (out.length > 0) {
      const websites = out.map((r) => r.website);
      // Postgrest の .in で空配列はエラーになるためガード
      const { data: existing, error: exErr } = await admin
        .from("form_prospects")
        .select("website")
        .eq("tenant_id", tenantId)
        .in("website", websites);
      if (!exErr && existing) {
        existSet = new Set(existing.map((r: { website: string }) => r.website));
      }
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

    if (inserts.length > 0) {
      const { error: insErr } = await admin
        .from("form_prospects")
        .insert(inserts);
      if (insErr) {
        return NextResponse.json({ error: insErr.message }, { status: 500 });
      }
    }

    return NextResponse.json({
      fetched: out.length,
      inserted: inserts.length,
      rows: inserts, // 画面下部の一時表示で利用
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
