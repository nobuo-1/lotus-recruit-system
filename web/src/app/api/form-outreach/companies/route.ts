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
    const tableParam = url.searchParams.get("table") || "prospects"; // prospects | rejected | similar
    const table =
      tableParam === "rejected"
        ? "form_prospects_rejected"
        : tableParam === "similar"
        ? "form_similar_sites"
        : "form_prospects";

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

    // フィルタ
    const q = (url.searchParams.get("q") || "").trim();
    const email = url.searchParams.get("email") || ""; // "", has, none
    const form = url.searchParams.get("form") || ""; // "", has, none
    const prefecturesCsv = (url.searchParams.get("prefectures") || "").trim();
    const industry = (url.searchParams.get("industry") || "").trim();
    const dateFrom = url.searchParams.get("date_from") || "";
    const dateTo = url.searchParams.get("date_to") || "";
    const matchedAddr = url.searchParams.get("matched_addr") || ""; // similar only

    const sb = await supabaseServer();

    /** 同じフィルタを両クエリへ適用する小関数 */
    const applyFilters = (qry: any) => {
      let base = qry.eq("tenant_id", tenantId);

      // キーワード
      if (q) {
        const like = `%${q}%`;
        if (table === "form_prospects") {
          base = base.or(
            `company_name.ilike.${like},website.ilike.${like},contact_email.ilike.${like}`
          );
        } else if (table === "form_prospects_rejected") {
          base = base.or(
            `company_name.ilike.${like},website.ilike.${like},contact_email.ilike.${like}`
          );
        } else {
          // similar
          base = base.or(
            `target_company_name.ilike.${like},found_company_name.ilike.${like},found_website.ilike.${like},contact_email.ilike.${like}`
          );
        }
      }

      // メール有無
      if (email === "has") {
        base = base.not("contact_email", "is", null).neq("contact_email", "");
      } else if (email === "none") {
        base = base.or("contact_email.is.null,contact_email.eq.");
      }

      // フォーム有無
      if (form === "has") {
        base = base
          .not("contact_form_url", "is", null)
          .neq("contact_form_url", "");
      } else if (form === "none") {
        base = base.or("contact_form_url.is.null,contact_form_url.eq.");
      }

      // 都道府県
      if (prefecturesCsv) {
        const prefs = prefecturesCsv
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        if (prefs.length) {
          base = base.overlaps("prefectures", prefs);
        }
      }

      // 業種
      if (industry) {
        const like = `%${industry}%`;
        if (table === "form_prospects") {
          base = base.ilike("industry", like);
        } else if (table === "form_prospects_rejected") {
          base = base.or(
            `industry_large.ilike.${like},industry_small.ilike.${like}`
          );
        }
        // similar は対象外
      }

      // 作成日 from/to
      if (dateFrom) base = base.gte("created_at", dateFrom);
      if (dateTo) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        base = base.lte("created_at", end.toISOString());
      }

      // similar: 住所一致
      if (
        table === "form_similar_sites" &&
        (matchedAddr === "true" || matchedAddr === "false")
      ) {
        base = base.eq("matched_addr", matchedAddr === "true");
      }

      return base;
    };

    // ---- 件数クエリ（最初の select で count/head を指定）----
    // v1/v2 どちらでも通るように options を any で渡す
    let countQuery = sb
      .from(table)
      .select("*", { count: "exact", head: true } as any);
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

    return NextResponse.json({ rows: data ?? [], total: total ?? 0 });
  } catch (e: any) {
    return NextResponse.json(
      { error: String(e?.message || e) },
      { status: 500 }
    );
  }
}
