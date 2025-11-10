// web/src/app/api/form-outreach/companies/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

const PAGE_MIN = 1;
const PAGE_MAX = 100000;
const LIMIT_MIN = 1;
const LIMIT_MAX = 1000;

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

/** 受け取るテーブル指定を堅牢に正規化 */
function resolveTable(
  v: string | null | undefined
): "form_prospects" | "form_prospects_rejected" | "form_similar_sites" {
  const s = (v || "").toLowerCase().trim();
  if (
    s === "rejected" ||
    s === "form_prospects_rejected" ||
    s.includes("不備")
  ) {
    return "form_prospects_rejected";
  }
  if (s === "similar" || s === "form_similar_sites" || s.includes("近似")) {
    return "form_similar_sites";
  }
  // "prospects" / "form_prospects" / その他は既定で正規企業
  return "form_prospects";
}

/** 並び替え許可カラム（テーブル別） */
const ALLOW_SORT: Record<string, string[]> = {
  form_prospects: [
    "created_at",
    "updated_at",
    "company_name",
    "industry",
    "company_size",
    "capital",
    "established_on",
    "job_site_source",
  ],
  form_prospects_rejected: [
    "created_at",
    "updated_at",
    "company_name",
    "industry_large",
    "industry_small",
    "company_size",
    "capital",
    "established_on",
    "source_site",
  ],
  form_similar_sites: [
    "created_at",
    "updated_at",
    "target_company_name",
    "found_company_name",
    "matched_addr",
    "matched_company_ratio",
    "source_site",
  ],
};

export async function GET(req: NextRequest) {
  try {
    const tenantId = req.headers.get("x-tenant-id") || "";
    if (!tenantId) {
      return NextResponse.json(
        { error: "x-tenant-id header required" },
        { status: 400 }
      );
    }

    const url = new URL(req.url);
    const table = resolveTable(url.searchParams.get("table"));

    const limit = clamp(
      Number(url.searchParams.get("limit") || 10),
      LIMIT_MIN,
      LIMIT_MAX
    );
    const page = clamp(
      Number(url.searchParams.get("page") || 1),
      PAGE_MIN,
      PAGE_MAX
    );
    const offset = (page - 1) * limit;

    const sort = (url.searchParams.get("sort") || "created_at").toString();
    const dir = (url.searchParams.get("dir") || "desc").toLowerCase() as
      | "asc"
      | "desc";

    const allowed = new Set(ALLOW_SORT[table] || []);
    const sortKey = allowed.has(sort) ? sort : "created_at";
    const sortDir: "asc" | "desc" = dir === "asc" ? "asc" : "desc";

    // ---- 共通フィルタ入力 ----
    const q = (url.searchParams.get("q") || "").trim();
    const email = url.searchParams.get("email") || ""; // "", has, none
    const form = url.searchParams.get("form") || ""; // "", has, none
    const prefecturesCsv = (url.searchParams.get("prefectures") || "").trim();
    const industry = (url.searchParams.get("industry") || "").trim();
    const dateFrom = url.searchParams.get("date_from") || "";
    const dateTo = url.searchParams.get("date_to") || "";
    const matchedAddr = url.searchParams.get("matched_addr") || ""; // similar only

    const sb = await supabaseServer();

    /** テーブルごとに存在する列だけフィルタを当てる */
    const hasCol = (col: string) => {
      if (table === "form_prospects") {
        return new Set([
          "company_name",
          "website",
          "contact_email",
          "contact_form_url",
          "prefectures",
          "industry",
          "created_at",
          "updated_at",
          "job_site_source",
          "capital",
          "established_on",
        ]).has(col);
      }
      if (table === "form_prospects_rejected") {
        return new Set([
          "company_name",
          "website",
          "contact_email",
          "contact_form_url",
          "prefectures",
          "industry_large",
          "industry_small",
          "created_at",
          "updated_at",
          "capital",
          "established_on",
        ]).has(col);
      }
      // similar
      return new Set([
        "target_company_name",
        "found_company_name",
        "found_website",
        "contact_email",
        "contact_form_url",
        "matched_addr",
        "matched_company_ratio",
        "created_at",
        "updated_at",
        "source_site",
      ]).has(col);
    };

    /** 同じフィルタを両クエリへ適用する小関数 */
    const applyFilters = (qry: any) => {
      let base = qry.eq("tenant_id", tenantId);

      // キーワード
      if (q) {
        const like = `%${q}%`;
        if (table === "form_prospects") {
          base = base.or(
            [
              hasCol("company_name") && `company_name.ilike.${like}`,
              hasCol("website") && `website.ilike.${like}`,
              hasCol("contact_email") && `contact_email.ilike.${like}`,
            ]
              .filter(Boolean)
              .join(",")
          );
        } else if (table === "form_prospects_rejected") {
          base = base.or(
            [
              hasCol("company_name") && `company_name.ilike.${like}`,
              hasCol("website") && `website.ilike.${like}`,
              hasCol("contact_email") && `contact_email.ilike.${like}`,
            ]
              .filter(Boolean)
              .join(",")
          );
        } else {
          // similar
          base = base.or(
            [
              hasCol("target_company_name") &&
                `target_company_name.ilike.${like}`,
              hasCol("found_company_name") &&
                `found_company_name.ilike.${like}`,
              `found_website.ilike.${like}`,
              hasCol("contact_email") && `contact_email.ilike.${like}`,
            ]
              .filter(Boolean)
              .join(",")
          );
        }
      }

      // メール有無
      if (hasCol("contact_email")) {
        if (email === "has") {
          base = base.not("contact_email", "is", null).neq("contact_email", "");
        } else if (email === "none") {
          base = base.or("contact_email.is.null,contact_email.eq.");
        }
      }

      // フォーム有無
      if (hasCol("contact_form_url")) {
        if (form === "has") {
          base = base
            .not("contact_form_url", "is", null)
            .neq("contact_form_url", "");
        } else if (form === "none") {
          base = base.or("contact_form_url.is.null,contact_form_url.eq.");
        }
      }

      // 都道府県（similar には列が無い）
      if (prefecturesCsv && hasCol("prefectures")) {
        const prefs = prefecturesCsv
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        if (prefs.length) base = base.overlaps("prefectures", prefs);
      }

      // 業種
      if (industry) {
        const like = `%${industry}%`;
        if (table === "form_prospects" && hasCol("industry")) {
          base = base.ilike("industry", like);
        } else if (table === "form_prospects_rejected") {
          const parts = [
            hasCol("industry_large") && `industry_large.ilike.${like}`,
            hasCol("industry_small") && `industry_small.ilike.${like}`,
          ].filter(Boolean);
          if (parts.length) base = base.or(parts.join(","));
        }
        // similar は対象外
      }

      // 作成日 from/to
      if (hasCol("created_at")) {
        if (dateFrom) base = base.gte("created_at", dateFrom);
        if (dateTo) {
          const end = new Date(dateTo);
          end.setHours(23, 59, 59, 999);
          base = base.lte("created_at", end.toISOString());
        }
      }

      // similar: 住所一致
      if (table === "form_similar_sites" && hasCol("matched_addr")) {
        if (matchedAddr === "true" || matchedAddr === "false") {
          base = base.eq("matched_addr", matchedAddr === "true");
        }
      }

      return base;
    };

    // ---- 件数クエリ（最初の select で count/head を指定）----
    let countQuery = sb
      .from(table)
      .select("id", { count: "exact", head: true } as any);
    countQuery = applyFilters(countQuery);
    const { count: total, error: countErr } = await countQuery;
    if (countErr) {
      return NextResponse.json({ error: countErr.message }, { status: 500 });
    }

    // ---- データクエリ（通常の取得）----
    let dataQuery = sb.from(table).select("*");
    dataQuery = applyFilters(dataQuery);
    const { data, error } = await dataQuery
      .order(sortKey as any, {
        ascending: sortDir === "asc",
        nullsFirst: false,
      })
      .range(offset, offset + limit - 1);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // デバッグ用にどのテーブルに解決されたか返す（不要なら削除OK）
    return NextResponse.json({
      table_resolved: table,
      rows: data ?? [],
      total: total ?? 0,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: String(e?.message || e) },
      { status: 500 }
    );
  }
}
