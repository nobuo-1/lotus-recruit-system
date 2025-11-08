// web/src/app/api/form-outreach/companies/enrich/route.ts
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/** ========= ENV ========= */
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

/** Google Custom Search (任意) */
const GOOGLE_CSE_KEY = process.env.GOOGLE_CSE_KEY || "";
const GOOGLE_CSE_CX = process.env.GOOGLE_CSE_CX || "";

/** Google Maps Places API (任意) */
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY || "";

/** ========= Types ========= */
type EnrichBody = {
  since?: string; // ISO
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
  job_site_source?: string | null; // ← "google" | "map" など
  source_site?: string | null;
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
    });
  } finally {
    clearTimeout(id);
  }
}

function normalizeUrl(u?: string | null): string | null {
  if (!u) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(u) ? u : `https://${u}`);
    url.hash = "";
    // www.の有無は正規化（wwwは残す）
    if (url.pathname === "") url.pathname = "/";
    return url.toString();
  } catch {
    return null;
  }
}

function isLikelyOfficial(url: string, company?: string | null): boolean {
  const badHosts = [
    "facebook.com",
    "twitter.com",
    "x.com",
    "instagram.com",
    "linkedin.com",
    "indeed.com",
    "jp.indeed.com",
    "findy-code.io",
    "wantedly.com",
    "en-gage.net",
    "mynavi",
    "doda",
    "r-agent",
    "townwork",
    "recruit",
    "hataractive",
    "yahoo.co.jp",
    "wikipedia.org",
    "ja.wikipedia.org",
    "biz-journal",
    "note.com",
  ];
  try {
    const h = new URL(url).host.toLowerCase();
    if (badHosts.some((b) => h.includes(b))) return false;
  } catch {
    return false;
  }
  if (company) {
    const lc = company.toLowerCase();
    // “会社名”を含むドメイン/タイトルが望ましいが、ここではドメイン匹配のみ簡易に
    // ここは必要に応じて強化可能
    if (url.toLowerCase().includes(lc.replace(/\s+/g, ""))) return true;
  }
  return true;
}

async function headOk(url: string): Promise<boolean> {
  try {
    const r = await fetchWithTimeout(url, { method: "HEAD" }, 6000);
    if (r.ok) return true;
    // 一部サイトはHEAD拒否、GETで確認
    const g = await fetchWithTimeout(url, { method: "GET" }, 8000);
    return g.ok;
  } catch {
    return false;
  }
}

/** ========= Google 検索 → 公式HP候補 ========= */
async function findWebsiteByGoogleCSE(
  company: string,
  address?: string | null
): Promise<string | null> {
  if (!GOOGLE_CSE_KEY || !GOOGLE_CSE_CX) return null; // 未設定ならスキップ
  const q = encodeURIComponent(`${company} ${address || ""}`.trim());
  const url = `https://www.googleapis.com/customsearch/v1?key=${GOOGLE_CSE_KEY}&cx=${GOOGLE_CSE_CX}&num=5&q=${q}`;
  try {
    const r = await fetchWithTimeout(url, {}, 8000);
    if (!r.ok) return null;
    const j = (await r.json()) as any;
    const items: any[] = Array.isArray(j?.items) ? j.items : [];
    for (const it of items) {
      const link = normalizeUrl(it?.link);
      if (!link) continue;
      if (!isLikelyOfficial(link, company)) continue;
      if (await headOk(link)) return link;
    }
  } catch {
    // noop
  }
  return null;
}

/** ========= Google Maps → Place Details website フォールバック ========= */
async function findWebsiteByGoogleMaps(
  company: string,
  address?: string | null
): Promise<string | null> {
  if (!GOOGLE_MAPS_API_KEY) return null; // 未設定ならスキップ
  const query = encodeURIComponent(`${company} ${address || ""}`.trim());
  const textSearch = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${query}&language=ja&key=${GOOGLE_MAPS_API_KEY}`;
  try {
    const r = await fetchWithTimeout(textSearch, {}, 8000);
    if (!r.ok) return null;
    const j = (await r.json()) as any;
    const cand: any[] = Array.isArray(j?.results) ? j.results : [];
    if (!cand.length) return null;

    // スコア高い順に詳細へ
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
      const site = normalizeUrl(siteRaw);
      if (site && (await headOk(site))) return site;
    }
  } catch {
    // noop
  }
  return null;
}

/** ========= Supabase ========= */
function getAdmin(): {
  sb: any;
  usingServiceRole: boolean;
} {
  if (!SUPABASE_URL) throw new Error("NEXT_PUBLIC_SUPABASE_URL is missing");
  if (SERVICE_ROLE) {
    return {
      sb: createClient(SUPABASE_URL, SERVICE_ROLE) as any,
      usingServiceRole: true,
    };
  }
  if (!ANON_KEY)
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_ANON_KEY missing"
    );
  return {
    sb: createClient(SUPABASE_URL, ANON_KEY) as any,
    usingServiceRole: false,
  };
}

/** ========= 直近キャッシュの取得 ========= */
async function loadRecentCache(
  sb: any,
  tenantId: string,
  sinceISO: string,
  limit: number
): Promise<CacheRow[]> {
  // 直近の nta_corporates_cache から未処理の候補を取得（必要なら適宜条件を足す）
  const { data, error } = await sb
    .from("nta_corporates_cache")
    .select(
      "tenant_id, corporate_number, company_name, address, detail_url, scraped_at"
    )
    .eq("tenant_id", tenantId)
    .gte("scraped_at", sinceISO)
    .order("scraped_at", { ascending: false })
    .limit(Math.max(10, limit * 3)); // 少し多めに持ってくる
  if (error) throw new Error(error.message);
  return (data || []) as CacheRow[];
}

/** ========= 既存prospects重複チェック ========= */
async function existsProspect(
  sb: any,
  tenantId: string,
  corporateNumber?: string | null,
  website?: string | null
): Promise<boolean> {
  const q = sb
    .from("form_prospects")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId);
  if (corporateNumber) q.eq("corporate_number", corporateNumber);
  else if (website) q.eq("website", website);
  const { count, error } = await q;
  if (error) throw new Error(error.message);
  return (count ?? 0) > 0;
}

/** ========= prospects へUPSERT ========= */
async function upsertProspect(
  sb: any,
  row: Omit<AddedRow, "id" | "created_at"> & { created_at?: string | null }
): Promise<AddedRow | null> {
  const now = new Date().toISOString();
  const payload = { ...row, created_at: row.created_at ?? now };

  // UPSERT（テーブル側にユニークが無い場合は挿入→重複エラーを許容）
  let ins = await sb
    .from("form_prospects")
    .upsert(payload, {
      onConflict: "tenant_id,corporate_number",
      ignoreDuplicates: false,
    })
    .select("*")
    .limit(1)
    .maybeSingle();

  // onConflict列が存在しないなどで失敗した場合のフォールバック
  if (ins.error && /on conflict|conflict target/i.test(ins.error.message)) {
    ins = await sb
      .from("form_prospects")
      .insert(payload)
      .select("*")
      .limit(1)
      .maybeSingle();
  }
  if (ins.error) throw new Error(ins.error.message);
  return (ins.data || null) as AddedRow | null;
}

/** ========= rejected へ INSERT ========= */
async function insertRejected(
  sb: any,
  r: RejectedRow & { tenant_id: string }
): Promise<void> {
  const now = new Date().toISOString();
  const payload = { ...r, created_at: now };
  const { error } = await sb.from("form_prospects_rejected").insert(payload);
  if (error) throw new Error(error.message);
}

/** ========= メイン処理 ========= */
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

    // 候補取得
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
          reject_reasons: ["会社名が空のためスキップ"],
        });
        continue;
      }

      // 1) Google 検索（社名 + 所在地）
      let website: string | null = await findWebsiteByGoogleCSE(
        name,
        c.address
      );
      let source: "google" | "map" | null = website ? "google" : null;

      // 2) 見つからなければ Google Maps
      if (!website) {
        const viaMap = await findWebsiteByGoogleMaps(name, c.address);
        if (viaMap) {
          website = viaMap;
          source = "map";
        }
      }

      if (!website) {
        // 公式HPが解決できない → 不適合として理由を保存
        rejected.push({
          company_name: name,
          corporate_number: c.corporate_number || null,
          hq_address: c.address || null,
          reject_reasons: [
            "公式サイトが検索/マップともに確定できず",
            GOOGLE_CSE_KEY && GOOGLE_CSE_CX ? "CSE利用済み" : "CSE未設定",
            GOOGLE_MAPS_API_KEY ? "Maps利用済み" : "Maps未設定",
          ],
        });
        continue;
      }

      // 重複チェック
      const dup = await existsProspect(
        sb,
        tenantId,
        c.corporate_number,
        website
      );
      if (dup) {
        // 既存なら今回はスキップ（重複理由を控えておく）
        rejected.push({
          company_name: name,
          website,
          corporate_number: c.corporate_number || null,
          hq_address: c.address || null,
          reject_reasons: ["既にprospectsへ登録済み（重複）"],
        });
        continue;
      }

      // prospectsへ登録
      const saved = await upsertProspect(sb, {
        tenant_id: tenantId,
        company_name: name,
        website,
        contact_email: null,
        contact_form_url: null,
        phone: null,
        industry: null,
        company_size: null,
        prefectures: null,
        job_site_source: source || "google",
        source_site: null,
        corporate_number: c.corporate_number,
        hq_address: c.address,
        capital: null,
        established_on: null,
      });

      if (saved) {
        rows.push(saved);
        inserted += 1;
      } else {
        // 理由不明で保存できなかった場合もrejectedへ
        rejected.push({
          company_name: name,
          website,
          corporate_number: c.corporate_number || null,
          hq_address: c.address || null,
          reject_reasons: ["prospectsへの保存に失敗"],
        });
      }
    }

    // 不適合はまとめてINSERT（重い場合は必要に応じてバルク化）
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
