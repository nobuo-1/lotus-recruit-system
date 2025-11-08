// web/src/app/api/form-outreach/companies/enrich/route.ts
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

function getAdmin(): { sb: any; usingServiceRole: boolean } {
  if (!SUPABASE_URL) throw new Error("NEXT_PUBLIC_SUPABASE_URL is missing");
  if (SERVICE_ROLE)
    return {
      sb: createClient(SUPABASE_URL, SERVICE_ROLE) as any,
      usingServiceRole: true,
    };
  if (!ANON_KEY)
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_ANON_KEY missing"
    );
  return {
    sb: createClient(SUPABASE_URL, ANON_KEY) as any,
    usingServiceRole: false,
  };
}

function okUuid(s: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(s || "").trim()
  );
}

/** --- 住所→都道府県の単純抽出（最初にマッチした1件を配列で返す） --- */
const PREFS = [
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
function extractPrefectures(addr?: string | null): string[] | null {
  if (!addr) return null;
  const a = String(addr);
  const hit = PREFS.find((p) => a.includes(p));
  return hit ? [hit] : null;
}

/** DBの行にそのまま対応する型（返却用） */
type ProspectRow = {
  id: string;
  tenant_id: string;
  company_name: string | null;
  website: string | null;
  contact_form_url: string | null;
  contact_email: string | null;
  industry: string | null;
  company_size: string | null;
  job_site_source: string | null;
  status: string | null;
  created_at: string | null;
  updated_at: string | null;
  prefectures: string[] | null;
  corporate_number: string | null;
  hq_address: string | null;
  capital: number | null; // bigint はnumberで受ける
  established_on: string | null; // date は文字列
};

export async function POST(req: Request) {
  try {
    const tenantId = req.headers.get("x-tenant-id") || "";
    if (!tenantId || !okUuid(tenantId))
      return NextResponse.json(
        { error: "x-tenant-id required (uuid)" },
        { status: 400 }
      );

    const body: any = await req.json().catch(() => ({}));
    const since: string | null =
      typeof body?.since === "string" ? body.since : null;
    const want: number = Math.max(
      1,
      Math.min(2000, Math.floor(Number(body?.want) || 60))
    );
    const tryLLM: boolean = !!body?.try_llm; // 将来拡張用（現状未使用）

    const { sb } = getAdmin();
    const nowIso = new Date().toISOString();

    // 1) NTAキャッシュから候補取得（sinceがあればそこから）
    let q = (sb as any)
      .from("nta_corporates_cache")
      .select("corporate_number, company_name, address, detail_url, scraped_at")
      .eq("tenant_id", tenantId)
      .order("scraped_at", { ascending: false })
      .limit(want * 5);

    if (since) q = q.gte("scraped_at", since);

    const { data: cached, error: cacheErr } = await q;
    if (cacheErr)
      return NextResponse.json({ error: cacheErr.message }, { status: 500 });

    const candidates = Array.isArray(cached) ? cached : [];
    if (candidates.length === 0)
      return NextResponse.json({ rows: [], inserted: 0 }, { status: 200 });

    // 2) 既存prospectsの corporate_number で重複除外
    const nums = candidates
      .map((c: any) => String(c.corporate_number || ""))
      .filter((v) => /^\d{13}$/.test(v));
    const { data: existedPros, error: exErr } = await (sb as any)
      .from("form_prospects")
      .select("corporate_number")
      .eq("tenant_id", tenantId)
      .in("corporate_number", nums);

    if (exErr)
      return NextResponse.json({ error: exErr.message }, { status: 500 });

    const existedSet = new Set<string>(
      (existedPros || []).map((r: any) => String(r.corporate_number))
    );

    // 3) 挿入データ作成（テーブル定義に完全準拠）
    const toInsert = candidates
      .filter((c: any) => !existedSet.has(String(c.corporate_number)))
      .slice(0, want)
      .map((c: any) => {
        const pref = extractPrefectures(c.address);
        return {
          tenant_id: tenantId, // uuid
          company_name: c.company_name ?? null, // text
          website: null, // text
          contact_form_url: null, // text
          contact_email: null, // text
          industry: null, // text
          company_size: null, // text
          job_site_source: "nta-crawl", // text
          status: "new", // text（初期状態）
          created_at: nowIso, // timestamptz
          updated_at: nowIso, // timestamptz
          prefectures: pref, // text[] | null
          corporate_number: c.corporate_number ?? null, // text(13桁を想定)
          hq_address: c.address ?? null, // text
          capital: null, // bigint
          established_on: null, // date
        };
      });

    let inserted = 0;
    let rows: ProspectRow[] = [];

    if (toInsert.length > 0) {
      // 4) upsert（ユニーク制約が tenant_id, corporate_number にある想定）
      const ins = await (sb as any)
        .from("form_prospects")
        .upsert(toInsert, {
          onConflict: "tenant_id,corporate_number",
          ignoreDuplicates: true,
        })
        .select(
          "id,tenant_id,company_name,website,contact_form_url,contact_email,industry,company_size,job_site_source,status,created_at,updated_at,prefectures,corporate_number,hq_address,capital,established_on"
        );

      if (ins.error) {
        // ユニーク制約が無い場合などは通常insertにフォールバック
        if (/no unique|ON CONFLICT/i.test(ins.error.message || "")) {
          const ins2 = await (sb as any)
            .from("form_prospects")
            .insert(toInsert)
            .select(
              "id,tenant_id,company_name,website,contact_form_url,contact_email,industry,company_size,job_site_source,status,created_at,updated_at,prefectures,corporate_number,hq_address,capital,established_on"
            );
          if (ins2.error)
            return NextResponse.json(
              { error: ins2.error.message },
              { status: 500 }
            );
          rows = Array.isArray(ins2.data) ? ins2.data : [];
          inserted = rows.length;
        } else {
          return NextResponse.json(
            { error: ins.error.message },
            { status: 500 }
          );
        }
      } else {
        rows = Array.isArray(ins.data) ? ins.data : [];
        inserted = rows.length;
      }
    }

    // 5) 将来拡張（tryLLM）: HP推定/到達性チェック/要約抽出など
    if (tryLLM) {
      // TODO: rows = await enrichWithLLM(rows)
    }

    return NextResponse.json({ rows, inserted }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { error: String(e?.message || e) },
      { status: 500 }
    );
  }
}
