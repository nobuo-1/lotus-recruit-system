// web/src/app/api/form-outreach/companies/enrich/route.ts
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

import { NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

/** ========= ENV ========= */
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

const GOOGLE_CSE_KEY = process.env.GOOGLE_CSE_KEY || "";
const GOOGLE_CSE_CX = process.env.GOOGLE_CSE_CX || "";
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY || "";

/** ========= Types ========= */
type EnrichBody = {
  since?: string;
  want?: number;
  try_llm?: boolean;
};

type CacheRow = {
  tenant_id: string;
  corporate_number: string | null;
  company_name: string | null;
  address: string | null;
  detail_url?: string | null;
  scraped_at?: string | null;
};

type AddedRow = {
  id: string;
  tenant_id: string;
  company_name: string | null;
  website: string | null;
  contact_email: string | null;
  contact_form_url?: string | null;
  phone?: string | null;
  industry?: string | null;
  company_size?: string | null;
  prefectures?: string[] | null;
  job_site_source?: string | null; // "google" | "map"
  corporate_number?: string | null;
  hq_address?: string | null;
  capital?: number | null;
  established_on?: string | null;
  created_at: string | null;
};

type RejectedRow = {
  company_name: string;
  website?: string | null;
  contact_email?: string | null;
  contact_form_url?: string | null;
  phone?: string | null;
  industry_large?: string | null;
  industry_small?: string | null;
  company_size?: string | null;
  company_size_extracted?: string | null;
  prefectures?: string[] | null;
  corporate_number?: string | null;
  hq_address?: string | null;
  capital?: number | null;
  established_on?: string | null;
  source_site?: string | null; // どの経路で判定したか
  reject_reasons: string[];
  created_at?: string | null;
};

/** ========= Utils ========= */
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";
const LANG = "ja,en;q=0.8";

function okUuid(s: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(s || "").trim()
  );
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  ms = 8000
): Promise<Response> {
  const ctl = new AbortController();
  const id = setTimeout(() => ctl.abort(), ms);
  try {
    return await fetch(url, {
      ...init,
      headers: {
        "user-agent": UA,
        "accept-language": LANG,
        ...(init.headers || {}),
      },
      signal: ctl.signal,
      cache: "no-store",
      redirect: "follow",
    });
  } finally {
    clearTimeout(id);
  }
}

const BAD_HOST_PARTS = [
  // SNS/求人/まとめ
  "facebook.com",
  "x.com",
  "twitter.com",
  "instagram.com",
  "linkedin.com",
  "indeed.com",
  "jp.indeed.com",
  "wantedly.com",
  "en-gage.net",
  "mynavi",
  "doda",
  "townwork",
  "recruit",
  "note.com",
  "wikipedia.org",
  // 公共/官公庁/ポータル
  "e-stat.go.jp",
  "soumu.go.jp",
  "meti.go.jp",
  "mlit.go.jp",
  "houjin-bangou.nta.go.jp",
  ".lg.jp",
  // 検索/キャッシュ系
  "webcache.googleusercontent.com",
  "translate.googleusercontent.com",
  "maps.app.goo.gl",
  "goo.gl/maps",
  "g.page",
  "google.com/maps",
  "maps.google",
  "google.co.jp/maps",
];

const FILE_EXT_RE = /\.(pdf|docx?|xlsx?|pptx?|zip|rar|7z|csv|txt)$/i;

function hasBadHost(u: URL) {
  const h = u.host.toLowerCase();
  return BAD_HOST_PARTS.some((b) => h.includes(b));
}
function isFileLikePath(u: URL) {
  return FILE_EXT_RE.test(u.pathname);
}
function stripWww(host: string) {
  return host.toLowerCase().startsWith("www.")
    ? host.slice(4)
    : host.toLowerCase();
}

/** URL → 公式トップページ候補へ正規化
 *  - スキームは https 優先
 *  - クエリ/ハッシュ除去
 *  - ファイル拡張子/明らかな詳細ページ（/contact 等）は origin に切り上げ
 *  - ルートにアクセスしてリダイレクトがあれば最終URLの「上位トップ（/ や /jp/ 等短い言語ルート）」に丸め
 *  - 一意性のためトレーリングスラッシュ付きで保存（例: https://example.co.jp/）
 */
async function canonicalHomepage(input: string): Promise<string | null> {
  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`);
  } catch {
    return null;
  }
  // 除外パターン
  if (!/^https?:$/i.test(u.protocol)) return null;
  if (hasBadHost(u)) return null;
  if (isFileLikePath(u)) return null;

  // まずクエリ/ハッシュ削除
  u.search = "";
  u.hash = "";

  // 明らかな詳細系は origin に持ち上げ
  const lowerPath = u.pathname.toLowerCase();
  const detailLike =
    lowerPath.includes("/contact") ||
    lowerPath.includes("/recruit") ||
    lowerPath.includes("/company/") ||
    lowerPath.includes("/about/") ||
    lowerPath.includes("/privacy") ||
    lowerPath.includes("/saiyo") ||
    lowerPath.includes("/採用") ||
    lowerPath.includes("/アクセス") ||
    lowerPath.includes("/access") ||
    lowerPath.includes("/wp-json") ||
    lowerPath.includes("/feed");
  if (detailLike) u.pathname = "/";

  // www 正規化
  u.host = stripWww(u.host);

  // ルートへアクセスして最終URLを反映
  const originRoot = `${u.protocol}//${u.host}/`;
  try {
    const r = await fetchWithTimeout(originRoot, { method: "GET" }, 7000);
    if (r && r.url) {
      const f = new URL(r.url);
      // リダイレクト先のホストも www 除去
      f.host = stripWww(f.host);
      // 最終パス
      const finalPath = f.pathname || "/";
      // 言語トップ等の短いパスは許容、それ以外はルートに丸める
      const allowShort = /^\/(ja|jp|en|zh|ko|index\.html)?\/?$/i.test(
        finalPath
      );
      const normalized = `${f.protocol}//${f.host}${
        allowShort
          ? finalPath.endsWith("/")
            ? finalPath
            : finalPath + "/"
          : "/"
      }`;
      const normalizedUrl = new URL(normalized);
      if (hasBadHost(normalizedUrl) || isFileLikePath(normalizedUrl)) {
        return `${f.protocol}//${f.host}/`;
      }
      return normalized;
    }
  } catch {
    // 失敗しても origin を返す
  }
  return originRoot;
}

function isLikelyOfficial(url: string, company?: string | null): boolean {
  try {
    const u = new URL(url);
    if (hasBadHost(u) || isFileLikePath(u)) return false;
    if (company) {
      const lc = company.toLowerCase().replace(/\s+/g, "");
      const host = u.host.toLowerCase().replace(/\W+/g, "");
      if (host.includes(lc)) return true;
    }
    return true;
  } catch {
    return false;
  }
}

async function headOk(url: string): Promise<boolean> {
  try {
    const r = await fetchWithTimeout(url, { method: "HEAD" }, 6000);
    if (r.ok) return true;
    const g = await fetchWithTimeout(url, { method: "GET" }, 8000);
    return g.ok;
  } catch {
    return false;
  }
}

/** ========= Google 検索 ========= */
async function findWebsiteByGoogleCSE(
  company: string,
  address?: string | null
): Promise<{ url: string | null; source: "google" | null }> {
  if (!GOOGLE_CSE_KEY || !GOOGLE_CSE_CX) return { url: null, source: null };
  const q = encodeURIComponent(`${company} ${address || ""}`.trim());
  const url = `https://www.googleapis.com/customsearch/v1?key=${GOOGLE_CSE_KEY}&cx=${GOOGLE_CSE_CX}&num=5&q=${q}`;
  try {
    const r = await fetchWithTimeout(url, {}, 8000);
    if (!r.ok) return { url: null, source: null };
    const j = (await r.json()) as any;
    const items: any[] = Array.isArray(j?.items) ? j.items : [];
    for (const it of items) {
      const raw = typeof it?.link === "string" ? it.link : null;
      if (!raw) continue;
      const link = await canonicalHomepage(raw);
      if (!link) continue;
      if (!isLikelyOfficial(link, company)) continue;
      if (await headOk(link)) return { url: link, source: "google" };
    }
  } catch {}
  return { url: null, source: null };
}

/** ========= Google Maps ========= */
async function findWebsiteByGoogleMaps(
  company: string,
  address?: string | null
): Promise<{ url: string | null; source: "map" | null }> {
  if (!GOOGLE_MAPS_API_KEY) return { url: null, source: null };
  const query = encodeURIComponent(`${company} ${address || ""}`.trim());
  const textSearch = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${query}&language=ja&key=${GOOGLE_MAPS_API_KEY}`;
  try {
    const r = await fetchWithTimeout(textSearch, {}, 8000);
    if (!r.ok) return { url: null, source: null };
    const j = (await r.json()) as any;
    const cand: any[] = Array.isArray(j?.results) ? j.results : [];
    for (const c of cand) {
      const placeId: string | undefined = c?.place_id;
      if (!placeId) continue;
      const details = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(
        placeId
      )}&fields=website,url,name,formatted_address&language=ja&key=${GOOGLE_MAPS_API_KEY}`;
      const d = await fetchWithTimeout(details, {}, 8000);
      if (!d.ok) continue;
      const dj = (await d.json()) as any;
      const siteRaw: string | null =
        dj?.result?.website || dj?.result?.url || null;
      if (!siteRaw) continue;

      // Google マップ自身のURLは除外して、外部サイト（website）を使う
      const cleaned = await canonicalHomepage(siteRaw);
      if (cleaned && (await headOk(cleaned))) {
        return { url: cleaned, source: "map" };
      }
    }
  } catch {}
  return { url: null, source: null };
}

/** ========= Supabase ========= */
function getAdmin() {
  if (!SUPABASE_URL) throw new Error("NEXT_PUBLIC_SUPABASE_URL is missing");
  if (SERVICE_ROLE) {
    return {
      sb: createClient(SUPABASE_URL, SERVICE_ROLE),
      usingServiceRole: true,
    };
  }
  if (!ANON_KEY)
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_ANON_KEY missing"
    );
  return { sb: createClient(SUPABASE_URL, ANON_KEY), usingServiceRole: false };
}

/** ========= 直近キャッシュ ========= */
async function loadRecentCache(
  sb: SupabaseClient,
  tenantId: string,
  sinceISO: string,
  limit: number
): Promise<CacheRow[]> {
  const { data, error } = await sb
    .from("nta_corporates_cache")
    .select(
      "tenant_id, corporate_number, company_name, address, detail_url, scraped_at"
    )
    .eq("tenant_id", tenantId)
    .gte("scraped_at", sinceISO)
    .order("scraped_at", { ascending: false })
    .limit(Math.max(10, limit * 3));
  if (error) throw new Error(error.message);
  return (data || []) as CacheRow[];
}

function isUniqueViolation(msg: string) {
  return /duplicate key value violates unique constraint/i.test(msg);
}

/** ========= 競合安全 MERGE（onConflict 非使用） =========
 *  - まず website(正規化済) で (tenant_id, website) をキーに SELECT
 *  - あれば UPDATE、なければ INSERT（重複競合時はリトライして SELECT→UPDATE）
 *  - corporate_number は任意（存在すれば上書き）
 */
async function mergeByWebsite(
  sb: SupabaseClient,
  tenantId: string,
  website: string,
  updateFields: Omit<
    AddedRow,
    "id" | "tenant_id" | "website" | "created_at"
  > & {
    created_at?: string | null;
  }
): Promise<{ data: AddedRow; createdNew: boolean }> {
  const now = new Date().toISOString();

  // 既存検索
  const { data: found, error: selErr } = await sb
    .from("form_prospects")
    .select("id, created_at")
    .eq("tenant_id", tenantId)
    .eq("website", website)
    .limit(1)
    .maybeSingle();
  if (selErr) throw new Error(selErr.message);

  const baseUpdate = {
    tenant_id: tenantId,
    website,
    company_name: updateFields.company_name ?? null,
    contact_email: updateFields.contact_email ?? null,
    contact_form_url: updateFields.contact_form_url ?? null,
    phone: updateFields.phone ?? null,
    industry: updateFields.industry ?? null,
    company_size: updateFields.company_size ?? null,
    prefectures: updateFields.prefectures ?? null,
    job_site_source: updateFields.job_site_source ?? null,
    corporate_number: updateFields.corporate_number ?? null,
    hq_address: updateFields.hq_address ?? null,
    capital: updateFields.capital ?? null,
    established_on: updateFields.established_on ?? null,
  };

  if (found?.id) {
    const { data, error } = await sb
      .from("form_prospects")
      .update(baseUpdate)
      .eq("id", found.id)
      .select("*")
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { data: data as AddedRow, createdNew: false };
  } else {
    try {
      const payload = {
        ...baseUpdate,
        created_at: updateFields.created_at ?? now,
      };
      const { data, error } = await sb
        .from("form_prospects")
        .insert(payload)
        .select("*")
        .maybeSingle();
      if (error) throw error;
      return { data: data as AddedRow, createdNew: true };
    } catch (e: any) {
      if (isUniqueViolation(String(e?.message || e))) {
        // 他トランザクションで先に入った → 取り直して UPDATE
        const { data: refetched, error: reSelErr } = await sb
          .from("form_prospects")
          .select("id, created_at")
          .eq("tenant_id", tenantId)
          .eq("website", website)
          .limit(1)
          .maybeSingle();
        if (reSelErr) throw new Error(reSelErr.message);
        if (refetched?.id) {
          const { data, error } = await sb
            .from("form_prospects")
            .update(baseUpdate)
            .eq("id", refetched.id)
            .select("*")
            .maybeSingle();
          if (error) throw new Error(error.message);
          return { data: data as AddedRow, createdNew: false };
        }
      }
      throw e;
    }
  }
}

/** ========= rejected へ INSERT ========= */
async function insertRejected(
  sb: SupabaseClient,
  r: RejectedRow & { tenant_id: string }
) {
  const now = new Date().toISOString();
  const payload = { ...r, created_at: r.created_at ?? now };
  const { error } = await sb.from("form_prospects_rejected").insert(payload);
  if (error) throw new Error(error.message);
}

/** ========= メイン ========= */
export async function POST(req: Request) {
  const trace: string[] = [];
  try {
    const tenantId = req.headers.get("x-tenant-id") || "";
    if (!tenantId || !okUuid(tenantId)) {
      return NextResponse.json(
        { error: "x-tenant-id required (uuid)", trace },
        { status: 400 }
      );
    }

    const body = (await req.json().catch(() => ({}))) as EnrichBody;
    const since =
      typeof body?.since === "string"
        ? body.since
        : new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const want = Math.max(1, Math.min(2000, Number(body?.want ?? 30)));

    const { sb } = getAdmin();

    const candidates = await loadRecentCache(sb, tenantId, since, want);
    trace.push(`candidates=${candidates.length} since=${since}`);

    const rows: AddedRow[] = [];
    const rejected: RejectedRow[] = [];
    let inserted = 0;

    for (const c of candidates) {
      if (rows.length >= want) break;
      const name = (c.company_name || "").trim();

      if (!name) {
        rejected.push({
          company_name: c.company_name || "(名称なし)",
          corporate_number: c.corporate_number || null,
          hq_address: c.address || null,
          source_site: "none",
          reject_reasons: ["会社名が空のためスキップ"],
        });
        continue;
      }

      // --- まず Google 検索 ---
      const fromCse = await findWebsiteByGoogleCSE(name, c.address);
      let website: string | null = fromCse.url;
      let source: "google" | "map" | null = fromCse.source;

      // --- ダメなら Google Maps ---
      if (!website) {
        const fromMap = await findWebsiteByGoogleMaps(name, c.address);
        website = fromMap.url;
        source = fromMap.source || source;
      }

      if (!website) {
        rejected.push({
          company_name: name,
          corporate_number: c.corporate_number || null,
          hq_address: c.address || null,
          source_site: GOOGLE_MAPS_API_KEY
            ? GOOGLE_CSE_KEY && GOOGLE_CSE_CX
              ? "search+map_none"
              : "map_only_none"
            : GOOGLE_CSE_KEY && GOOGLE_CSE_CX
            ? "search_only_none"
            : "none",
          reject_reasons: [
            "公式サイトが検索/マップともに確定できず",
            GOOGLE_CSE_KEY && GOOGLE_CSE_CX ? "CSE利用済み" : "CSE未設定",
            GOOGLE_MAPS_API_KEY ? "Maps利用済み" : "Maps未設定",
          ],
        });
        continue;
      }

      // 念のためもう一度トップページへ正規化（/contact 等だった場合の丸め）
      const homepage = await canonicalHomepage(website);
      if (!homepage || !(await headOk(homepage))) {
        rejected.push({
          company_name: name,
          website,
          corporate_number: c.corporate_number || null,
          hq_address: c.address || null,
          source_site: source || "unknown",
          reject_reasons: ["トップページ正規化/到達に失敗"],
        });
        continue;
      }

      // === (tenant_id, website) 一意制約に合わせて競合安全に MERGE ===
      const { data: saved, createdNew } = await mergeByWebsite(
        sb,
        tenantId,
        homepage,
        {
          company_name: name,
          contact_email: null,
          contact_form_url: null,
          phone: null,
          industry: null,
          company_size: null,
          prefectures: null,
          job_site_source: source || "google",
          corporate_number: c.corporate_number,
          hq_address: c.address,
          capital: null,
          established_on: null,
        }
      );

      rows.push(saved);
      if (createdNew) inserted += 1;
    }

    // 不適合の保存
    for (const r of rejected) {
      await insertRejected(sb, { ...r, tenant_id: tenantId });
    }

    return NextResponse.json(
      {
        rows,
        rejected,
        inserted,
        trace,
        used: {
          google_cse: Boolean(GOOGLE_CSE_KEY && GOOGLE_CSE_CX),
          maps_places: Boolean(GOOGLE_MAPS_API_KEY),
        },
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
